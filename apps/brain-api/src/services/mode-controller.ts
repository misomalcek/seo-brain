/**
 * ModeController — Brain orthogonal 4-mode system (Brain Pt. II Sprint 1)
 *
 * Modes describe HOW Brain responds (depth, speed, oversight),
 * independent of task type (agent) or reasoning lens (persona).
 *
 * Single source of truth for BrainMode — previously split between
 * persona.ts and claude.ts (duplicate definition). Sprint C consolidation.
 *
 * Consumers:
 *   persona.ts   — injects mode prompt into system prompt
 *   claude.ts    — ChatRequest.mode type
 *   definitions.ts — AgentDef.modes[] type
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Orthogonal 4-mode system — maps HOW Brain responds.
 * Independent of agent (task type) and persona (reasoning lens).
 *
 * default  — standard response; base rules apply, no overlay
 * extended — depth + thoroughness over brevity; comprehensive analysis
 * fast     — minimum overhead; direct answer, parallel tool calls
 * confirm  — explicit user approval before any state-changing action
 */
export type BrainMode = 'default' | 'extended' | 'fast' | 'confirm';

// ─── Legacy coercion ──────────────────────────────────────────────────────────

/**
 * Map legacy mode names (consult/plan/write/expert/batch) to canonical BrainMode.
 * Keeps backward compat when old frontend or API clients send legacy values.
 */
const LEGACY_MODE_MAP: Record<string, BrainMode> = {
  consult: 'default',
  plan: 'default',    // PLAN now lives as a separate workflow node, not a mode overlay
  write: 'extended',  // WRITE depth → Extended
  expert: 'extended', // EXPERT panel → Extended (or future companion skill)
  batch: 'fast',      // BATCH throughput → Fast
};

/**
 * Coerce any input string to a valid BrainMode.
 * Unknown/missing values default to 'default'.
 */
export function coerceMode(input?: string): BrainMode {
  if (!input) return 'default';
  if (input === 'default' || input === 'extended' || input === 'fast' || input === 'confirm') {
    return input;
  }
  return LEGACY_MODE_MAP[input] ?? 'default';
}

// ─── Mode prompts ─────────────────────────────────────────────────────────────

const MODE_PROMPTS: Record<BrainMode, string> = {
  default: '', // base rules apply, no overlay

  extended: `## ACTIVE MODE: EXTENDED

You are in EXTENDED mode — depth + thoroughness over brevity.

- Length limits relax: produce comprehensive analysis, full-length content (articles 2000+ words when content is the deliverable), multi-perspective synthesis.
- When task allows, surface 2-3 alternatives with trade-offs and rationale.
- Include reasoning + counter-arguments for non-trivial decisions.
- Pull more context: query memory layer when relevant, check related knowledge files, scan adjacent code/data sources.
- Apply when user signals: "vysvetli podrobne", "podrobne", "vysvetli do hĺbky", "comprehensive", "all angles", "explain thoroughly", "full analysis".
- Anti-hallucination rules still apply — depth means more grounded reasoning, NOT padding with fake data.
- Word counts at end of content pieces (articles, briefs, reports).`,

  fast: `## ACTIVE MODE: FAST

You are in FAST mode — minimum overhead, direct answer.

- One-shot response. Skip exploration phase. Skip reasoning trace.
- Skip preamble ("Pomôžem ti s...", "Let me explain..."). Go straight to the result.
- For tool calls: parallel invocations whenever possible. Skip clarifying questions — apply smart defaults (Slovak language, sk country code, default limits).
- Output: bullet points or 1-3 short paragraphs. Skip footnotes, sources, alternative angles unless explicitly asked.
- Apply when user signals: "rýchlo", "stručne", "fast", "quick", "tldr", "v skratke", or task is mechanical (data fetch, single edit, factual lookup, status check).
- Quality discipline still applies — Fast ≠ careless, Fast = focused.`,

  confirm: `## ACTIVE MODE: CONFIRM

You are in CONFIRM mode — explicit user approval before any state-changing action.

- Before any: file write, file edit, file delete, command execution, deploy, git commit, git push, DB write, external API mutation → STOP and ask.
- Format: "Pôjdem [action] na [target]. Dôvod: [why]. OK? [Áno / Nie / Upraviť]"
- After approval, execute that ONE step, then stop and ask again before the next state-changing step.
- Read-only operations don't need confirmation (file reads, DB queries, status checks, lints, type-checks, dry-runs).
- Apply when user wants tight oversight: production changes, irreversible operations, learning new code paths, working with secrets, or explicit "potvrdzuj každý krok".
- Override: user can say "go all without asking" or "skip confirms" to release subsequent confirms within the same task. The release is task-scoped, not session-scoped.`,
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return the mode-specific system prompt overlay for injection into getSystemPrompt().
 * Returns empty string for 'default' (no overlay needed).
 */
export function getModePrompt(mode?: BrainMode | string): string {
  const coerced = coerceMode(mode);
  if (coerced === 'default') return '';
  return MODE_PROMPTS[coerced] ?? '';
}

/**
 * All valid canonical mode IDs — for validation and UI rendering.
 */
export const BRAIN_MODES: readonly BrainMode[] = ['default', 'extended', 'fast', 'confirm'] as const;

/**
 * Human-readable labels for each mode (Slovak UI labels).
 */
export const MODE_LABELS: Record<BrainMode, string> = {
  default: 'Štandard',
  extended: 'Rozšírený',
  fast: 'Rýchly',
  confirm: 'S potvrdením',
};
