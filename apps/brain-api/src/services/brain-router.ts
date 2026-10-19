/**
 * BrainRouter — registry-driven keyword + complexity routing.
 *
 * Sprint D (2026-05-22): replaces hardcoded AGENT_KEYWORDS in knowledge.ts
 * with keyword index built from definitions.ts AgentDef.keywords[].
 *
 * Two public functions:
 *   routeByKeyword(message)    → best specialist AgentId or null
 *   routeByComplexity(message) → complexity analysis + recommended AgentId
 *
 * Both are consumed by action-resolver.ts Tier 3 (complexity) and Tier 4 (keyword).
 * The old detectAgent() / detectComplexity() in knowledge.ts remain as legacy fallback.
 *
 * Scoring model:
 *   - Each keyword phrase in AgentDef.keywords[] contributes word_count points on match
 *   - Multi-word phrases score proportionally higher (e.g. "core web vitals" = 3 pts)
 *   - Minimum score threshold: MATCH_THRESHOLD (configurable)
 *   - Tie-break: highest scoring agent wins; if equal — first in specialist order
 *
 * Registry update path:
 *   Edit definitions.ts AgentDef.keywords[] → router picks it up on next restart.
 *   No code changes required in brain-router.ts or action-resolver.ts.
 */

import { getSpecialistAgents } from '../agents/definitions.js';
import type { SpecialistAgentId } from '../agents/definitions.js';
import { getCustomAgents } from './custom-agents.js';

// ─── Config ───────────────────────────────────────────────────────────────────

/** Minimum keyword match score to auto-select an agent (avoids noise). */
const MATCH_THRESHOLD = 2;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KeywordRouteResult {
  agentId: string; // SpecialistAgentId or custom agent slug
  score: number;
  matchedKeywords: string[];
}

export interface ComplexityRouteResult {
  isComplex: boolean;
  agentId: SpecialistAgentId | null;
  reasons: string[];
  estimatedTools: number;
}

// ─── Keyword index (built once, invalidated on CRUD) ─────────────────────────

interface KeywordEntry {
  agentId: string; // SpecialistAgentId or custom slug
  phrase: string;
  weight: number; // word count of phrase
}

let _index: KeywordEntry[] | null = null;

function getKeywordIndex(): KeywordEntry[] {
  if (_index) return _index;

  _index = [];

  // 1. Base specialist keywords (definitions.ts)
  for (const def of getSpecialistAgents()) {
    for (const phrase of def.keywords) {
      _index.push({
        agentId: def.id,
        phrase: phrase.toLowerCase(),
        weight: phrase.trim().split(/\s+/).length,
      });
    }
  }

  // 2. Custom agent keywords (DB cache — added after loadCustomAgentsIntoCache())
  for (const custom of getCustomAgents()) {
    for (const phrase of custom.keywords) {
      _index.push({
        agentId: custom.slug,
        phrase: phrase.toLowerCase(),
        weight: phrase.trim().split(/\s+/).length,
      });
    }
  }

  return _index;
}

/** Invalidate index cache (call after runtime keyword updates — rare). */
export function invalidateRouterIndex(): void {
  _index = null;
}

// ─── routeByKeyword ───────────────────────────────────────────────────────────

/**
 * Score the message against each specialist agent's keyword list.
 * Returns the best match if score ≥ MATCH_THRESHOLD, null otherwise.
 *
 * Scoring:
 *   - Each matched phrase adds its word_count to the agent's score
 *   - Multi-word phrases naturally score higher (signal strength)
 *   - Minimum threshold prevents spurious matches on common words
 */
export function routeByKeyword(message: string): KeywordRouteResult | null {
  if (!message || typeof message !== 'string') return null;

  const msg = message.toLowerCase();
  const index = getKeywordIndex();

  // Accumulate scores per agent
  const scores = new Map<string, { score: number; matched: string[] }>();

  for (const entry of index) {
    if (msg.includes(entry.phrase)) {
      const existing = scores.get(entry.agentId) || { score: 0, matched: [] };
      existing.score += entry.weight;
      existing.matched.push(entry.phrase);
      scores.set(entry.agentId, existing);
    }
  }

  if (scores.size === 0) return null;

  // Find winner
  let best: { agentId: string; score: number; matched: string[] } | null = null;
  for (const [agentId, data] of scores.entries()) {
    if (!best || data.score > best.score) {
      best = { agentId, ...data };
    }
  }

  if (!best || best.score < MATCH_THRESHOLD) return null;

  return {
    agentId: best.agentId,
    score: best.score,
    matchedKeywords: best.matched,
  };
}

// ─── routeByComplexity ────────────────────────────────────────────────────────

/**
 * Detect structural complexity in a message (multi-step, multi-domain, multi-output).
 * Maps complexity signals to the most appropriate specialist agent.
 *
 * Complexity signals (require ≥2 reasons OR ≥4 estimated tools):
 *   multi-domain     → 2+ msg domains mentioned → batch
 *   full-audit       → kompletný audit/report    → auditor
 *   cross-source     → GSC + Ahrefs combined     → analyst
 *   multi-file       → multiple output formats   → batch
 *   structured-steps → 3+ numbered/lettered steps → brief
 *   content-planning → content plan + execute    → brief
 *   multi-step       → explicit multi-step lang  → brief
 *   analyze-generate → analyze + generate combo  → analyst
 *
 * Agent mapping (priority order when multiple reasons apply):
 *   full-audit   → auditor
 *   cross-source → analyst
 *   analyze-gen  → analyst
 *   multi-domain → batch
 *   multi-file   → batch
 *   planning*    → brief
 *   multi-step   → brief
 *   default      → brief (orchestrate the complex task)
 */
export function routeByComplexity(message: string): ComplexityRouteResult {
  const msg = message.toLowerCase();
  const reasons: string[] = [];
  let toolCount = 0;

  // ── Signal detection ─────────────────────────────────────────────────────

  // Multi-domain: 2+ msg domains mentioned
  const domains = ['example-org', 'example-dev', 'example-qa'].filter(d => msg.includes(d));
  if (domains.length >= 2) {
    reasons.push('multi-domain');
    toolCount += domains.length * 2;
  }

  // Full audit / complete report
  if (/komplet.*report|komplet.*audit|komplex.*report|komplex.*audit|full.*audit|pln.*audit|hlbkov.*anal|celkov.*anal|komplet.*anal/i.test(msg)) {
    reasons.push('full-audit');
    toolCount += 4;
  }

  // Cross-source: GSC + Ahrefs
  if (/gsc.*ahrefs|ahrefs.*gsc|cross.?check|porovnaj.*zdroj/i.test(msg)) {
    reasons.push('cross-source');
    toolCount += 3;
  }

  // Multi-file output
  const filePatterns = [
    /\d+.*s[úu]bor|\d+.*file/i,
    /xlsx.*docx|docx.*xlsx|xlsx.*csv|csv.*xlsx/i,
    /exportuj.*a.*vytvor|vytvor.*a.*exportuj|save.*and.*generate/i,
  ];
  if (filePatterns.some(p => p.test(msg))) {
    reasons.push('multi-file-output');
    toolCount += 3;
  }

  // Structured multi-step (3+ numbered steps)
  const stepMatches = (message.match(/^[\s]*[1-9]\.|^[\s]*[a-z]\)/gm) || []).length;
  if (stepMatches >= 3) {
    reasons.push('structured-multi-step');
    toolCount += stepMatches;
  }

  // Content planning + execution combo
  if (/content.*plan.*a.*vykon|plan.*obsah.*a.*brief|redak.*plan.*komplet/i.test(msg)) {
    reasons.push('content-planning');
    toolCount += 6;
  }

  // Explicit multi-step language
  if (/viac.*krok|multi.?step|krok.*za.*krok|postupn|orchestr/i.test(msg)) {
    reasons.push('multi-step');
    toolCount += 3;
  }

  // Analyze + generate combo
  if (/analyz.*a.*vygeneru|analyz.*a.*vytvor|analyzuj.*vygeneru|analyzuj.*vytvor/i.test(msg)) {
    reasons.push('analyze-and-generate');
    toolCount += 2;
  }

  // ── Complexity gate ───────────────────────────────────────────────────────

  const isComplex = reasons.length >= 2 || toolCount >= 4;
  if (!isComplex) return { isComplex: false, agentId: null, reasons, estimatedTools: toolCount };

  // ── Agent mapping (priority order) ────────────────────────────────────────

  let agentId: SpecialistAgentId = 'brief'; // safe default for complex tasks

  if (reasons.includes('full-audit')) {
    agentId = 'auditor';
  } else if (reasons.includes('cross-source') || reasons.includes('analyze-and-generate')) {
    agentId = 'analyst';
  } else if (reasons.includes('multi-domain') || reasons.includes('multi-file-output')) {
    agentId = 'batch';
  } else if (
    reasons.includes('content-planning') ||
    reasons.includes('structured-multi-step') ||
    reasons.includes('multi-step')
  ) {
    agentId = 'brief';
  }

  return { isComplex: true, agentId, reasons, estimatedTools: toolCount };
}

// ─── Debug helper ─────────────────────────────────────────────────────────────

/**
 * Return all keyword matches and scores for a message (for logging/debugging).
 * Not used in the hot path — call from admin/debug endpoints only.
 */
export function debugRoute(message: string): Record<string, { score: number; matched: string[] }> {
  const msg = message.toLowerCase();
  const index = getKeywordIndex();
  const scores: Record<string, { score: number; matched: string[] }> = {};

  for (const entry of index) {
    if (msg.includes(entry.phrase)) {
      if (!scores[entry.agentId]) scores[entry.agentId] = { score: 0, matched: [] };
      scores[entry.agentId].score += entry.weight;
      scores[entry.agentId].matched.push(entry.phrase);
    }
  }

  return scores;
}
