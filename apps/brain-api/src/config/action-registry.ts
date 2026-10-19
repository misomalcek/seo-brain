/**
 * Action Registry — source of truth for all Brain actions.
 * Each action maps a path (e.g. "/content/discover") to an agent + prompt template.
 * ActionPalette reads this via GET /chat/actions.
 * resolveAction() matches user input against these paths.
 */

export interface Action {
  path: string;
  label: string;         // SK display name
  description: string;   // What it does (shown in popup)
  agent?: string;        // Agent ID to activate (optional — some actions are tool-direct)
  tools?: string[];      // Tools to suggest to the agent
  prompt: (input: string) => string;  // Prompt template (input = domain or topic)
  icon: string;
  category: 'content' | 'seo' | 'ahrefs' | 'gsc' | 'web' | 'brain' | 'msg' | 'plan';
  tier: 1 | 2 | 3;      // Capability index tier
  multiStep?: boolean;   // Extended iterations for complex multi-step workflows
}

// Helper: default domain fallback
const d = (input: string) => input || 'example.com';

export const ACTION_REGISTRY: Action[] = [
  // ── CONTENT (7) ──────────────────────────────────────────
  {
    path: '/content/discover',
    label: 'Content Discover',
    description: 'Nájdi content gaps a príležitosti vs konkurencia',
    agent: 'content-gap',
    tools: ['ahrefs_competitors', 'ahrefs_organic_keywords'],
    prompt: (input) => `Urob content gap analýzu pre ${d(input)}. Použi ahrefs_competitors a ahrefs_organic_keywords. Porovnaj s top 3 konkurentmi. Výstup ako tabuľka: keyword, náš ranking, konkurent ranking, objem, obtiažnosť, príležitosť.`,
    icon: '🔍',
    category: 'content',
    tier: 1,
  },
  {
    path: '/content/ideas',
    label: 'Content Ideas',
    description: 'Generuj nápady na témy a kľúčové slová',
    agent: 'content-cluster-architect',
    tools: ['ahrefs_keyword_ideas', 'ahrefs_search_suggestions'],
    prompt: (input) => `Navrhni content idey pre ${d(input)}. Použi ahrefs_keyword_ideas a ahrefs_search_suggestions. Zameraj sa na témy s vysokým potenciálom a nízkou obtiažnosťou. Výstup: tabuľka s témami, objemom, KD, a navrhovaným typom obsahu.`,
    icon: '💡',
    category: 'content',
    tier: 2,
  },
  {
    path: '/content/research',
    label: 'Content Research',
    description: 'Hlboký SERP research na konkrétnu tému',
    agent: 'content-brief',
    tools: ['ahrefs_serp_overview', 'web_search', 'ahrefs_keyword_overview'],
    prompt: (input) => `Urob hlboký SERP research na tému "${input}". Použi ahrefs_serp_overview a web_search. Analyzuj top 10 výsledkov: čo pokrývajú, aká je ich štruktúra, čo chýba. Navrhni ako sa odlíšiť.`,
    icon: '🔬',
    category: 'content',
    tier: 2,
  },
  {
    path: '/content/brief',
    label: 'Content Brief',
    description: 'Štrukturovaný brief pre článok (osnova, keywords)',
    agent: 'content-brief',
    tools: ['ahrefs_keyword_overview', 'ahrefs_serp_overview'],
    prompt: (input) => `Vytvor štrukturovaný content brief pre tému "${input}". Zahrň: cieľové keyword, sekundárne keywords, navrhovanú štruktúru (H2/H3), odporúčanú dĺžku, a kľúčové body na pokrytie. Použi ahrefs_keyword_overview pre metriky.`,
    icon: '📋',
    category: 'content',
    tier: 2,
  },
  {
    path: '/content/draft',
    label: 'Content Draft',
    description: 'Napíš článok alebo obsah na danú tému',
    agent: 'content-creator',
    prompt: (input) => `Napíš článok na tému "${input}". Dodržuj brand voice example-org (profesionálny, priateľský). Min. 800 slov. Zahrň H2/H3 štruktúru, meta title, meta description.`,
    icon: '✏️',
    category: 'content',
    tier: 2,
  },
  {
    path: '/content/edit',
    label: 'Content Edit',
    description: 'Optimalizuj existujúci obsah pre brand voice a SEO',
    agent: 'article-editor',
    prompt: (input) => `Optimalizuj nasledujúci obsah pre SEO a brand voice example-org:\n\n${input}`,
    icon: '✨',
    category: 'content',
    tier: 2,
  },
  {
    path: '/content/audit',
    label: 'Content Audit',
    description: 'Detekcia zastaraného obsahu, AEO readiness check',
    agent: 'aeo-content-auditor',
    tools: ['ahrefs_top_pages', 'gsc_search_analytics'],
    prompt: (input) => `Urob content audit pre ${d(input)}. Použi ahrefs_top_pages a gsc_search_analytics (28 dní). Nájdi: stránky strácajúce traffic (content decay), stránky bez organic traffic, a AEO readiness. Výstup s prioritami.`,
    icon: '🔎',
    category: 'content',
    tier: 2,
  },
  {
    path: '/content/publish',
    label: 'Content Publish',
    description: 'Ulož do súborov, pridaj do content kalendára',
    agent: 'content-cluster-architect',
    tools: ['save_user_file', 'content_calendar'],
    prompt: (input) => `Ulož nasledujúci obsah a pridaj ho do content kalendára:\n\n${input}`,
    icon: '📤',
    category: 'content',
    tier: 2,
  },

  // ── SEO (6) ──────────────────────────────────────────────
  {
    path: '/seo/overview',
    label: 'SEO Overview',
    description: 'Kompletný SEO prehľad domény',
    agent: 'seo-auditor',
    tools: ['ahrefs_domain_rating', 'ahrefs_organic_keywords', 'gsc_search_analytics'],
    prompt: (input) => `Urob kompletný SEO prehľad pre ${d(input)}. Použi ahrefs_domain_rating, ahrefs_organic_keywords, gsc_search_analytics (28 dní). Zahrň: DR, počet keywords, top 10 keywords, traffic trend, backlink profil. Štrukturovaný výstup.`,
    icon: '📊',
    category: 'seo',
    tier: 2,
  },
  {
    path: '/seo/audit',
    label: 'SEO Audit',
    description: 'Kompletný SEO audit (technický + obsah + linky)',
    agent: 'seo-auditor',
    tools: ['ahrefs_domain_rating', 'ahrefs_organic_keywords', 'gsc_tech_seo'],
    prompt: (input) => `Urob kompletný SEO audit pre ${d(input)}. Použi ahrefs_domain_rating, ahrefs_organic_keywords, gsc_tech_seo. Skontroluj: DR, indexáciu, Core Web Vitals, top keywords, broken links. Výstup štruktúrovane s prioritami.`,
    icon: '🏥',
    category: 'seo',
    tier: 1,
  },
  {
    path: '/seo/keywords',
    label: 'SEO Keywords',
    description: 'Keyword research a ranking príležitosti',
    agent: 'ahrefs-keywords',
    tools: ['ahrefs_organic_keywords', 'gsc_quick_wins'],
    prompt: (input) => `Analyzuj keyword príležitosti pre ${d(input)}. Použi ahrefs_organic_keywords a gsc_quick_wins. Nájdi: keywords s najväčším potenciálom (pozícia 4-20), nové príležitosti, distribúciu rankingov. Tabuľka + odporúčania.`,
    icon: '🔑',
    category: 'seo',
    tier: 1,
  },
  {
    path: '/seo/backlinks',
    label: 'SEO Backlinks',
    description: 'Analýza linkov, broken linky, reclamation',
    agent: 'ahrefs-backlinks',
    tools: ['ahrefs_backlinks', 'ahrefs_broken_backlinks', 'ahrefs_referring_domains'],
    prompt: (input) => `Analyzuj backlink profil pre ${d(input)}. Použi ahrefs_backlinks, ahrefs_broken_backlinks, ahrefs_referring_domains. Zahrň: celkový počet, dofollow/nofollow, top referring domains, broken links na reclamation. Tabuľka + akčné odporúčania.`,
    icon: '🔗',
    category: 'seo',
    tier: 2,
  },
  {
    path: '/seo/competitors',
    label: 'SEO Competitors',
    description: 'Konkurenčná analýza (keyword overlap, content gaps)',
    agent: 'ahrefs-competitors',
    tools: ['ahrefs_competitors', 'ahrefs_organic_keywords'],
    prompt: (input) => `Analyzuj SEO konkurentov pre ${d(input)}. Použi ahrefs_competitors a ahrefs_organic_keywords. Nájdi: top 5 organických konkurentov, keyword overlap, kde nás prekonávajú, content gaps. Tabuľka + stratégia.`,
    icon: '⚔️',
    category: 'seo',
    tier: 2,
  },
  {
    path: '/seo/schema',
    label: 'SEO Schema',
    description: 'Schema markup a meta tag optimalizácia',
    agent: 'seo-schema-and-meta',
    tools: ['web_fetch'],
    prompt: (input) => `Analyzuj schema markup a meta tagy pre ${d(input)}. Použi web_fetch na hlavnú stránku. Skontroluj: existujúce schema typy, meta title/description kvalitu, Open Graph tagy. Navrhni zlepšenia.`,
    icon: '🏷️',
    category: 'seo',
    tier: 2,
  },

  // ── AHREFS (4) ───────────────────────────────────────────
  {
    path: '/ahrefs/domain',
    label: 'Ahrefs Domain',
    description: 'Prehľad domény (DR, traffic, backlinky, top pages)',
    agent: 'ahrefs-domain',
    tools: ['ahrefs_domain_rating', 'ahrefs_top_pages'],
    prompt: (input) => `Ukáž kompletný prehľad domény ${d(input)}. Použi ahrefs_domain_rating a ahrefs_top_pages. Zahrň: DR, odhadovaný traffic, top 10 stránok podľa traffic, backlink profil.`,
    icon: '🌐',
    category: 'ahrefs',
    tier: 1,
  },
  {
    path: '/ahrefs/keywords',
    label: 'Ahrefs Keywords',
    description: 'Keyword research (objem, obtiažnosť, CPC)',
    agent: 'ahrefs-keywords',
    tools: ['ahrefs_keyword_overview', 'ahrefs_keyword_ideas'],
    prompt: (input) => `Urob keyword research pre "${input}". Použi ahrefs_keyword_overview a ahrefs_keyword_ideas. Pre každý keyword: objem, KD, CPC, traffic potenciál. Tabuľka zoradená podľa potenciálu.`,
    icon: '📝',
    category: 'ahrefs',
    tier: 2,
  },
  {
    path: '/ahrefs/batch',
    label: 'Ahrefs Batch',
    description: 'Porovnaj 2-20 domén naraz',
    agent: 'ahrefs-batch',
    tools: ['ahrefs_batch_analysis'],
    prompt: (input) => `Porovnaj tieto domény: ${input}. Použi ahrefs_batch_analysis. Pre každú doménu: DR, odhadovaný traffic, počet keywords, backlinky. Porovnávacia tabuľka.`,
    icon: '📦',
    category: 'ahrefs',
    tier: 2,
  },
  {
    path: '/ahrefs/export',
    label: 'Ahrefs Export',
    description: 'Generuj export URL (FREE, 0 API units)',
    tools: ['suggest_ahrefs_export'],
    prompt: (input) => `Vygeneruj Ahrefs export URL pre ${d(input)}. Použi suggest_ahrefs_export. Navrhni najužitočnejšie exporty (keywords, backlinks, top pages).`,
    icon: '📥',
    category: 'ahrefs',
    tier: 2,
  },

  // ── GSC (3) ──────────────────────────────────────────────
  {
    path: '/gsc/performance',
    label: 'GSC Performance',
    description: 'Kompletný GSC performance report',
    agent: 'gsc-performance',
    tools: ['gsc_search_analytics'],
    prompt: (input) => `Urob kompletný GSC performance report pre ${d(input)}. Použi gsc_search_analytics za 28 dní. Zahrň: celkové kliky, impressions, CTR, priemernú pozíciu, top 20 queries, top 10 pages. Tabuľky + trend analýza.`,
    icon: '📈',
    category: 'gsc',
    tier: 3,
  },
  {
    path: '/gsc/quick-wins',
    label: 'GSC Quick Wins',
    description: 'Low-hanging fruit keywords (pozície 4-20)',
    agent: 'gsc-search-analytics',
    tools: ['gsc_quick_wins'],
    prompt: (input) => `Nájdi quick win príležitosti pre ${d(input)}. Použi gsc_quick_wins. Keywords na pozíciách 4-20 s vysokými impressions. Tabuľka: keyword, pozícia, kliky, impressions, CTR, potenciál. Zoraď podľa potenciálu.`,
    icon: '🎯',
    category: 'gsc',
    tier: 1,
  },
  {
    path: '/gsc/technical',
    label: 'GSC Technical',
    description: 'URL inspection, sitemaps, Core Web Vitals',
    agent: 'gsc-search-analytics',
    tools: ['gsc_tech_seo'],
    prompt: (input) => `Urob technický SEO check pre ${d(input)}. Použi gsc_tech_seo. Skontroluj: index status kľúčových URL, sitemaps, Core Web Vitals (LCP, CLS, INP). Výstup s prioritami.`,
    icon: '⚙️',
    category: 'gsc',
    tier: 3,
  },

  // ── WEB (3) ──────────────────────────────────────────────
  {
    path: '/web/search',
    label: 'Web Search',
    description: 'Vyhľadávanie na webe (aktuálne udalosti, research)',
    tools: ['web_search'],
    prompt: (input) => `Vyhľadaj na webe: "${input}". Použi web_search.`,
    icon: '🌍',
    category: 'web',
    tier: 3,
  },
  {
    path: '/web/fetch',
    label: 'Web Fetch',
    description: 'Načítaj statickú stránku alebo API',
    tools: ['web_fetch'],
    prompt: (input) => `Načítaj obsah z URL: ${input}. Použi web_fetch.`,
    icon: '📄',
    category: 'web',
    tier: 3,
  },
  {
    path: '/web/render',
    label: 'Web Render',
    description: 'Renderuj JS-heavy stránku (Playwright)',
    tools: ['web_render'],
    prompt: (input) => `Renderuj a analyzuj stránku: ${input}. Použi web_render (Playwright).`,
    icon: '🖥️',
    category: 'web',
    tier: 3,
  },

  // ── BRAIN (3) ────────────────────────────────────────────
  {
    path: '/brain/memory',
    label: 'Brain Memory',
    description: 'Správa Brain pamäte',
    agent: 'brain-memory',
    prompt: (input) => `${input || 'Ukáž aktívne brain memories a ich stav.'}`,
    icon: '🧠',
    category: 'brain',
    tier: 3,
  },
  {
    path: '/brain/report',
    label: 'Brain Report',
    description: 'Generuj analytický report',
    agent: 'brain-report',
    tools: ['save_user_file'],
    prompt: (input) => `Vytvor analytický report pre ${d(input)}. Použi dostupné dáta a ulož ako DOCX alebo XLSX.`,
    icon: '📑',
    category: 'brain',
    tier: 3,
  },
  {
    path: '/brain/export',
    label: 'Brain Export',
    description: 'Vytvor DOCX/XLSX/PPTX súbor',
    agent: 'brain-document',
    tools: ['save_user_file'],
    prompt: (input) => `Vytvor dokument: ${input}. Ulož ako vhodný formát (DOCX pre text, XLSX pre tabuľky, PPTX pre prezentácie).`,
    icon: '💾',
    category: 'brain',
    tier: 3,
  },

  // ── MSG (3) ──────────────────────────────────────────────
  {
    path: '/msg/article',
    label: 'MSG Article',
    description: 'Vytvorenie článku pre example-org',
    agent: 'article-creator',
    prompt: (input) => `Vytvor článok pre example-org na tému "${input}". Dodržuj brand voice, SEO best practices, min. 800 slov.`,
    icon: '📰',
    category: 'msg',
    tier: 3,
  },
  {
    path: '/msg/brief',
    label: 'MSG Brief',
    description: 'SEO content brief pre example-org',
    agent: 'msg-brief-creator',
    tools: ['ahrefs_keyword_overview', 'ahrefs_serp_overview'],
    prompt: (input) => `Vytvor SEO content brief pre example-org na tému "${input}". Použi ahrefs_keyword_overview a ahrefs_serp_overview. Zahrň: cieľové keyword, sekundárne keywords, štruktúru, odporúčanú dĺžku.`,
    icon: '📝',
    category: 'msg',
    tier: 3,
  },
  {
    path: '/msg/edit',
    label: 'MSG Edit',
    description: 'Optimalizácia example-org článku',
    agent: 'article-editor',
    prompt: (input) => `Optimalizuj nasledujúci example-org článok pre SEO a brand voice:\n\n${input}`,
    icon: '✏️',
    category: 'msg',
    tier: 3,
  },

  // ── PLAN (1) ─────────────────────────────────────────────
  {
    path: '/plan',
    label: 'Master Plan',
    description: 'Viacfázová orchestrácia cez master-planner',
    agent: undefined, multiStep: true,
    prompt: (input) => `${input}`,
    icon: '🗺️',
    category: 'plan',
    tier: 3,
  },
];

/** Get all actions for ActionPalette (GET /chat/actions) — computed once at import time */
const PALETTE_ACTIONS = ACTION_REGISTRY.map(a => ({
  path: a.path,
  label: a.label,
  description: a.description,
  icon: a.icon,
  category: a.category,
  tier: a.tier,
}));

export function getActionsForPalette() {
  return PALETTE_ACTIONS;
}

/** Find action by path (e.g. "/content/discover") */
export function findAction(path: string): Action | undefined {
  const normalized = path.toLowerCase().trim();
  return ACTION_REGISTRY.find(a => a.path === normalized);
}

/** Get category info for ActionPalette categories */
export const ACTION_CATEGORIES = [
  { id: 'content', label: 'Content', icon: '📝', color: 'pink' },
  { id: 'seo', label: 'SEO', icon: '🔍', color: 'red' },
  { id: 'ahrefs', label: 'Ahrefs', icon: '🔗', color: 'orange' },
  { id: 'gsc', label: 'GSC', icon: '📈', color: 'green' },
  { id: 'web', label: 'Web', icon: '🌐', color: 'blue' },
  { id: 'brain', label: 'Brain', icon: '🧠', color: 'purple' },
  { id: 'msg', label: 'example-org', icon: '💼', color: 'gray' },
  { id: 'plan', label: 'Plan', icon: '🗺️', color: 'indigo' },
] as const;
