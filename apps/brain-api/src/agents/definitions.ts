/**
 * Agent Definitions — v1 (Sprint A, 2026-05-22)
 *
 * Source-of-truth for the 6 specialist agents + Brain core agents.
 * These replace the 40+ .md agent flat files as the canonical TS interface layer.
 * The .md files remain as prompt bodies; their YAML frontmatter is superseded by
 * AgentDef.mdFile reference.
 *
 * 6 specialist agents:
 *   Auditor | Analyst | Writer | Brief | Idea | Batch
 *
 * Brain core agents (not routable as task agents):
 *   master-planner | brain-document | brain-presentation |
 *   brain-spreadsheet | brain-web-artifact | brain-theme-factory
 *
 * No domain filtering — all agents access all domains.
 */

import type { BrainMode } from '../services/mode-controller.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AgentType = 'specialist' | 'brain-core';

export type AgentModel = 'haiku' | 'sonnet' | 'sonnet-high';

/** One of the 6 canonical specialist agent IDs. */
export type SpecialistAgentId =
  | 'auditor'
  | 'analyst'
  | 'writer'
  | 'brief'
  | 'idea'
  | 'batch';

export type BrainCoreAgentId =
  | 'master-planner'
  | 'brain-document'
  | 'brain-presentation'
  | 'brain-spreadsheet'
  | 'brain-web-artifact'
  | 'brain-theme-factory';

export type AgentId = SpecialistAgentId | BrainCoreAgentId;

/**
 * Canonical agent definition.
 * All agents read their system prompt from the matching .md file in agents/
 * (loaded at runtime). This interface defines the routing + UI layer.
 */
export interface AgentDef {
  id: AgentId;
  name: string;
  nameLocalized: string;         // Slovak display name
  description: string;           // Short English description (for routing/API)
  descriptionLocalized: string;  // Slovak (shown in UI)
  icon: string;                  // Emoji
  color: string;                 // Hex — used in chat badges, browser cards
  model: AgentModel;
  type: AgentType;

  /**
   * Allowed tool IDs.
   * Brain core agents have empty tools (they orchestrate, not call tools directly).
   * 'ALL' means the full tool registry — used by Brief.
   */
  tools: string[] | 'ALL';

  /**
   * Modes this agent is compatible with.
   * Router uses this to override mode when agent is explicitly selected.
   */
  modes: BrainMode[];

  /**
   * Routing keywords — used by action-resolver keyword tier (case-insensitive).
   * Kept intentionally broad; Sprint D brain-router adds semantic tier.
   */
  keywords: string[];

  /**
   * Legacy agent IDs this agent absorbs.
   * Sprint F backward-compat alias table uses this to redirect old @mentions.
   */
  absorbs: string[];

  /**
   * Optional md file path (relative to repo root agents/).
   * Defaults to `agents/${id}.md` if omitted.
   */
  mdFile?: string;
}

/**
 * Custom agent definition — DB-managed, team-shared.
 * Shape is compatible with AgentDef for routing purposes.
 */
export interface CustomAgentDef {
  id: string;           // slug (e.g. "hr-writer")
  name: string;
  nameLocalized: string;
  description: string;
  descriptionLocalized: string;
  icon: string;
  color: string;
  model: AgentModel;
  type: 'custom';
  tools: string[] | 'ALL';
  modes: BrainMode[];
  keywords: string[];
  absorbs: string[];
  isCustom: true;
}

/** Union: canonical agent OR user-created custom agent */
export type AnyAgentDef = AgentDef | CustomAgentDef;

// ─── Tool Group Constants ─────────────────────────────────────────────────────

const TOOLS_AHREFS_SITE_EXPLORER = [
  'ahrefs_domain_rating',
  'ahrefs_organic_keywords',
  'ahrefs_backlinks',
  'ahrefs_top_pages',
  'ahrefs_competitors',
  'ahrefs_keyword_overview',
  'ahrefs_serp_overview',
  'ahrefs_broken_backlinks',
  'ahrefs_keyword_ideas',
  'ahrefs_referring_domains',
  'ahrefs_batch_analysis',
];

const TOOLS_AHREFS_LINK_ANALYSIS = [
  'ahrefs_anchors',
  'ahrefs_pages_by_backlinks',
  'ahrefs_pages_by_internal_links',
  'ahrefs_linked_anchors_internal',
  'ahrefs_pages_by_traffic',
  'ahrefs_linked_domains',
];

const TOOLS_AHREFS_KEYWORDS_EXPLORER = [
  'ahrefs_related_terms',
  'ahrefs_search_suggestions',
  'ahrefs_volume_by_country',
];

const TOOLS_AHREFS_SITE_AUDIT = [
  'ahrefs_site_audit_projects',
  'ahrefs_site_audit_issues',
  'ahrefs_site_audit_page_explorer',
];

const TOOLS_GSC = [
  'gsc_search_analytics',
  'gsc_quick_wins',
  'gsc_tech_seo',
  'gsc_compare_periods',  // 2026-05-26 — was missing from constant; analyst had it via explicit list, auditor/batch did not
];

const TOOLS_WEB = [
  // Note: web_search is the Anthropic native search tool — it is NOT in AVAILABLE_TOOLS.
  // claude.ts always appends WEB_SEARCH_TOOL to every request regardless of agentToolIds,
  // so listing it here would cause false-positive "unknown tool" warnings without benefit.
  'web_fetch',
  'web_render',
  'google_organic',
  'google_ai_mode',
];

const TOOLS_UTILITY = [
  'get_current_date',
  'suggest_ahrefs_export',
  'save_user_file',
  'content_calendar',
];

/** Hive Recall trio — every specialist gets this. Three orthogonal axes:
 *  1. context_search   — unified semantic across ALL Brain layers (memories/articles/knowledge/brand/template)
 *  2. articles_search  — narrower semantic for published site content (best precision for content lookups)
 *  3. articles_similar — "more like this" by article id (collaborative-filter style)
 *  4. knowledge_graph_query — Apache AGE multi-hop / domain clustering / shortest-path (added handoff
 *     2026-06-29 — was previously only reachable via 'ALL' agents Brief + Master Planner). Brain's
 *     autonomy expects every specialist to be able to reach for graph reasoning when a question is
 *     relational ("what connects X to Y", "what else is tagged Z") instead of just lexical/semantic.
 */
const TOOLS_VECTOR = [
  'context_search',
  'articles_search',
  'articles_similar',
  ...(process.env.SEO_BRAIN_DESKTOP === '1' ? [] : ['knowledge_graph_query']),
];

/** GA4 traffic + realtime analytics + Run T expansion (15 tools total) */
const TOOLS_GA4 = [
  // Originals
  'ga4_run_report',
  'ga4_traffic_overview',
  'ga4_realtime_users',
  // Run T pages/sources/geo/device
  'ga4_landing_pages',
  'ga4_page_engagement',
  'ga4_source_medium',
  'ga4_geo_breakdown',
  'ga4_device_breakdown',
  // Run T events/attribution/compare
  'ga4_key_events',
  'ga4_channel_attribution',
  'ga4_compare_periods',
  // Run T funnel/cohort/path
  'ga4_funnel_report',
  'ga4_cohort_retention',
  'ga4_path_exploration',
  // Run T realtime/demographics/infra
  'ga4_realtime_pages',
  'ga4_demographics',
  'ga4_metadata',
  'ga4_quota_status',
];

// ─── Agent Definitions ────────────────────────────────────────────────────────

export const AGENTS: Record<AgentId, AgentDef> = {

  // ── Auditor 🔍 ────────────────────────────────────────────────────────────
  auditor: {
    id: 'auditor',
    name: 'Auditor',
    nameLocalized: 'Audítor',
    description: 'SEO technical audit, site health, content decay detection, AEO readiness',
    descriptionLocalized: 'Technický SEO audit, zdravie stránky, content decay, AEO readiness',
    icon: '🔍',
    color: '#3B82F6',
    model: 'sonnet',
    type: 'specialist',
    tools: [
      // Knowledge recall (Hive Recall trio + graph)
      ...TOOLS_VECTOR,
      // Ahrefs audit
      ...TOOLS_AHREFS_SITE_AUDIT,
      'ahrefs_broken_backlinks',
      'ahrefs_top_pages',
      'ahrefs_organic_keywords',
      'ahrefs_domain_rating',
      // GSC + GA4 (2026-05-26 — completed GA4 set; was missing ga4_run_report;
      // gsc_compare_periods now also in TOOLS_GSC constant)
      ...TOOLS_GSC,
      ...TOOLS_GA4,
      // Web crawl + Lighthouse
      ...TOOLS_WEB,
      'lighthouse_audit',
      // Utility
      'suggest_ahrefs_export',
      'save_user_file',
      'read_user_file',
      'get_current_date',
    ],
    modes: ['default', 'extended'],
    keywords: [
      // Core audit
      'audit', 'technical', 'technicky', 'health', 'zdravie', 'crawl',
      'decay', 'zastaraly', 'stale', 'schema', 'meta', 'CWV', 'core web vitals',
      'indexation', 'indexacia', 'broken', 'aeo', 'readiness', 'site audit',
      // SEO (migrated from detectAgent AGENT_KEYWORDS)
      'seo audit', 'technical seo', 'on-page', 'link building', 'schema markup',
      'internal linking', 'internal links', 'orphan pages', 'link structure',
      'seo analyza', 'seo analýza', 'full seo', 'seo optimalizacia',
      // AEO (migrated from aeo-content-auditor + aeo-content-optimizer)
      'aeo audit', 'ai citation', 'ai visibility', 'answer engine',
      'aeo optimization', 'ai overview', 'citation potential',
      // SERP battle (migrated from seo-serp-battle)
      'serp battle', 'serp competition', 'serp analysis',
    ],
    absorbs: [
      'seo-auditor',
      'aeo-content-auditor',
      'aeo-content-optimizer',
      'seo-schema-and-meta',
      'seo-ai-visibility',
      'gsc-analyst',
      'gsc-search-analytics',
      'gsc-performance',
      'web-auditor',
      'web-performance',
    ],
  },

  // ── Analyst 📊 ────────────────────────────────────────────────────────────
  analyst: {
    id: 'analyst',
    name: 'Analyst',
    nameLocalized: 'Analytik',
    description: 'Full Ahrefs + GSC data orchestrator — keywords, backlinks, competitors, multisite, topical authority',
    descriptionLocalized: 'Plný Ahrefs + GSC orchestrátor — keywords, backlinky, konkurencia, multisite, topical authority',
    icon: '📊',
    color: '#F97316',
    model: 'sonnet',
    type: 'specialist',
    tools: [
      // Knowledge recall
      ...TOOLS_VECTOR,
      // Ahrefs — full suite
      ...TOOLS_AHREFS_SITE_EXPLORER,
      ...TOOLS_AHREFS_LINK_ANALYSIS,
      ...TOOLS_AHREFS_KEYWORDS_EXPLORER,
      ...TOOLS_AHREFS_SITE_AUDIT,
      // GSC + GA4 (gsc_compare_periods now in TOOLS_GSC constant — no explicit dup)
      ...TOOLS_GSC,
      ...TOOLS_GA4,
      'google_organic',
      'google_ai_mode',
      // Utility
      'suggest_ahrefs_export',
      'save_user_file',
      'read_user_file',
      'get_current_date',
    ],
    modes: ['default', 'extended'],
    keywords: [
      'keyword', 'keywords', 'ranking', 'rankingy', 'backlink', 'backlinky',
      'competitor', 'konkurent', 'traffic', 'navstevnost', 'domain rating', 'DR',
      'ahrefs', 'gsc', 'search console', 'analytics', 'analyza', 'analysis',
      'referring domain', 'anchor', 'topical authority', 'content gap',
      'multisite', 'all domains', 'vsetky domeny', 'serp', 'volume',
      // Migrated from detectAgent AGENT_KEYWORDS
      'competitor analysis', 'analyza konkurencie', 'competitor monitoring',
      'cross-domain', 'napriec domenami', 'backlink gap', 'gap analysis',
      'keyword opportunity', 'keyword prilezitost', 'hladanie klucovych slov',
      // GA4
      'ga4', 'google analytics', 'sessions', 'users', 'pageviews', 'realtime',
      'realtime users', 'aktívni používatelia', 'traffic source', 'acquisition',
      'engagement rate', 'bounce rate', 'conversion', 'goal', 'event tracking',
    ],
    absorbs: [
      'ahrefs-analyst',
      'ahrefs-domain',
      'ahrefs-keywords',
      'ahrefs-backlinks',
      'ahrefs-competitors',
      'ahrefs-report',
      'ahrefs-keyword-scanner',
      'ahrefs-link-reclamation',
      'seo-multisite-orchestrator',
      'seo-topical-authority',
      'seo-serp-battle',
      'seo-linkbuilder',
      'seo-internal-linking',
      'content-decay',
      'content-competitors',
    ],
  },

  // ── Writer ✍️ ─────────────────────────────────────────────────────────────
  writer: {
    id: 'writer',
    name: 'Writer',
    nameLocalized: 'Pisáč',
    description: 'Article writing, editorial, content creation — example-org brand voice',
    descriptionLocalized: 'Tvorba článkov, editorial, content creation — brand voice example-org',
    icon: '✍️',
    color: '#10B981',
    model: 'sonnet',
    type: 'specialist',
    tools: [
      // Knowledge recall — brand voice, published articles, SEO strategy, graph
      ...TOOLS_VECTOR,
      // Web research
      ...TOOLS_WEB,
      // Keyword context
      'ahrefs_keyword_overview',
      'ahrefs_serp_overview',
      'gsc_search_analytics',
      // File I/O
      'read_user_file',
      'save_user_file',
      'content_calendar',
      'get_current_date',
    ],
    modes: ['default', 'extended'],
    keywords: [
      'write', 'napíš', 'clanok', 'článok', 'article', 'blog', 'draft',
      'edit', 'uprav', 'refresh', 'aktualizuj', 'obsah', 'content',
      'SEO text', 'glossary', 'glossar', 'slovnik', 'HR obsah',
      // Migrated from detectAgent AGENT_KEYWORDS
      'copywriting', 'content marketing', 'editovanie', 'edituj clanok',
      'aktualizacia obsahu', 'stary obsah', 'update content',
      'example-org', 'Example Org', 'poistenie', 'insurance', 'insurance article',
      'ai slovnik', 'ai termin', 'ai glossary',
      'hr slovnik', 'hr termin', 'hr glossary', 'ludske zdroje',
    ],
    absorbs: [
      'content-creator',
      'content-refresher',
      'content-draft',
      'article-creator',
      'article-editor',
      'msg-ai-glossary-creator',
      'msg-hr-glossary-creator',
      'msg-glossary-dataset-creator',
      'hr-content-specialist',
    ],
  },

  // ── Brief 🏗️ ──────────────────────────────────────────────────────────────
  brief: {
    id: 'brief',
    name: 'Brief',
    nameLocalized: 'Brief',
    description: 'Comprehensive research agent — all tools, deep SERP + competitive + audience research for briefs',
    descriptionLocalized: 'Komplexný research agent — všetky nástroje, hlboký SERP + konkurenčná + audience analýza pre briefy',
    icon: '🏗️',
    color: '#8B5CF6',
    model: 'sonnet-high',
    type: 'specialist',
    tools: 'ALL',
    modes: ['default', 'extended'],
    keywords: [
      'brief', 'research', 'prieskum', 'serp research', 'competitive research',
      'strategy', 'strategia', 'plan', 'plán', 'prepare', 'priprav',
      'investigate', 'zisti', 'deep dive', 'hlboka analyza',
      // Migrated from detectAgent AGENT_KEYWORDS (content planning + seo brief)
      'seo brief', 'content brief', 'osnova', 'outline',
      'content plan', 'content calendar', 'content strategy',
      'editorial calendar', 'topic cluster', 'pillar', 'pillar page',
      'obsahova strategia', 'obsahovy plan', 'redakcny plan',
    ],
    absorbs: [
      'content-brief',
      'msg-brief-creator',
      'brief-creator-example-qa',
      'example-qa-brief-creator',
      'content-planner',
      'content-cluster-architect',
      'seo-specialist',
      'master-planner',
    ],
  },

  // ── Idea 💡 ───────────────────────────────────────────────────────────────
  idea: {
    id: 'idea',
    name: 'Idea',
    nameLocalized: 'Idea',
    description: 'Creative ideation — topic suggestions, content gap discovery, keyword brainstorming',
    descriptionLocalized: 'Kreatívna ideácia — nápady na témy, content gap, keyword brainstorming',
    icon: '💡',
    color: '#F59E0B',
    model: 'haiku',
    type: 'specialist',
    tools: [
      // Knowledge recall — find related published content + graph traversal
      ...TOOLS_VECTOR,
      // Keyword ideation
      'ahrefs_keyword_ideas',
      'ahrefs_search_suggestions',
      'ahrefs_related_terms',
      'ahrefs_organic_keywords',
      'ahrefs_volume_by_country',
      'ahrefs_competitors',
      // Web
      ...TOOLS_WEB,
      'get_current_date',
    ],
    modes: ['default', 'fast'],
    keywords: [
      'idea', 'nápad', 'nápady', 'topic', 'téma', 'témy', 'cluster',
      'brainstorm', 'suggest', 'navrhni', 'discover', 'nájdi témy',
      'content ideas', 'content nápady', 'what to write', 'čo písať',
      // Migrated from detectAgent AGENT_KEYWORDS
      'keyword ideas', 'hladanie klucovych slov',
    ],
    absorbs: [
      'content-gap',
      'content-planner',
      'ahrefs-keyword-scanner',
      'brain-ai-advisor',
    ],
  },

  // ── Batch ⚡ ──────────────────────────────────────────────────────────────
  batch: {
    id: 'batch',
    name: 'Batch',
    nameLocalized: 'Batch',
    description: 'Bulk operations — multi-domain analysis, exports, reports, dataset generation',
    descriptionLocalized: 'Hromadné operácie — multi-domain analýza, exporty, reporty, datasety',
    icon: '⚡',
    color: '#6B7280',
    model: 'haiku',
    type: 'specialist',
    tools: [
      // Knowledge recall (Hive Recall trio + graph)
      ...TOOLS_VECTOR,
      // Ahrefs bulk
      'ahrefs_batch_analysis',
      'ahrefs_domain_rating',
      'ahrefs_organic_keywords',
      'ahrefs_backlinks',
      'ahrefs_top_pages',
      'ahrefs_competitors',
      // GSC + GA4 (2026-05-26 — batch was missing GA4 for multi-domain traffic snapshots)
      ...TOOLS_GSC,
      ...TOOLS_GA4,
      // Utility
      'suggest_ahrefs_export',
      'read_user_file',
      'save_user_file',
      'get_current_date',
    ],
    modes: ['fast', 'default'],
    keywords: [
      'batch', 'bulk', 'hromadne', 'export', 'report', 'dataset',
      'all domains', 'vsetky domeny', 'multi domain', 'monthly', 'mesacny',
      'snapshot', 'generate report', 'generuj report',
    ],
    absorbs: [
      'ahrefs-batch',
      'brain-report',
      'brain-export',
      'brain-dataset',
      'ahrefs-report',
    ],
  },

  // ── Brain Core (not task-routable) ────────────────────────────────────────

  'master-planner': {
    id: 'master-planner',
    name: 'Master Planner',
    nameLocalized: 'Hlavný Plánovač',
    description: 'Strategic orchestrator — complexity-first routing, 25-iteration planning loop',
    descriptionLocalized: 'Strategický orchestrátor — complexity-first routing, 25-iteračný plánovací loop',
    icon: '🧠',
    color: '#7C3AED',
    model: 'sonnet-high',
    type: 'brain-core',
    tools: 'ALL',
    modes: ['default', 'extended', 'confirm'],
    keywords: ['plan', 'plán', 'orchestrate', 'orchestruj', 'strategy', 'strategia'],
    absorbs: [],
    mdFile: 'agents/master-planner.md',
  },

  'brain-document': {
    id: 'brain-document',
    name: 'Brain Document',
    nameLocalized: 'Dokument',
    description: 'DOCX/PDF document generator',
    descriptionLocalized: 'Generátor DOCX/PDF dokumentov',
    icon: '📄',
    color: '#475569',
    model: 'sonnet',
    type: 'brain-core',
    tools: ['save_user_file'],
    modes: ['default'],
    keywords: ['document', 'dokument', 'docx', 'pdf'],
    absorbs: [],
    mdFile: 'agents/brain-document.md',
  },

  'brain-presentation': {
    id: 'brain-presentation',
    name: 'Brain Presentation',
    nameLocalized: 'Prezentácia',
    description: 'PPTX presentation generator',
    descriptionLocalized: 'Generátor PPTX prezentácií',
    icon: '📊',
    color: '#475569',
    model: 'sonnet',
    type: 'brain-core',
    tools: ['save_user_file'],
    modes: ['default'],
    keywords: ['presentation', 'prezentacia', 'pptx', 'slides'],
    absorbs: [],
    mdFile: 'agents/brain-presentation.md',
  },

  'brain-spreadsheet': {
    id: 'brain-spreadsheet',
    name: 'Brain Spreadsheet',
    nameLocalized: 'Tabuľka',
    description: 'XLSX spreadsheet generator',
    descriptionLocalized: 'Generátor XLSX tabuliek',
    icon: '📋',
    color: '#475569',
    model: 'sonnet',
    type: 'brain-core',
    tools: ['save_user_file'],
    modes: ['default'],
    keywords: ['spreadsheet', 'excel', 'xlsx', 'tabulka', 'tabuľka'],
    absorbs: [],
    mdFile: 'agents/brain-spreadsheet.md',
  },

  'brain-web-artifact': {
    id: 'brain-web-artifact',
    name: 'Brain Web Artifact',
    nameLocalized: 'Web Artefakt',
    description: 'Interactive HTML artifact generator',
    descriptionLocalized: 'Generátor interaktívnych HTML artefaktov',
    icon: '🌐',
    color: '#475569',
    model: 'sonnet',
    type: 'brain-core',
    tools: ['save_user_file'],
    modes: ['default'],
    keywords: ['html artifact', 'web artifact', 'interactive', 'chart', 'dashboard html'],
    absorbs: [],
    mdFile: 'agents/brain-web-artifact.md',
  },

  'brain-theme-factory': {
    id: 'brain-theme-factory',
    name: 'Brain Theme Factory',
    nameLocalized: 'Theme Factory',
    description: 'UI theme and design token generator',
    descriptionLocalized: 'Generátor UI tém a design tokenov',
    icon: '🎨',
    color: '#475569',
    model: 'sonnet',
    type: 'brain-core',
    tools: [],
    modes: ['default'],
    keywords: ['theme', 'tema', 'design tokens', 'colors', 'farby', 'palette'],
    absorbs: [],
    mdFile: 'agents/brain-theme-factory.md',
  },
};

// ─── Utility Functions ────────────────────────────────────────────────────────

export function getAgent(id: string): AgentDef | undefined {
  return AGENTS[id as AgentId];
}

export function getAllAgents(): AgentDef[] {
  return Object.values(AGENTS);
}

export function getSpecialistAgents(): AgentDef[] {
  return Object.values(AGENTS).filter(a => a.type === 'specialist');
}

export function getBrainCoreAgents(): AgentDef[] {
  return Object.values(AGENTS).filter(a => a.type === 'brain-core');
}

export function getAgentIds(): AgentId[] {
  return Object.keys(AGENTS) as AgentId[];
}

export function getSpecialistAgentIds(): SpecialistAgentId[] {
  return getSpecialistAgents().map(a => a.id as SpecialistAgentId);
}

/**
 * Resolve a legacy agent ID to its absorbing specialist agent.
 * Returns undefined if the old ID is not absorbed by any specialist.
 */
export function resolveAbsorbed(legacyId: string): AgentDef | undefined {
  return getSpecialistAgents().find(a => a.absorbs.includes(legacyId));
}

/**
 * Check if an agent ID is valid (either current or legacy absorbed).
 */
export function isKnownAgent(id: string): boolean {
  return id in AGENTS || resolveAbsorbed(id) !== undefined;
}
