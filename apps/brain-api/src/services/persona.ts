import { getPersona, getAllPersonas, Persona } from '../personas/definitions';
import { streamChatWithTools, Message } from './claude';
import { query } from '../db/connection';
import * as fs from 'fs';
import * as path from 'path';
import { BrainMode, coerceMode, getModePrompt } from './mode-controller.js';

// Re-export BrainMode for backward compat (callers importing from persona.ts still work)
export type { BrainMode };

const TEAM_BRAIN_ROOT = '/opt/team-brain';
const CLAUDE_API_PATH = path.join(TEAM_BRAIN_ROOT, 'CLAUDE-API.md');
const KNOWLEDGE_DIR = path.join(TEAM_BRAIN_ROOT, 'knowledge');
const AGENTS_DIR = path.join(TEAM_BRAIN_ROOT, 'agents');
const MAX_KNOWLEDGE_FILE_CHARS = 2000;
const MAX_KNOWLEDGE_TOTAL_CHARS = 10000;

/**
 * Load CLAUDE-API.md as base system prompt.
 * Falls back to minimal prompt if file missing.
 */
function loadBasePrompt(): string {
  try {
    return fs.readFileSync(CLAUDE_API_PATH, 'utf8');
  } catch {
    console.warn('[persona] CLAUDE-API.md not found, using fallback');
    return 'You are Brain, an AI assistant for Team Brain at Example Org.';
  }
}

/**
 * Load all .md files from knowledge/ directory.
 * Each file capped at MAX_KNOWLEDGE_FILE_CHARS, total at MAX_KNOWLEDGE_TOTAL_CHARS.
 */
function loadKnowledgeFiles(): string {
  try {
    if (!fs.existsSync(KNOWLEDGE_DIR)) return '';
    const files = fs.readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith('.md')).sort();
    if (files.length === 0) return '';

    const parts: string[] = [];
    let totalChars = 0;

    for (const file of files) {
      if (totalChars >= MAX_KNOWLEDGE_TOTAL_CHARS) break;
      const content = fs.readFileSync(path.join(KNOWLEDGE_DIR, file), 'utf8');
      const trimmed = content.length > MAX_KNOWLEDGE_FILE_CHARS
        ? content.slice(0, MAX_KNOWLEDGE_FILE_CHARS) + '\n[truncated]'
        : content;
      parts.push(trimmed);
      totalChars += trimmed.length;
    }

    return parts.length > 0 ? '\n\n---\n\n## Knowledge Base\n\n' + parts.join('\n\n') : '';
  } catch (err) {
    console.warn('[persona] Failed to load knowledge files:', err);
    return '';
  }
}

// Base prompt loaded once at startup (CLAUDE-API.md changes need a restart anyway).
const BASE_SYSTEM_PROMPT = loadBasePrompt();

// Knowledge files are regenerated nightly (ns-refresh-worldview) from live data, so we
// re-read them with a short TTL instead of caching once at startup — otherwise the fresh
// worldview wouldn't reach the running process until the next restart.
const KNOWLEDGE_TTL_MS = 15 * 60 * 1000;
let _knowledgeCache = loadKnowledgeFiles();
let _knowledgeLoadedAt = Date.now();
function getKnowledgeContext(): string {
  if (Date.now() - _knowledgeLoadedAt > KNOWLEDGE_TTL_MS) {
    _knowledgeCache = loadKnowledgeFiles();
    _knowledgeLoadedAt = Date.now();
  }
  return _knowledgeCache;
}

console.log(`[persona] Base prompt: ${BASE_SYSTEM_PROMPT.length} chars, Knowledge: ${_knowledgeCache.length} chars`);

// Legacy prompt fully replaced by CLAUDE-API.md — loaded at startup via loadBasePrompt()

// ─── Mode system ──────────────────────────────────────────────────────────────
// BrainMode, coerceMode, getModePrompt, MODE_PROMPTS — moved to mode-controller.ts (Sprint C)
// Re-exported above for backward compat. Use mode-controller.ts for new imports.

/**
 * Fetch resolved brand context for a site (site-specific overrides core brand).
 *
 * Conflict rule — newer version wins:
 *   1. For each asset_type, only the row with the highest version is used
 *      (tie-break: latest updated_at).  Older rows are kept as history but ignored.
 *   2. A site-specific row always overrides a global (site_id IS NULL) row of the
 *      same asset_type, regardless of version numbers.
 *   3. When ≥2 version rows exist for the same (site_id, asset_type), OR when both
 *      a global and a site-specific row exist for the same asset_type, a short Slovak
 *      note is appended so Brain can surface the ambiguity to the user.
 */
export async function getBrandContext(siteId: string): Promise<string> {
  // Core brand assets — newest version per asset_type first.
  const coreAssets = await query(
    `SELECT asset_type, title, content, version, updated_at,
            COUNT(*) OVER (PARTITION BY asset_type) AS version_count
     FROM brand_assets
     WHERE site_id IS NULL
     ORDER BY asset_type, version DESC, updated_at DESC`
  );

  // Build core map: only the first (newest) row per asset_type.
  const contextMap = new Map<string, {
    title: string;
    content: string;
    source: 'core' | 'site';
    hasMultipleVersions: boolean;
    hasBothScopes: boolean;
  }>();

  for (const a of coreAssets) {
    if (!contextMap.has(a.asset_type)) {
      contextMap.set(a.asset_type, {
        title: a.title,
        content: a.content,
        source: 'core',
        hasMultipleVersions: Number(a.version_count) > 1,
        hasBothScopes: false,
      });
    }
  }

  // Site-specific assets — newest version per asset_type first.
  const siteAssets = await query(
    `SELECT asset_type, title, content, version, updated_at,
            COUNT(*) OVER (PARTITION BY asset_type) AS version_count
     FROM brand_assets
     WHERE site_id = $1
     ORDER BY asset_type, version DESC, updated_at DESC`,
    [siteId]
  );

  for (const a of siteAssets) {
    const existing = contextMap.get(a.asset_type);
    if (existing && existing.source === 'site') continue; // already have newest site row for this type
    const hasMultipleVersions = Number(a.version_count) > 1 ||
      (existing?.hasMultipleVersions ?? false);
    const hasBothScopes = existing?.source === 'core'; // core existed → both scopes present
    contextMap.set(a.asset_type, {
      title: a.title,
      content: a.content,
      source: 'site',
      hasMultipleVersions,
      hasBothScopes,
    });
  }

  if (contextMap.size === 0) return '';

  // Get site name
  const siteRows = await query('SELECT name, domain FROM sites WHERE id = $1', [siteId]);
  const site = siteRows[0];

  const CONFLICT_NOTE =
    '(pozn.: existuje viac verzií tohto brand pravidla — používam najnovšiu; ' +
    'ak si nie si istý/á ktorá platí, over s používateľom)';

  const parts: string[] = [];
  if (site) {
    parts.push(`## Active Site: ${site.name} (${site.domain})\n`);
  }
  for (const [, data] of contextMap) {
    const needsNote = data.hasMultipleVersions || data.hasBothScopes;
    const noteBlock = needsNote ? `\n> ${CONFLICT_NOTE}` : '';
    parts.push(`### ${data.title}\n${data.content}${noteBlock}\n`);
  }
  return parts.join('\n');
}

/**
 * Build a system prompt that combines:
 * 1. CLAUDE-API.md (base capabilities + tools)
 * 2. Knowledge files (team context)
 * 3. Brand context (from DB, per-site)
 * 4. Brand/agent context (passed from chat.ts)
 * 5. Persona overlay (if active)
 */
export function getSystemPrompt(personaId?: string, brandContext?: string, memoryContext?: string, mode?: BrainMode): string {
  let prompt = BASE_SYSTEM_PROMPT + getKnowledgeContext();

  // Append mode-specific prompt (Brain Pt. II Sprint 1)
  const modePrompt = getModePrompt(mode);
  if (modePrompt) {
    prompt += `\n\n---\n\n${modePrompt}`;
  }

  // Append memory context (brain_memories — learned preferences, patterns)
  if (memoryContext) {
    prompt += `\n\n---\n\n${memoryContext}`;
  }

  // Append brand/agent context if provided (comes from chat.ts with clear section headings)
  if (brandContext) {
    prompt += `\n\n---\n\n${brandContext}`;
  }

  if (!personaId) {
    return prompt;
  }

  const persona = getPersona(personaId);
  if (!persona) {
    return prompt;
  }

  return `${prompt}

---

## Active Persona: ${persona.icon} ${persona.name} (${persona.nameLocalized})

${persona.systemPrompt}

When responding, adopt this persona's perspective while maintaining your core capabilities and tool access. Your tone and analysis should reflect this persona's worldview.`;
}

/**
 * Run the same question through multiple personas in parallel.
 * Returns an array of responses, one per persona.
 */
export async function runMultiPersonaAnalysis(
  question: string,
  personaIds: string[],
  context?: string,
): Promise<Array<{ personaId: string; persona: Persona; content: string }>> {
  const validPersonas = personaIds
    .map(id => ({ id, persona: getPersona(id) }))
    .filter((p): p is { id: string; persona: Persona } => !!p.persona);

  if (validPersonas.length === 0) {
    throw new Error('No valid persona IDs provided');
  }

  const messages: Message[] = [];
  if (context) {
    messages.push({ role: 'user', content: `Context: ${context}` });
    messages.push({ role: 'assistant', content: 'Understood. I have the context. What would you like me to analyze?' });
  }
  messages.push({ role: 'user', content: question });

  // Run all personas in parallel
  const results = await Promise.all(
    validPersonas.map(async ({ id, persona }) => {
      const chunks: string[] = [];

      for await (const chunk of streamChatWithTools({
        messages,
        personaId: id,
        enableTools: false, // no tools in deliberation to keep it fast
      })) {
        if (typeof chunk === 'string') {
          chunks.push(chunk);
        }
      }

      return {
        personaId: id,
        persona,
        content: chunks.join(''),
      };
    }),
  );

  return results;
}

export { getAllPersonas, getPersona };
