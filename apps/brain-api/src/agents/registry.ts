/**
 * AgentRegistry — singleton that bridges TypeScript agent definitions with .md prompt bodies.
 *
 * Architecture:
 *   definitions.ts  = source of truth for metadata (tools, model, color, keywords, absorbs)
 *   agents/*.md     = pure prompt bodies (no YAML frontmatter after migration)
 *   registry.ts     = merges both at runtime, provides filtered tools for claude.ts
 *
 * The registry replaces .md YAML frontmatter for the 12 canonical agents.
 * Sub-agents (legacy) still loaded via knowledge.ts for backward compat,
 * but their knowledge body can be appended to parent prompt via getSubAgentKnowledge().
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  AGENTS,
  getAgent,
  getSpecialistAgents,
  getBrainCoreAgents,
  resolveAbsorbed,
} from './definitions.js';
import type { AgentDef, AgentId, AnyAgentDef, CustomAgentDef } from './definitions.js';
import {
  getCustomAgent,
  getCustomAgents as _getCustomAgents,
  getAgentExtension,
} from '../services/custom-agents.js';
import { AVAILABLE_TOOLS } from '../tools/definitions.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResolvedAgentForChat {
  def: AnyAgentDef;
  /** Stripped prompt body (no YAML frontmatter) */
  prompt: string;
  /** Optional: sub-agent knowledge appended when a legacy ID was requested */
  subAgentContext?: string;
  /** Filtered tool schemas ready for Anthropic API */
  filteredTools: typeof AVAILABLE_TOOLS;
  toolIds: string[] | 'ALL';
}

/** Lightweight card for UI rendering (AgentBrowser, etc.) */
export interface AgentCard {
  id: string;
  name: string;
  nameLocalized: string;
  description: string;
  descriptionLocalized: string;
  icon: string;
  color: string;
  model: string;
  type: string;
  toolCount: number | 'ALL';
  parent?: string;
  absorbs: string[];
}

// AgentInfo shape expected by legacy knowledge.ts consumers
export interface AgentInfoCompat {
  id: string;
  name: string;
  description: string;
  tools: string[];
  model: string;
  filePath: string;
  visibility: 'all' | 'admin';
  type: string;
  parent?: string;
  color?: string;
}

// ─── Internal cache ───────────────────────────────────────────────────────────

const promptCache = new Map<string, string>();

// ─── Path helpers ─────────────────────────────────────────────────────────────

const TEAM_BRAIN_ROOT = process.env.TEAM_BRAIN_ROOT || '/opt/team-brain';
const AGENTS_DIR = path.join(TEAM_BRAIN_ROOT, 'agents');

function resolvePromptPath(def: AgentDef): string {
  if (def.mdFile) return path.join(TEAM_BRAIN_ROOT, def.mdFile);
  return path.join(AGENTS_DIR, `${def.id}.md`);
}

function resolveSubAgentPath(legacyId: string): string {
  return path.join(AGENTS_DIR, `${legacyId}.md`);
}

// ─── Frontmatter stripper ─────────────────────────────────────────────────────

/**
 * Strip YAML frontmatter from markdown content.
 * Handles both migrated (no frontmatter) and legacy (with frontmatter) files.
 */
export function stripFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content.trim();
  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) return content.trim();
  return content.substring(endIndex + 3).trim();
}

// ─── Prompt loader ────────────────────────────────────────────────────────────

function loadPrompt(def: AgentDef): string {
  if (promptCache.has(def.id)) return promptCache.get(def.id)!;

  const mdPath = resolvePromptPath(def);
  try {
    const raw = fs.readFileSync(mdPath, 'utf8');
    const prompt = stripFrontmatter(raw);
    promptCache.set(def.id, prompt);
    return prompt;
  } catch {
    // Fallback if .md not yet present
    const fallback = `# ${def.name}\n\n${def.descriptionLocalized}`;
    promptCache.set(def.id, fallback);
    return fallback;
  }
}

function loadSubAgentKnowledge(legacyId: string): string | undefined {
  const p = resolveSubAgentPath(legacyId);
  if (!fs.existsSync(p)) return undefined;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const body = stripFrontmatter(raw);
    // Guard: sub-agent bodies are appended as extra context — cap at 4000 chars
    return body.length > 4000 ? body.slice(0, 4000) + '\n\n[sub-agent instructions truncated]' : body;
  } catch {
    return undefined;
  }
}

// ─── Tool filtering ───────────────────────────────────────────────────────────

/**
 * Return the subset of AVAILABLE_TOOLS allowed for this agent.
 * 'ALL' → full tool list (no filtering).
 * string[] → intersect with AVAILABLE_TOOLS by name.
 */
export function filterTools(agentToolIds: string[] | 'ALL'): typeof AVAILABLE_TOOLS {
  if (agentToolIds === 'ALL') return AVAILABLE_TOOLS;
  const allowed = new Set(agentToolIds);
  return AVAILABLE_TOOLS.filter(t => allowed.has(t.name)) as typeof AVAILABLE_TOOLS;
}

// ─── Registry class ───────────────────────────────────────────────────────────

export class AgentRegistry {
  private static _instance: AgentRegistry;

  static getInstance(): AgentRegistry {
    if (!AgentRegistry._instance) AgentRegistry._instance = new AgentRegistry();
    return AgentRegistry._instance;
  }

  // ── Resolution (chat path) ─────────────────────────────────────────────────

  /**
   * Resolve any agent ID (specialist, brain-core, or legacy sub-agent) for chat.
   * Returns: def + filtered tools + prompt + optional sub-agent context.
   *
   * Priority:
   *   1. Direct match in AGENTS (specialist or brain-core)
   *   2. Legacy ID → resolveAbsorbed() → parent specialist
   *   3. null (unknown ID — caller falls back to legacy knowledge.ts path)
   */
  resolveForChat(idOrLegacy: string): {
    def: AnyAgentDef;
    prompt: string;
    subAgentContext: string | undefined;
    filteredTools: typeof AVAILABLE_TOOLS;
    toolIds: string[] | 'ALL';
  } | null {
    const directDef = getAgent(idOrLegacy);
    if (directDef) {
      return {
        def: directDef,
        prompt: loadPrompt(directDef),
        subAgentContext: undefined,
        filteredTools: filterTools(directDef.tools),
        toolIds: directDef.tools,
      };
    }

    // Legacy ID → find absorbing parent
    const parentDef = resolveAbsorbed(idOrLegacy);
    if (parentDef) {
      // Load sub-agent specific knowledge to append
      const subAgentContext = loadSubAgentKnowledge(idOrLegacy);
      return {
        def: parentDef,
        prompt: loadPrompt(parentDef),
        subAgentContext,
        filteredTools: filterTools(parentDef.tools),
        toolIds: parentDef.tools,
      };
    }

    // 3. Custom agent from DB cache
    const customRow = getCustomAgent(idOrLegacy);
    if (customRow) {
      const def: CustomAgentDef = {
        id: customRow.slug,
        name: customRow.name,
        nameLocalized: customRow.name,
        description: customRow.description,
        descriptionLocalized: customRow.description,
        icon: customRow.icon,
        color: customRow.color,
        model: customRow.model,
        type: 'custom',
        tools: customRow.tools.length > 0 ? customRow.tools : 'ALL',
        modes: ['default', 'extended'],
        keywords: customRow.keywords,
        absorbs: [],
        isCustom: true,
      };
      return {
        def,
        prompt: customRow.system_prompt,
        subAgentContext: undefined,
        filteredTools: filterTools(def.tools),
        toolIds: def.tools,
      };
    }

    return null;
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────

  /** All 6 specialist agents as lightweight cards */
  getSpecialistCards(): AgentCard[] {
    return getSpecialistAgents().map(d => this._toCard(d));
  }

  /** All brain-core agents as lightweight cards */
  getBrainCoreCards(): AgentCard[] {
    return getBrainCoreAgents().map(d => this._toCard(d));
  }

  /** All canonical agents (specialists + brain-core) as AgentInfoCompat (for knowledge.ts) */
  getAllAsAgentInfo(): AgentInfoCompat[] {
    return Object.values(AGENTS).map(d => this._toAgentInfo(d));
  }

  /** Convert a def to knowledge.ts-compatible AgentInfo */
  toAgentInfo(def: AnyAgentDef): AgentInfoCompat {
    if ('isCustom' in def && def.isCustom) {
      // Custom agent — synthetic AgentInfoCompat
      return {
        id: def.id,
        name: def.nameLocalized,
        description: def.descriptionLocalized,
        tools: def.tools === 'ALL' ? ['*'] : def.tools,
        model: def.model,
        filePath: '',
        visibility: 'all',
        type: 'sub-agent',
        color: def.color,
      };
    }
    return this._toAgentInfo(def as AgentDef);
  }

  /** Check if an ID is a known canonical agent or legacy absorbed agent */
  knows(id: string): boolean {
    return id in AGENTS || resolveAbsorbed(id) !== undefined || !!getCustomAgent(id);
  }

  /** True if the ID belongs to a DB-managed custom agent (not a base specialist) */
  isCustom(id: string): boolean {
    return !!getCustomAgent(id);
  }

  /** All custom agents from DB cache as AgentCard[] */
  getCustomAgentCards(): AgentCard[] {
    return _getCustomAgents().map(a => ({
      id: a.slug,
      name: a.name,
      nameLocalized: a.name,
      description: a.description,
      descriptionLocalized: a.description,
      icon: a.icon,
      color: a.color,
      model: a.model,
      type: 'custom',
      toolCount: a.tools.length === 0 ? 'ALL' as const : a.tools.length,
      absorbs: [],
    }));
  }

  /**
   * Specialist cards with any DB extension merged in.
   * Overrides descriptionLocalized + appends extra keywords for routing.
   */
  getSpecialistCardsWithExtensions(): (AgentCard & { hasExtension: boolean })[] {
    return getSpecialistAgents().map(d => {
      const ext = getAgentExtension(d.id);
      const card = this._toCard(d);
      return {
        ...card,
        descriptionLocalized: ext?.custom_description ?? card.descriptionLocalized,
        hasExtension: !!ext,
      };
    });
  }

  /** Flush prompt cache (useful after admin edits .md files) */
  invalidateCache(id?: string): void {
    if (id) {
      promptCache.delete(id);
    } else {
      promptCache.clear();
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private _toCard(def: AgentDef): AgentCard {
    return {
      id: def.id,
      name: def.name,
      nameLocalized: def.nameLocalized,
      description: def.description,
      descriptionLocalized: def.descriptionLocalized,
      icon: def.icon,
      color: def.color,
      model: def.model,
      type: def.type,
      toolCount: def.tools === 'ALL' ? 'ALL' : def.tools.length,
      absorbs: def.absorbs,
    };
  }

  private _toAgentInfo(def: AgentDef): AgentInfoCompat {
    const agentsDir = AGENTS_DIR;
    const typeMap: Record<string, string> = {
      specialist: 'master',
      'brain-core': 'utility',
    };
    return {
      id: def.id,
      name: def.nameLocalized,
      description: def.descriptionLocalized,
      tools: def.tools === 'ALL' ? ['*'] : def.tools,
      model: def.model,
      filePath: resolvePromptPath(def),
      visibility: 'all',
      type: typeMap[def.type] || def.type,
      color: def.color,
    };
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const agentRegistry = AgentRegistry.getInstance();
