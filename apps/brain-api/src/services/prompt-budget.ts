import fs from 'fs';
import path from 'path';
import { brainRoot } from '../paths';
import { AVAILABLE_TOOLS } from '../tools/definitions';

/**
 * Phase 1 token budget (hive assignment 288).
 * Tier A is the frozen prefix. Tier B playbooks load only for the tools
 * selected this turn. Tier C (the stale tool list and the action menu) is omitted.
 */

const TIER_A = [
  'Company',
  'Domains & Agents',
  'Tool Strategy',
  'CRITICAL: Focus & Brevity',
  'CRITICAL: Data Transparency',
  'CRITICAL: Anti-Hallucination Hard Rules',
  'Response Rules',
  'Date Ranges',
];

/** Playbook heading substring -> tool names or prefixes (a trailing _ matches a prefix). */
const PLAYBOOKS: { heading: string; tools: string[]; when?: RegExp }[] = [
  { heading: 'GA4 Tool Routing Patterns', tools: ['ga4_'] },
  { heading: 'Hive Recall', tools: ['context_search'], when: /\b(remember|recall|what do we know|our notes|memory)\b/i },
  { heading: 'GSC Data Strategy', tools: ['gsc_'] },
  { heading: 'Schema Audit Mandatory Pattern', tools: ['web_render', 'gsc_tech_seo'] },
  { heading: 'llm-not-calculator', tools: ['code_execute'], when: /\b(calculate|sum|average|total|percent|median|spreadsheet math)\b/i },
  { heading: 'Ahrefs Limits', tools: ['ahrefs_'] },
  { heading: 'GSC', tools: ['gsc_'] },
  { heading: 'read_user_file', tools: ['read_user_file'], when: /\b(file|csv|xlsx|export|spreadsheet)\b/i },
  { heading: 'Cannibalization Detection', tools: ['gsc_'] },
  { heading: 'gsc_compare_periods Usage', tools: ['gsc_compare_periods'] },
  { heading: 'Brain Memory', tools: ['context_search'], when: /\b(remember|memory)\b/i },
  { heading: 'Brand & Context Resources', tools: ['context_search'], when: /\b(brand|guideline|tone of voice)\b/i },
];

const ALWAYS = [
  'read_user_file',
  'save_user_file',
  'code_execute',
  'context_search',
  'articles_search',
  'articles_similar',
  'get_current_date',
];

export const OVERVIEW_RE = /\b(overview|data sources|within your reach|what can you (see|access|reach))\b/i;

const GROUPS: { re: RegExp; tools: string[] }[] = [
  { re: OVERVIEW_RE, tools: ['gsc_search_analytics', 'ga4_traffic_overview', 'lighthouse_audit'] },
  { re: /\b(gsc|search console|impression|queries|query data|cannibali)/i, tools: ['gsc_'] },
  { re: /\b(ga4|google analytics|sessions|pageviews|realtime|real-time)\b/i, tools: ['ga4_'] },
  { re: /\b(ahrefs|backlink|domain rating|referring domain|organic keyword)/i, tools: ['ahrefs_'] },
  { re: /\b(pagespeed|page speed|lighthouse|core web vital|\bcrux\b)/i, tools: ['lighthouse_audit'] },
  { re: /\b(cloudflare|edge traffic|unique visitors|requests last)\b/i, tools: ['cloudflare_zone_analytics'] },
  { re: /\b(web search|fetch (the |this )?url|render|schema audit|json-ld)\b/i, tools: ['web_search', 'web_fetch', 'web_render'] },
  { re: /\b(google organic|organic results|serp|kto rankuje|who ranks|ai mode)\b/i, tools: ['google_organic', 'google_ai_mode'] },
  { re: /\b(content calendar|editorial calendar)\b/i, tools: ['content_calendar'] },
  { re: /\b(plan (this|the) task|step by step plan)\b/i, tools: ['plan_task'] },
  { re: /\b(documentation|docs query)\b/i, tools: ['docs_query'] },
  { re: /\b(knowledge graph|shortest path|what connects)\b/i, tools: ['knowledge_graph_query'] },
  { re: /\b(manage agent|manage persona|create an agent|create a persona)\b/i, tools: ['manage_agent', 'manage_persona'] },
];

const ESCALATE = /do not have a tool|don't have a tool|dont have a tool|no tool for that/i;

type Section = { heading: string; body: string };

let sections: Section[] | null = null;
let preamble = '';

function promptFile(): string {
  const bundled = process.env.SEO_BRAIN_PROMPT_FILE;
  if (bundled && fs.existsSync(bundled)) return bundled;
  return path.join(brainRoot(), 'CLAUDE-API.md');
}

function loadSections(): void {
  const raw = fs.readFileSync(promptFile(), 'utf8');
  const parts = raw.split(/\n(?=## )/);
  preamble = parts[0].startsWith('# ') ? parts[0].trim() : '';
  sections = parts
    .filter(p => p.startsWith('## '))
    .map(p => {
      const nl = p.indexOf('\n');
      return { heading: p.slice(3, nl).trim(), body: p.trim() };
    });
}

function allSections(): Section[] {
  if (!sections) loadSections();
  return sections || [];
}

function matches(selected: string[], keys: string[]): boolean {
  return keys.some(key => {
    if (key.endsWith('_')) return selected.some(name => name.startsWith(key));
    return selected.includes(key);
  });
}

/** Frozen prefix. Byte-stable across turns. */
export function tierAPrompt(): string {
  const want = new Set(TIER_A);
  const picked = allSections().filter(s => want.has(s.heading));
  const ordered = TIER_A.map(h => picked.find(s => s.heading === h)?.body).filter(Boolean);
  return [preamble, ...ordered].filter(Boolean).join('\n\n');
}

/** Playbooks for the tools actually sent this turn. */
export function tierBPrompt(toolNames: string[], userText = ''): string {
  const text = allSections().map(s => s.body).join('\n\n');
  const ga4 = text.split('### GA4 Tool Routing Patterns')[1]?.split('\n## ')[0];
  const blocks: string[] = [];
  if (ga4 && matches(toolNames, ['ga4_'])) {
    blocks.push('### GA4 Tool Routing Patterns' + ga4.trimEnd());
  }
  for (const book of PLAYBOOKS) {
    if (book.heading === 'GA4 Tool Routing Patterns') continue;
    if (!matches(toolNames, book.tools)) continue;
    if (book.when && !book.when.test(userText)) continue;
    const cleaned = book.heading.replace(/^## /, '').trim();
    const exact = allSections().find(s => s.heading === cleaned);
    const section = exact || (cleaned.length >= 12 ? allSections().find(s => s.heading.includes(cleaned)) : undefined);
    if (section && !blocks.includes(section.body)) blocks.push(section.body);
  }
  return blocks.join('\n\n');
}

function lastUserText(messages: { role: string; content: string }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content || '';
  }
  return '';
}

function previousAssistant(messages: { role: string; content: string }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') return messages[i].content || '';
  }
  return '';
}

/**
 * Tools for this turn. An agent that names its own list keeps that list.
 * The open chat sends the always-on set plus keyword matches.
 * If the previous reply said it had no tool, the next turn sends the full pool.
 */
export function selectTurnTools(
  agentToolIds: string[] | 'ALL' | undefined,
  messages: { role: string; content: string }[],
): typeof AVAILABLE_TOOLS {
  const pool = !agentToolIds || agentToolIds === 'ALL'
    ? AVAILABLE_TOOLS
    : AVAILABLE_TOOLS.filter(t => agentToolIds.includes(t.name));
  if (agentToolIds && agentToolIds !== 'ALL') return pool as typeof AVAILABLE_TOOLS;
  if (ESCALATE.test(previousAssistant(messages))) return pool;

  const wanted = new Set(ALWAYS);
  const prefixes: string[] = [];
  const text = lastUserText(messages);
  for (const group of GROUPS) {
    if (!group.re.test(text)) continue;
    for (const tool of group.tools) {
      if (tool.endsWith('_')) prefixes.push(tool);
      else wanted.add(tool);
    }
  }
  return pool.filter(t => wanted.has(t.name) || prefixes.some(p => t.name.startsWith(p))) as typeof AVAILABLE_TOOLS;
}
