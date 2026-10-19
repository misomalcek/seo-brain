// Tool definitions for Claude API tool_use
// Based on available MCP servers: Ahrefs, GitHub, Filesystem

import Anthropic from '@anthropic-ai/sdk';

// Anthropic native web search (server-side tool, free in API)
export const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305' as const,
  name: 'web_search',
  max_uses: 5,
};

// Self-management tools — appended for admin/team_admin users, stripped for everyone
// else (see claude.ts toolset assembly). Lets Brain edit its own agents + personas on
// request, while non-admin users never receive these tools.
export const SELF_MGMT_TOOL_NAMES = ['manage_agent', 'manage_persona'] as const;

export const AVAILABLE_TOOLS: Anthropic.Tool[] = [
  // ==================== AHREFS TOOLS ====================
  {
    name: 'ahrefs_domain_rating',
    description: 'Get domain rating and metrics for a website. Call this first before any in-depth domain analysis. Use when user asks about domain authority, DR, or website strength. Example: {"target": "example.com"}',
    input_schema: {
      type: 'object' as const,
      properties: {
        target: {
          type: 'string',
          description: 'Domain or URL to analyze (e.g., "example.com")'
        },
        date: {
          type: 'string',
          description: 'Date for the data (YYYY-MM-DD format, defaults to today)'
        }
      },
      required: ['target']
    }
  },
  {
    name: 'ahrefs_organic_keywords',
    description: 'Get organic keywords that a domain ranks for. Use when user asks about keywords, rankings, or organic search performance. COST: ~460–1500 units depending on limit. Default 50 is sufficient for most analyses. Hard cap at 100. Examples: {"target": "example.com", "country": "sk"} or {"target": "example-dev.com", "country": "sk", "limit": 100}',
    input_schema: {
      type: 'object' as const,
      properties: {
        target: {
          type: 'string',
          description: 'Domain or URL to analyze'
        },
        country: {
          type: 'string',
          description: 'Country code (e.g., "sk", "cz", "us"). Defaults to "sk"'
        },
        limit: {
          type: 'number',
          description: 'Keywords to return (default 50, enforced max 100). Do NOT request limit>50 unless user explicitly asks for more.'
        }
      },
      required: ['target']
    }
  },
  {
    name: 'ahrefs_backlinks',
    description: 'Get backlink data for a domain. Use when user asks about backlinks, dofollow links, referring domains, or link profile. Example: {"target": "example.com", "limit": 20}',
    input_schema: {
      type: 'object' as const,
      properties: {
        target: {
          type: 'string',
          description: 'Domain or URL to analyze'
        },
        limit: {
          type: 'number',
          description: 'Number of backlinks to return (default 10)'
        }
      },
      required: ['target']
    }
  },
  {
    name: 'ahrefs_top_pages',
    description: 'Get top performing pages for a domain by traffic. Use when user asks about best pages, top content, or traffic distribution. Example: {"target": "example.com", "country": "sk", "limit": 10}',
    input_schema: {
      type: 'object' as const,
      properties: {
        target: {
          type: 'string',
          description: 'Domain or URL to analyze'
        },
        country: {
          type: 'string',
          description: 'Country code (default "sk")'
        },
        limit: {
          type: 'number',
          description: 'Number of pages to return (default 10)'
        }
      },
      required: ['target']
    }
  },
  {
    name: 'ahrefs_competitors',
    description: 'Find organic competitors for a domain. Use when user asks about competitors, competing websites, or market analysis. Example: {"target": "example.com", "country": "sk", "limit": 10}',
    input_schema: {
      type: 'object' as const,
      properties: {
        target: {
          type: 'string',
          description: 'Domain to analyze'
        },
        country: {
          type: 'string',
          description: 'Country code (default "sk")'
        },
        limit: {
          type: 'number',
          description: 'Number of competitors to return (default 10)'
        }
      },
      required: ['target']
    }
  },
  {
    name: 'ahrefs_keyword_overview',
    description: 'Get metrics for specific keywords including volume, difficulty, CPC. Use when user asks about keyword research or specific keyword data. Example: {"keywords": "životné poistenie, poistenie auta", "country": "sk"}',
    input_schema: {
      type: 'object' as const,
      properties: {
        keywords: {
          type: 'string',
          description: 'Comma-separated list of keywords to analyze'
        },
        country: {
          type: 'string',
          description: 'Country code (default "sk")'
        }
      },
      required: ['keywords']
    }
  },
  {
    name: 'ahrefs_serp_overview',
    description: 'Get SERP (search results) overview for a keyword. Shows top ranking pages for a keyword. COST: 400–5000 units per call (expensive — competitive keywords in US/UK cost most). Use only when user specifically asks who ranks for a keyword. Example: {"keyword": "životné poistenie", "country": "sk"}',
    input_schema: {
      type: 'object' as const,
      properties: {
        keyword: {
          type: 'string',
          description: 'Keyword to analyze'
        },
        country: {
          type: 'string',
          description: 'Country code (default "sk")'
        }
      },
      required: ['keyword']
    }
  },

  {
    name: 'ahrefs_broken_backlinks',
    description: 'Find broken backlinks pointing to 404 pages on a domain. Essential for link reclamation — redirecting dead URLs to live pages recovers lost link equity. Use when user asks about broken links, link reclamation, or 404 backlinks. Example: {"target": "example.com", "limit": 50}',
    input_schema: {
      type: 'object' as const,
      properties: {
        target: {
          type: 'string',
          description: 'Domain to analyze for broken backlinks'
        },
        limit: {
          type: 'number',
          description: 'Number of broken backlinks to return (default 50)'
        }
      },
      required: ['target']
    }
  },
  {
    name: 'ahrefs_keyword_ideas',
    description: 'Find keyword ideas matching a seed term. Returns related keywords with volume, difficulty, CPC, and traffic potential. Use for content planning or keyword gap analysis. COST: highest per-call cost (1000–5300 units) — this is the most expensive endpoint. Default limit=30, hard cap at 50. Never use multiple seeds in one call. Examples: {"keyword": "životné poistenie", "country": "sk", "limit": 30} or {"keyword": "IT kariéra", "country": "sk"}',
    input_schema: {
      type: 'object' as const,
      properties: {
        keyword: {
          type: 'string',
          description: 'Single seed keyword or phrase to find ideas for (one keyword only — multiple seeds multiply cost dramatically)'
        },
        country: {
          type: 'string',
          description: 'Country code (default "sk")'
        },
        limit: {
          type: 'number',
          description: 'Keyword ideas to return (default 30, enforced max 50). Lower = cheaper. 30 is sufficient for content planning.'
        }
      },
      required: ['keyword']
    }
  },
  {
    name: 'ahrefs_referring_domains',
    description: 'Get unique referring domains (websites) linking to a domain. Better for link building strategy than raw backlinks — shows domain-level authority signals. Use when user asks about referring domains, link building, or domain-level link analysis. Examples: {"target": "example.com", "limit": 50} or {"target": "example-dev.com", "limit": 20}',
    input_schema: {
      type: 'object' as const,
      properties: {
        target: {
          type: 'string',
          description: 'Domain to analyze'
        },
        limit: {
          type: 'number',
          description: 'Number of referring domains to return (default 50)'
        }
      },
      required: ['target']
    }
  },
  {
    name: 'ahrefs_budget',
    description: 'Check Ahrefs API subscription limits and current usage. Returns total_units, used_units, remaining_units, remaining_percent, reset_date, plus warning level (NORMAL / HIGH_USAGE / LOW) and top_consumers (which Brain tools are using most units this cycle). Use BEFORE expensive Ahrefs calls (keyword_ideas, organic_keywords with high limit, site_audit) to avoid hitting monthly cap. Cached 2h. Example: {} (no params needed).',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: []
    }
  },

  {
    name: 'ahrefs_batch_analysis',
    description: 'Analyze multiple domains at once (up to 20). Returns DR, organic traffic, and keywords count for each domain in a single API call. Much more efficient than individual lookups. Use when user wants to compare multiple domains or build a competitor overview table. Examples: {"targets": ["example.com", "example-dev.com", "example-qa.com"]} or {"targets": ["allianz.sk", "generali.sk", "nn.sk"], "date": "2026-03-01"}',
    input_schema: {
      type: 'object' as const,
      properties: {
        targets: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of domains to analyze (max 20, e.g., ["site1.com", "site2.com"])'
        },
        date: {
          type: 'string',
          description: 'Date YYYY-MM-DD (defaults to today)'
        }
      },
      required: ['targets']
    }
  },

  // ==================== SITE AUDIT TOOLS ====================
  {
    name: 'ahrefs_site_audit_projects',
    description: 'List Ahrefs Site Audit projects. Returns project IDs needed for site_audit_issues and site_audit_page_explorer. COST: 0 API units (metadata only). Known project IDs: example.com=4716186, example-dev.com=4716182, example-qa.com=4716181. Example: {} (no params needed)',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: []
    }
  },
  {
    name: 'ahrefs_site_audit_issues',
    description: 'Get technical SEO issues from Ahrefs Site Audit for a project. Returns issues grouped by severity (errors, warnings, notices). Use when user asks about technical SEO health, site audit, crawl issues. COST: ~50 API units per call. Examples: {"project_id": "4716186"} (example.com) or {"project_id": "4716182", "limit": 50} (example-dev.com)',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_id: {
          type: 'string',
          description: 'Site Audit project ID (get from ahrefs_site_audit_projects)'
        },
        limit: {
          type: 'number',
          description: 'Max issues to return (default 100, max 200)'
        }
      },
      required: ['project_id']
    }
  },
  {
    name: 'ahrefs_site_audit_page_explorer',
    description: 'Explore page-level crawl data from Ahrefs Site Audit. Shows crawled pages with status codes, response times, and on-page issues. COST: ~100 API units. Example: {"project_id": "4716186", "limit": 50}',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_id: {
          type: 'string',
          description: 'Site Audit project ID'
        },
        limit: {
          type: 'number',
          description: 'Max pages to return (default 50, max 200)'
        }
      },
      required: ['project_id']
    }
  },

  // ==================== KEYWORDS EXPLORER TOOLS ====================
  {
    name: 'ahrefs_related_terms',
    description: 'Find semantically related keyword terms for a seed keyword. Returns related keywords with volume, difficulty, and traffic potential. Use for content ideation and keyword clustering. COST: ~500-2000 API units. Example: {"keyword": "životné poistenie", "country": "sk", "limit": 30}',
    input_schema: {
      type: 'object' as const,
      properties: {
        keyword: {
          type: 'string',
          description: 'Seed keyword to find related terms for'
        },
        country: {
          type: 'string',
          description: 'Country code (default "sk")'
        },
        limit: {
          type: 'number',
          description: 'Max results (default 30, max 50)'
        }
      },
      required: ['keyword']
    }
  },
  {
    name: 'ahrefs_search_suggestions',
    description: 'Get autocomplete/search suggestions for a keyword. Returns what users actually type in search — great for long-tail discovery. COST: ~300-800 API units. Example: {"keyword": "poistenie", "country": "sk", "limit": 20}',
    input_schema: {
      type: 'object' as const,
      properties: {
        keyword: {
          type: 'string',
          description: 'Seed keyword for suggestions'
        },
        country: {
          type: 'string',
          description: 'Country code (default "sk")'
        },
        limit: {
          type: 'number',
          description: 'Max suggestions (default 30, max 50)'
        }
      },
      required: ['keyword']
    }
  },
  {
    name: 'ahrefs_volume_by_country',
    description: 'Get search volume breakdown by country for a keyword. Shows which countries have the most search demand. COST: ~200 API units. Example: {"keyword": "life insurance"}',
    input_schema: {
      type: 'object' as const,
      properties: {
        keyword: {
          type: 'string',
          description: 'Keyword to check volume across countries'
        }
      },
      required: ['keyword']
    }
  },

  // ==================== LINK ANALYSIS TOOLS ====================
  {
    name: 'ahrefs_anchors',
    description: 'Get anchor text analysis for a domain. Shows anchor text distribution — essential for link profile health check and over-optimization detection. COST: ~200-500 API units. Example: {"target": "example.com", "limit": 50}',
    input_schema: {
      type: 'object' as const,
      properties: {
        target: {
          type: 'string',
          description: 'Domain to analyze'
        },
        limit: {
          type: 'number',
          description: 'Max anchors (default 50, max 200)'
        }
      },
      required: ['target']
    }
  },
  {
    name: 'ahrefs_pages_by_backlinks',
    description: 'Get pages sorted by number of backlinks. Identifies most-linked content for link building strategy. COST: ~200-500 API units. Example: {"target": "example.com", "limit": 20}',
    input_schema: {
      type: 'object' as const,
      properties: {
        target: {
          type: 'string',
          description: 'Domain to analyze'
        },
        limit: {
          type: 'number',
          description: 'Max pages (default 50, max 200)'
        }
      },
      required: ['target']
    }
  },
  {
    name: 'ahrefs_pages_by_internal_links',
    description: 'Get internal link distribution across pages. Identifies orphan pages (few internal links) and over-linked pages. Essential for internal linking strategy. COST: ~100-300 API units. Example: {"target": "example.com", "limit": 50}',
    input_schema: {
      type: 'object' as const,
      properties: {
        target: {
          type: 'string',
          description: 'Domain to analyze'
        },
        limit: {
          type: 'number',
          description: 'Max pages (default 50, max 200)'
        }
      },
      required: ['target']
    }
  },
  {
    name: 'ahrefs_linked_anchors_internal',
    description: 'Get internal anchor text analysis. Shows anchor text diversity for internal links — helps optimize internal link anchor strategy. COST: ~100-300 API units. Example: {"target": "example.com", "limit": 50}',
    input_schema: {
      type: 'object' as const,
      properties: {
        target: {
          type: 'string',
          description: 'Domain to analyze'
        },
        limit: {
          type: 'number',
          description: 'Max anchors (default 50, max 200)'
        }
      },
      required: ['target']
    }
  },
  {
    name: 'ahrefs_pages_by_traffic',
    description: 'Get pages sorted by estimated organic traffic. Identifies top-performing content and traffic distribution patterns. COST: ~200-500 API units. Example: {"target": "example.com", "country": "sk", "limit": 20}',
    input_schema: {
      type: 'object' as const,
      properties: {
        target: {
          type: 'string',
          description: 'Domain to analyze'
        },
        country: {
          type: 'string',
          description: 'Country code (default "sk")'
        },
        limit: {
          type: 'number',
          description: 'Max pages (default 50, max 200)'
        }
      },
      required: ['target']
    }
  },
  {
    name: 'ahrefs_linked_domains',
    description: 'Get outbound linked domains from a site. Shows which external domains you link to most — useful for link auditing and partnership analysis. COST: ~200-500 API units. Example: {"target": "example.com", "limit": 50}',
    input_schema: {
      type: 'object' as const,
      properties: {
        target: {
          type: 'string',
          description: 'Domain to analyze'
        },
        limit: {
          type: 'number',
          description: 'Max domains (default 50, max 200)'
        }
      },
      required: ['target']
    }
  },

  // ==================== GSC TOOLS ====================
  {
    name: 'gsc_search_analytics',
    description: 'Get search analytics data from Google Search Console. IMPORTANT: Always ask the user for their desired date range before calling this tool. GSC data has 2-3 day delay. Max history: 16 months. Common ranges: 7d, 28d, 3m, 6m, 12m. CRITICAL: rowLimit is hard-capped at 1000 to prevent token overflow. Examples: {"siteUrl": "sc-domain:example.com", "startDate": "2026-02-11", "endDate": "2026-03-09", "dimensions": ["query"], "rowLimit": 100} or {"siteUrl": "https://example-dev.com/", "dimensions": ["page"], "rowLimit": 50}',
    input_schema: {
      type: 'object' as const,
      properties: {
        siteUrl: {
          type: 'string',
          description: 'Site URL in GSC format (e.g., "sc-domain:example.com" or "https://example.com/")'
        },
        startDate: {
          type: 'string',
          description: 'Start date (YYYY-MM-DD). Defaults to 28 days ago. Max history: 16 months.'
        },
        endDate: {
          type: 'string',
          description: 'End date (YYYY-MM-DD). Defaults to today minus 2 days (GSC data delay).'
        },
        dimensions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Dimensions to include: query, page, country, device, date (default: ["query"])'
        },
        rowLimit: {
          type: 'number',
          description: 'Max rows to return. Default 250. For complete exports set higher (e.g. 5000, 10000). When >500, data auto-saves as CSV file in user Files (prevents data loss). Max 25000.'
        },
        fetchAll: {
          type: 'boolean',
          description: 'Auto-paginate to fetch ALL rows (up to rowLimit). Auto-enabled when rowLimit>500. Result saved as CSV file, returns only top 10 summary. Always use this for "kompletný export" or "všetky keywords".'
        }
      },
      required: ['siteUrl']
    }
  },
  {
    name: 'gsc_quick_wins',
    description: 'Find quick win opportunities - keywords that are close to top positions and could be easily improved. Returns filtered list + total_found count + summary (high/medium potential distribution, total impressions/clicks). Hardcoded 50-row limit removed (Brain Pt.II Sprint 0); now parametrized with limit up to 1000 and per-filter thresholds. Examples: {"siteUrl": "sc-domain:example.com"} (defaults: pos 4-20, imp>=10, limit 200) or {"siteUrl": "sc-domain:example.com", "limit": 500, "minImpressions": 100, "sort": "impressions"} for deeper discovery.',
    input_schema: {
      type: 'object' as const,
      properties: {
        siteUrl: {
          type: 'string',
          description: 'Site URL in GSC format (e.g., "sc-domain:example.com")'
        },
        minPosition: {
          type: 'number',
          description: 'Minimum ranking position (inclusive). Default 4. Set higher (e.g., 11) to focus on page 2 → page 1 opportunities.'
        },
        maxPosition: {
          type: 'number',
          description: 'Maximum ranking position (inclusive). Default 20. Set lower (e.g., 10) to focus only on top-10 CTR optimization.'
        },
        minImpressions: {
          type: 'number',
          description: 'Minimum monthly impressions threshold. Default 10. Raise to 50-100 to filter noise and focus on genuine opportunities.'
        },
        minClicks: {
          type: 'number',
          description: 'Minimum clicks threshold. Default 0 (include zero-click). Set to 1+ to exclude queries that currently bring no traffic.'
        },
        limit: {
          type: 'number',
          description: 'Max opportunities to return. Default 200. Hard max 1000. Returns total_found count separately so you know how many matches exist beyond the limit.'
        },
        sort: {
          type: 'string',
          enum: ['position', 'impressions', 'clicks'],
          description: 'Sort ranking. Default "position" (lowest first = closest to top). Use "impressions" for biggest opportunity sizing, "clicks" for current traffic generators.'
        }
      },
      required: ['siteUrl']
    }
  },

  {
    name: 'gsc_compare_periods',
    description: 'Compare GSC search performance across two date periods. Returns diff (per query or page) with direction (improved/declined/stable/new/lost), position change, click/impression delta, severity (low/medium/high), plus overall summary. Powers content decay detection, period-over-period health monitoring, post-launch impact analysis. Auto-sorts high-severity declined items first. Example for content decay detection: {"siteUrl": "sc-domain:example.com", "period1": {"startDate": "2026-01-22", "endDate": "2026-02-22", "label": "Jan"}, "period2": {"startDate": "2026-03-22", "endDate": "2026-04-22", "label": "Apr"}, "dimension": "query", "minChangeThreshold": 3}',
    input_schema: {
      type: 'object' as const,
      properties: {
        siteUrl: {
          type: 'string',
          description: 'Site URL in GSC format (e.g., "sc-domain:example.com")'
        },
        period1: {
          type: 'object',
          description: 'Baseline period (earlier). Required fields: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD). Optional: label.',
          properties: {
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            label: { type: 'string' },
          },
          required: ['startDate', 'endDate'],
        },
        period2: {
          type: 'object',
          description: 'Current period (later, compared against baseline). Same shape as period1.',
          properties: {
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            label: { type: 'string' },
          },
          required: ['startDate', 'endDate'],
        },
        dimension: {
          type: 'string',
          enum: ['query', 'page'],
          description: 'Compare by query (default, keyword-level decay) or page (URL-level performance).'
        },
        minImpressions: {
          type: 'number',
          description: 'Filter out low-signal rows. Default 50. Raise to 100-500 for high-traffic-only focus.'
        },
        minChangeThreshold: {
          type: 'number',
          description: 'Filter to meaningful changes. Default 0 (include all). Set to 3 to only return rows with position change ≥3 OR click% change ≥3%. Use to focus on actionable items.'
        },
        limit: {
          type: 'number',
          description: 'Max diff rows to return (after severity-sorted). Default 100. Hard max 500. Summary always reports total regardless.'
        },
        rowLimit: {
          type: 'number',
          description: 'Per-period raw fetch limit. Default 5000. Cap 5000 (GSC per-call hard max). Each period is a separate API call.'
        },
      },
      required: ['siteUrl', 'period1', 'period2']
    }
  },

  {
    name: 'gsc_tech_seo',
    description: '⚠️ SCHEMA LIMITATION: rich_results field does NOT return all structured data types. JobPosting, FAQPage, HowTo, Article and most other schema.org types are OFTEN MISSING even when valid and indexed. GSC returns only "visually prominent rich results" (breadcrumbs, reviews, events). For comprehensive schema audit → use web_render to extract <script type="application/ld+json"> blocks instead. Tool is RELIABLE for: indexing status, crawlability, mobile usability, sitemaps, Core Web Vitals (LCP/CLS/INP/TTFB from CrUX). Use when user asks about indexing, crawlability, CWV, page speed, or technical SEO health (but NOT for complete schema validation). Examples: {"action": "inspect_url", "site_url": "sc-domain:example.com", "inspect_url": "https://example.com/o-nas"} or {"action": "core_web_vitals", "site_url": "https://example.com"} or {"action": "inspect_batch", "site_url": "sc-domain:example.com", "urls": ["https://example.com/o-nas", "https://example.com/kariera"]}',
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['inspect_url', 'list_sitemaps', 'core_web_vitals', 'inspect_batch'],
          description: 'Action: inspect_url (single URL index status), inspect_batch (multiple URLs 2-20), list_sitemaps (sitemap status), core_web_vitals (LCP/CLS/INP/TTFB from CrUX)'
        },
        site_url: {
          type: 'string',
          description: 'Site URL in GSC format for inspect_url/inspect_batch/list_sitemaps (e.g., "sc-domain:example.com"). For core_web_vitals, use origin URL (e.g., "https://example.com").'
        },
        inspect_url: {
          type: 'string',
          description: 'Full URL to inspect (required for inspect_url action, e.g., "https://example.com/o-nas")'
        },
        urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of URLs to inspect in batch (required for inspect_batch action, min 2, max 20)'
        }
      },
      required: ['action', 'site_url']
    }
  },

  // ==================== GA4 TOOLS (via Google Analytics Data API v1beta) ====================
  {
    name: 'ga4_run_report',
    description: 'Run custom Google Analytics 4 report. Returns rows with dimension values + metric values. Use when user asks about traffic, users, sessions, pageviews, conversions, or any GA4 metric. siteUrl can be a domain string (e.g. "example.com") OR a raw GA4 property ID (numeric). Common date formats: "7daysAgo", "28daysAgo", "yesterday", "today", or "YYYY-MM-DD". Common dimensions: date, country, city, deviceCategory, sessionDefaultChannelGroup, pagePath, pageTitle, sessionSource, sessionMedium. Common metrics: activeUsers, sessions, screenPageViews, eventCount, conversions, totalRevenue, bounceRate, averageSessionDuration. Examples: {"siteUrl": "example.com", "dimensions": ["pagePath"], "metrics": ["screenPageViews", "activeUsers"], "limit": 50, "orderBy": {"metric": "screenPageViews", "desc": true}} for top pages, or {"siteUrl": "example.com", "startDate": "30daysAgo", "dimensions": ["sessionDefaultChannelGroup"], "metrics": ["sessions"]} for traffic by channel.',
    input_schema: {
      type: 'object' as const,
      properties: {
        siteUrl: { type: 'string', description: 'Domain (e.g. "example.com") OR raw GA4 property ID (numeric, e.g. "123456789")' },
        startDate: { type: 'string', description: 'Start date — YYYY-MM-DD or "NdaysAgo" (default "7daysAgo")' },
        endDate: { type: 'string', description: 'End date — YYYY-MM-DD, "yesterday" or "today" (default "today")' },
        dimensions: { type: 'array', items: { type: 'string' }, description: 'GA4 dimensions (default ["date"])' },
        metrics: { type: 'array', items: { type: 'string' }, description: 'GA4 metrics (default ["activeUsers","sessions"])' },
        limit: { type: 'number', description: 'Max rows (default 100, hard cap 10000)' },
        orderBy: {
          type: 'object',
          description: 'Sort spec: { metric: "metricName", desc: true } OR { dimension: "dimName", desc: false }',
          properties: {
            metric: { type: 'string' },
            dimension: { type: 'string' },
            desc: { type: 'boolean' },
          }
        }
      },
      required: ['siteUrl']
    }
  },
  {
    name: 'ga4_traffic_overview',
    description: 'Quick traffic overview for a GA4 property — sessions, users, pageviews, bounceRate, avgSessionDuration broken down by channel (Direct, Organic Search, Referral, Social, etc.). Use when user asks "how is traffic on X domain" or "where are visitors coming from". Default 28 days. Example: {"siteUrl": "example.com"} or {"siteUrl": "example-dev.com", "startDate": "90daysAgo"}.',
    input_schema: {
      type: 'object' as const,
      properties: {
        siteUrl: { type: 'string', description: 'Domain (e.g. "example.com") OR raw GA4 property ID' },
        startDate: { type: 'string', description: 'Start date (default "28daysAgo")' },
        endDate: { type: 'string', description: 'End date (default "yesterday")' }
      },
      required: ['siteUrl']
    }
  },
  {
    name: 'ga4_realtime_users',
    description: 'GA4 real-time report — active users right now (last 30 minutes). Use when user asks "how many users are on the site now" or "is the campaign live". Returns active users by country (default) or by other realtime dimension. Example: {"siteUrl": "example.com"} or {"siteUrl": "example.com", "dimensions": ["unifiedScreenName"]}.',
    input_schema: {
      type: 'object' as const,
      properties: {
        siteUrl: { type: 'string', description: 'Domain (e.g. "example.com") OR raw GA4 property ID' },
        dimensions: { type: 'array', items: { type: 'string' }, description: 'Realtime dimensions (default ["country"])' }
      },
      required: ['siteUrl']
    }
  },

  // ==================== UNIFIED CONTEXT RETRIEVAL (D4 crown) ====================
  {
    name: 'context_search',
    description: 'CROWN TOOL — single semantic search across ALL Brain data layers in one call: brain_memories (BUM, amygdala-aware) + articles (1079+ scraped from msg domains) + brain_embeddings (knowledge files + agents + brand assets + templates). Returns unified ranked list with source tags. Use INSTEAD OF separate calls when user asks open-ended "spomeň si na X", "find anything related to Y", "what do we know about Z" — Brain figures out which layers to merge. Best leverage tool for cross-domain recall. Examples: {"query": "msg cloud security strategy"}, {"query": "kybernetická bezpečnosť", "sources": ["article","knowledge"]}, {"query": "obsah o kariére", "limit": 20, "minScore": 0.2}.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query (Slovak or English)' },
        limit: { type: 'number', description: 'Max total results across ALL sources (default 15, hard cap 50)' },
        perSource: { type: 'number', description: 'Max results pulled from each source before fusion (default 8, hard cap 20)' },
        minScore: { type: 'number', description: 'Min similarity score (0-1, default 0.25)' },
        sources: {
          type: 'array', items: { type: 'string' },
          description: 'Optional filter: ["memory","article","knowledge","agent","brand","template"]. Default = all.'
        }
      },
      required: ['query']
    }
  },

  // ==================== ARTICLES SEMANTIC SEARCH (vector layer) ====================
  {
    name: 'articles_search',
    description: 'Semantic search across scraped example.com + example-qa.com + example-dev.com articles (1079+ indexed via vector embedding). Use when user asks "do we have content about X", "find related articles to topic Y", "what does our content say about Z", or for content gap analysis. Three search modes: semantic (default — meaning-based), lexical (keyword exact match), hybrid (best of both). Always prefer this over web_search for OWN content. Examples: {"query": "cloud security architecture"}, {"query": "kybernetická bezpečnosť", "domain": "example-dev.com", "limit": 20}, {"query": "career development", "mode": "hybrid", "minScore": 0.4}.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query (Slovak or English, single sentence works best)' },
        mode: { type: 'string', enum: ['semantic', 'lexical', 'hybrid'], description: 'Default "semantic" (meaning-based). "lexical" = keyword exact (ts_rank). "hybrid" = weighted fusion 60/40 semantic+lexical.' },
        domain: { type: 'string', description: 'Optional filter: example.com / example-qa.com / example-dev.com' },
        limit: { type: 'number', description: 'Max results (default 10, hard cap 50)' },
        minScore: { type: 'number', description: 'Min similarity score (0-1, default 0.2 semantic / 0.001 lexical / 0.15 hybrid)' }
      },
      required: ['query']
    }
  },
  {
    name: 'articles_similar',
    description: 'Find articles similar to a given article (Smart Connections style — semantic neighbours). Use when user asks "what other articles relate to this one" or for cross-link suggestions. Returns top similar articles by cosine similarity. Example: {"articleId": "abc-uuid-of-source-article", "limit": 10}.',
    input_schema: {
      type: 'object' as const,
      properties: {
        articleId: { type: 'string', description: 'UUID of source article' },
        limit: { type: 'number', description: 'Max similar results (default 10)' }
      },
      required: ['articleId']
    }
  },

  // ==================== UTILITY TOOLS ====================
  {
    name: 'web_fetch',
    description: '⚠️ LIMITED USE — only for plain HTML pages or REST APIs that return JSON. Does NOT render JavaScript. DO NOT use for: (a) technical SEO audits (use web_render — needs full DOM with computed styles, lazy-loaded content, meta tags injected by JS), (b) WordPress sites (example.com, example-dev.com, tippland.de — WP rendering is JS-augmented, fetch often returns partial content), (c) any site with React/Vue/Astro hydration. For these cases ALWAYS use web_render — slower but returns the real, fully-rendered DOM. Example for plain HTML/JSON only: {"url": "https://api.example.com/data.json"}',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'Full URL to fetch (e.g., "https://example.com/page")'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'web_render',
    description: '✅ PREFERRED for tech SEO audits, WordPress, and any non-trivial page. Full headless Chromium render — returns real DOM with JS hydration, lazy-loaded content, computed meta tags, all hreflang/canonical/OG tags as the browser sees them. USE for: (a) ALL technical SEO audits (example.com and other msg WordPress sites included), (b) SPAs / React / Vue / Astro hydrated pages, (c) any dashboard / app surface, (d) Schema.org JSON-LD validation (only present after JS), (e) Core Web Vitals context. Slower than web_fetch but the only reliable choice when content correctness matters. Supports interactive actions (click, fill, select). Examples: {"url": "https://example.com/praca/", "wait_for": "main", "extract_tables": false, "content_max_length": 30000} or {"url": "https://app.example.com", "actions": [{"type": "click", "target": "Export"}]}.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'Full URL to render'
        },
        wait_for: {
          type: 'string',
          description: 'Optional CSS selector to wait for before extracting content (e.g., "table", ".chart-container")'
        },
        extract_tables: {
          type: 'boolean',
          description: 'If true, extracts all HTML tables as structured data (headers + rows).'
        },
        actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['click', 'fill', 'select', 'wait'], description: 'Action type' },
              target: { type: 'string', description: 'For click: text to click or CSS selector. For fill: CSS selector. For wait: milliseconds as string.' },
              value: { type: 'string', description: 'Value for fill/select actions' },
              wait_after: { type: 'number', description: 'Milliseconds to wait after action (default 5000)' }
            },
            required: ['type', 'target']
          },
          description: 'Sequential browser actions to perform before extraction. Use for clicking tabs, filling forms, changing date ranges.'
        },
        content_max_length: {
          type: 'number',
          description: 'Max characters of text content to return (default 10000, max 50000). Use higher values for data-heavy pages.'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'plan_task',
    description: 'Emit a structured execution plan before starting a complex multi-step task. Call this FIRST when a request requires 3+ steps, multiple tool sequences, or cross-agent coordination. The plan is shown to the user for approval before execution begins. Use plan_task to think through the full scope before committing. Example: plan a full SEO audit before calling any Ahrefs tools.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Short plan title (max 60 chars)' },
        goal: { type: 'string', description: 'What we aim to achieve — 1–2 sentences' },
        scope_in: { type: 'string', description: 'What is explicitly in scope' },
        scope_out: { type: 'string', description: 'What is explicitly out of scope (important for expectation management)' },
        steps: {
          type: 'array',
          description: 'Ordered execution steps (max 10)',
          items: {
            type: 'object',
            properties: {
              n: { type: 'number', description: 'Step number (1-based)' },
              title: { type: 'string', description: 'Short step label' },
              description: { type: 'string', description: 'What this step does, 1–2 sentences' },
              tools: { type: 'array', items: { type: 'string' }, description: 'Tool names this step will call' },
              output: { type: 'string', description: 'Expected deliverable of this step' },
            },
            required: ['n', 'title', 'description', 'tools', 'output']
          }
        },
        risks: {
          type: 'array',
          items: { type: 'string' },
          description: 'Known risks, unknowns, or assumptions that could affect the plan'
        },
        api_unit_estimate: { type: 'number', description: 'Estimated Ahrefs API units this plan will consume (optional)' },
      },
      required: ['title', 'goal', 'steps']
    }
  },
  {
    name: 'lighthouse_audit',
    description: 'Run a full Lighthouse audit via Google PageSpeed Insights API. Returns Lighthouse scores (0–100) for Performance, Accessibility, Best Practices, and SEO, plus field data (Core Web Vitals from CrUX). Works on ANY public URL — not limited to tracked domains. Use alongside gsc_tech_seo + web_render for a complete web audit. Strategy: "mobile" (default) or "desktop". Example: {"url": "https://example.com/praca/", "strategy": "mobile"}',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'Full URL to audit (must be publicly accessible)'
        },
        strategy: {
          type: 'string',
          enum: ['mobile', 'desktop'],
          description: 'Viewport strategy. "mobile" = Lighthouse mobile emulation (default). "desktop" = full desktop.'
        },
        categories: {
          type: 'array',
          items: { type: 'string', enum: ['performance', 'accessibility', 'best-practices', 'seo'] },
          description: 'Lighthouse categories to include (default: all four).'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'get_current_date',
    description: 'Get the current date and time. Use when user asks about today\'s date or needs timestamp. Example: {} (no params needed)',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: []
    }
  },
  {
    name: 'suggest_ahrefs_export',
    description: 'Generate Ahrefs export URL and suggestion message for manual CSV export. Use when user needs complete dataset (>100 rows), full backlink audit, content gap analysis, or anchor text audit. Returns formatted message with one-click export URL. FREE - consumes 0 API units. Examples: {"export_type": "organic_keywords", "target": "example.com"} or {"export_type": "content_gap", "target": "example.com", "competitors": ["allianz.sk", "generali.sk"]}',
    input_schema: {
      type: 'object' as const,
      properties: {
        export_type: {
          type: 'string',
          enum: ['organic_keywords', 'referring_domains', 'anchors', 'internal_anchors', 'backlinks', 'content_gap', 'referring_ips'],
          description: 'Type of Ahrefs export to suggest'
        },
        target: {
          type: 'string',
          description: 'Domain or URL to analyze (e.g., "example.com")'
        },
        competitors: {
          type: 'array',
          items: { type: 'string' },
          description: 'Competitor domains (only for content_gap export type)'
        },
        estimated_rows: {
          type: 'number',
          description: 'Estimated number of rows in export (optional, for user context)'
        },
        estimated_units: {
          type: 'number',
          description: 'Estimated API units the equivalent API call would cost (optional, shows savings)'
        }
      },
      required: ['export_type', 'target']
    }
  },
  {
    name: 'content_calendar',
    description: 'Manage content calendar entries: create, update, list, or advance status of content items. Use when user wants to plan content, add ideas, create briefs, track content pipeline, or manage editorial calendar. Examples: {"action": "create", "title": "Prečo sa poistiť", "contentType": "article", "keywords": ["životné poistenie"], "deadline": "2026-04-01"} or {"action": "list", "filterStatus": "draft"} or {"action": "advance_status", "itemId": "uuid-here"}',
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'list', 'advance_status'],
          description: 'Action to perform on content calendar'
        },
        title: {
          type: 'string',
          description: 'Title of the content item (required for create)'
        },
        description: {
          type: 'string',
          description: 'Description or notes for the content item'
        },
        status: {
          type: 'string',
          enum: ['idea', 'brief', 'draft', 'review', 'published', 'archived'],
          description: 'Content status'
        },
        contentType: {
          type: 'string',
          enum: ['article', 'landing-page', 'guide', 'case-study', 'infographic', 'video-script'],
          description: 'Type of content'
        },
        deadline: {
          type: 'string',
          description: 'Deadline date (YYYY-MM-DD)'
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Target keywords for SEO'
        },
        notes: {
          type: 'string',
          description: 'Additional notes'
        },
        itemId: {
          type: 'string',
          description: 'ID of existing item (required for update and advance_status)'
        },
        filterStatus: {
          type: 'string',
          description: 'Filter items by status when listing'
        },
        filterSearch: {
          type: 'string',
          description: 'Search filter for listing'
        },
        siteId: {
          type: 'string',
          description: 'Site ID (UUID) to assign content to'
        }
      },
      required: ['action']
    }
  },

  // ==================== FILE MANAGEMENT ====================
  {
    name: 'read_user_file',
    description: 'Read a previously-saved user file (CSV/JSON/MD/TXT/HTML/XLSX) with filter/sort/limit/column selection. CRITICAL for multi-step analysis: lets you read your own exports (e.g., a 5000-row GSC CSV you saved earlier) and filter to specific subsets without re-fetching from the API. Security: only reads files you own or that are shared with you, never arbitrary paths. Example uses: {"filename": "gsc-example-org-queries.csv", "filter": "position >= 4 AND position <= 20 AND impressions > 100", "sort": {"column": "impressions", "direction": "desc"}, "limit": 200} (top 200 quick-win candidates); {"filename": "brand-voice-guide.md"} (read full doc); {"filename": "keyword-export.csv", "columns": ["keyword", "volume", "difficulty"], "limit": 100}.',
    input_schema: {
      type: 'object' as const,
      properties: {
        filename: {
          type: 'string',
          description: 'File name (original_name) or UUID. Scoped to your own files + shared files.'
        },
        limit: {
          type: 'number',
          description: 'Max rows to return. Default 500, hard max 5000. Use together with offset for pagination.'
        },
        offset: {
          type: 'number',
          description: 'Row offset for pagination. Default 0.'
        },
        columns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter output to specific columns (CSV/XLSX only). Omit to return all columns.'
        },
        filter: {
          type: 'string',
          description: 'Simple filter expression: "column op value [AND|OR column op value ...]". Operators: =, !=, >, <, >=, <=, contains, notContains, startsWith, endsWith. String values quote-wrapped; numbers bare. Example: "position < 10 AND impressions > 100" or "query contains \\"kariera\\"".'
        },
        sort: {
          type: 'object',
          description: 'Sort spec: {column: string, direction?: "asc"|"desc"}. Applied before limit/offset.',
          properties: {
            column: { type: 'string' },
            direction: { type: 'string', enum: ['asc', 'desc'] }
          },
          required: ['column']
        }
      },
      required: ['filename']
    }
  },

  {
    name: 'save_user_file',
    description: 'Creates and saves a file in any format (CSV, JSON, MD, HTML, XLSX, DOCX, TXT) to user files. Choose the BEST format for the content: CSV for tabular data/datasets, JSON for structured API data, MD for reports/analyses/documentation, HTML for styled reports with tables and charts, XLSX only when user explicitly requests Excel, DOCX only when user explicitly requests Word, TXT for plain text. IMPORTANT: Do NOT default to XLSX — prefer CSV for data and MD for text reports. The file will be available in the user\'s Files section for download. Examples: {"filename": "keywords-analysis.csv", "format": "csv", "data": "[{\\"keyword\\":\\"test\\",\\"volume\\":100}]"} or {"filename": "seo-report.md", "format": "md", "data": "# SEO Report\\n\\n..."}',
    input_schema: {
      type: 'object' as const,
      properties: {
        filename: {
          type: 'string',
          description: 'Filename with extension (e.g., "keywords-analysis-2026-02-20.xlsx", "report.csv")'
        },
        format: {
          type: 'string',
          enum: ['xlsx', 'csv', 'docx', 'json', 'html', 'md', 'txt'],
          description: 'File format — prefer: csv (tabular data, datasets), md (reports, analyses), json (structured/API data), html (styled reports). Use only if requested: xlsx (Excel), docx (Word), txt (plain text)'
        },
        data: {
          type: 'string',
          description: 'Data to save. For XLSX/CSV: JSON array of objects (e.g., JSON.stringify([{col1: "value1", col2: 123}, ...])) or markdown table. For DOCX/HTML/MD: formatted text content. For JSON: JSON string.'
        },
        description: {
          type: 'string',
          description: 'Optional description of the file (shown in Files list)'
        }
      },
      required: ['filename', 'format', 'data']
    }
  },

  // ==================== AGENT MANAGEMENT ====================
  {
    name: 'manage_agent',
    description: `Create, update, or extend Brain agents. Use this when the user asks to:
- Create a new agent ("chcem nového agenta", "vytvor mi agenta pre...")
- Update a custom agent they already have
- Extend a base specialist (add custom description or extra instructions to one of the 6 base agents)
- Deactivate a custom agent

Actions:
  create  — create a new team-shared custom agent
  update  — update an existing custom agent by slug
  extend  — add extra instructions/keywords to a base specialist
  delete  — deactivate a custom agent

Model options: haiku (fast, simple tasks), sonnet (balanced), sonnet-high (complex analysis)
Tools: empty array [] = access to ALL tools; specific tool IDs = restricted access`,
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'extend', 'delete', 'get', 'list'],
          description: 'CRUD action. Always "get" the current definition BEFORE update/extend, and "get" again AFTER to verify the change persisted (do not assume — read it back). "list" returns all agents. get/list are read-only (any user); create/update/extend/delete require admin.'
        },
        slug: {
          type: 'string',
          description: 'Agent identifier — lowercase, alphanumeric + hyphens (e.g. "hr-writer"). Required for all actions except "list".'
        },
        name: {
          type: 'string',
          description: 'Display name shown in the UI (e.g. "HR Writer"). Required for create.'
        },
        description: {
          type: 'string',
          description: 'Short description of what this agent does (shown in UI cards)'
        },
        system_prompt: {
          type: 'string',
          description: 'The full system prompt / instructions for this agent. Required for create. For extend action: this is the extra_system_prompt appended to the base specialist.'
        },
        model: {
          type: 'string',
          enum: ['haiku', 'sonnet', 'sonnet-high'],
          description: 'Model to use. Default: sonnet'
        },
        tools: {
          type: 'array',
          items: { type: 'string' },
          description: 'Allowed tool IDs. Empty array = ALL tools. Omit for full access.'
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Keywords/phrases for auto-routing (when user message matches, this agent activates)'
        },
        color: {
          type: 'string',
          description: 'Hex color for UI card (e.g. "#805AD5"). Default: #6B7280'
        },
        icon: {
          type: 'string',
          description: 'Emoji icon for UI card (e.g. "🖊️"). Default: 🤖'
        }
      },
      required: ['action', 'slug']
    }
  },
  // ==================== PERSONA MANAGEMENT ====================
  {
    name: 'manage_persona',
    description: `Create, update, or delete Brain personas. Use this when the user asks to:
- Create a new persona ("vytvor personu pre...", "add a persona for...")
- Update an existing persona (built-in OR custom)
- Delete / hide a persona
- Get full details of a persona including its system prompt
- List all available personas

Personas are DUAL-USE — a persona is a system-prompt fragment + metadata that can be applied:
  1. As a REASONING LENS: analyse/critique/think AS this persona's mindset (e.g. Pacifist, Stratég)
  2. As a TARGET AUDIENCE / SPECIALIST VOICE: write/analyse/explain FOR or AS a role (e.g. "Automation Engineer", "QA Lead", "New Employee")

Both uses share the same storage. The system_prompt should describe the perspective, vocabulary, priorities, and behaviours of the persona.

Actions:
  create  — create a new custom persona
  update  — update a persona by slug (works on built-ins too — creates an override row)
  delete  — soft-deactivate a custom persona; if slug matches a built-in, hides the built-in
  get     — read full persona details including system_prompt (read-only, any user)
  list    — list all active personas with slug/name/icon/kind (read-only, any user)

Always "get" the current definition BEFORE update, and "get" again AFTER to verify the change persisted.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'delete', 'get', 'list'],
          description: 'CRUD action. get/list are read-only (any user); create/update/delete require admin.'
        },
        slug: {
          type: 'string',
          description: 'Persona identifier — lowercase, alphanumeric + hyphens (e.g. "automation-engineer"). Required for all actions except "list".'
        },
        name: {
          type: 'string',
          description: 'Display name (e.g. "Automation Engineer"). Required for create.'
        },
        name_localized: {
          type: 'string',
          description: 'Localized name in Slovak (e.g. "Automatizačný inžinier"). Optional.'
        },
        description: {
          type: 'string',
          description: 'Short description of the persona\'s perspective (shown in UI cards)'
        },
        system_prompt: {
          type: 'string',
          description: 'Full system prompt describing the persona\'s mindset, priorities, and behaviours. Required for create.'
        },
        icon: {
          type: 'string',
          description: 'Emoji icon (e.g. "🤖"). Default: 🎭'
        },
        color: {
          type: 'string',
          description: 'Hex color for UI card (e.g. "#805AD5"). Default: #6B7280'
        }
      },
      required: ['action']
    }
  },
  // ==================== HIVE STACK DOCS ====================
  {
    name: 'docs_query',
    description: 'Search official documentation for our tech stack (Anthropic Claude API, pgvector, TimescaleDB, Apache AGE, Express, Node.js, React, Tailwind, Astro, PostgreSQL). Returns the most relevant doc sections as Markdown. Use when the user asks how to use a library, API reference, code examples, or "how do I..." for any of the supported stacks. Examples: {"query": "how to use prompt caching"} or {"query": "pgvector cosine similarity index", "stack": "pgvector"} or {"query": "TimescaleDB continuous aggregates", "stack": "timescaledb"}',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query — what you want to find in the docs'
        },
        stack: {
          type: 'string',
          enum: ['anthropic', 'pgvector', 'timescaledb', 'apache-age', 'express', 'nodejs', 'react', 'tailwind', 'astro', 'postgresql'],
          description: 'Optional: narrow search to a specific tech stack'
        },
        limit: {
          type: 'number',
          description: 'Number of doc chunks to return (default 3, max 6)'
        }
      },
      required: ['query']
    }
  },
  // ==================== GA4 MAX (Run T, 2026-05-26) ====================
  // 12 expansion tools — see services/ga4-api.ts for SDK wrappers.
  // Token budgets registered in TOOL_TOKEN_COSTS, category in TOOL_CATEGORIES.ga4.
  {
    name: 'ga4_landing_pages',
    description: 'Top landing pages by sessions with engagement metrics (engagedSessions, engagementRate, avgSessionDuration, conversions). Pairs with gsc_quick_wins for traffic+keyword analysis.',
    input_schema: {
      type: 'object' as const,
      properties: {
        siteUrl: { type: 'string', description: 'Domain or GA4 property ID' },
        startDate: { type: 'string', description: 'Default 28daysAgo' },
        endDate: { type: 'string', description: 'Default yesterday' },
        limit: { type: 'number', description: 'Default 30, cap 100' },
        minSessions: { type: 'number', description: 'Filter out low-traffic rows; default 10' },
      },
      required: ['siteUrl'],
    }
  },
  {
    name: 'ga4_page_engagement',
    description: 'Per-page engagement diagnostics (scroll depth, time on page, exits). Content decay signal — find pages where users land but disengage.',
    input_schema: {
      type: 'object' as const,
      properties: {
        siteUrl: { type: 'string' },
        pagePath: { type: 'string', description: 'Exact path filter, e.g. /clanky/seo-trends' },
        pagePathContains: { type: 'string', description: 'Substring filter alternative' },
        startDate: { type: 'string' }, endDate: { type: 'string' },
        limit: { type: 'number', description: 'Default 50' },
      },
      required: ['siteUrl'],
    }
  },
  {
    name: 'ga4_source_medium',
    description: 'Acquisition by source/medium pair — distinguish organic Google vs direct vs referral chains. Returns sessions, newUsers, conversionRate per pair.',
    input_schema: {
      type: 'object' as const,
      properties: {
        siteUrl: { type: 'string' },
        startDate: { type: 'string' }, endDate: { type: 'string' },
        limit: { type: 'number', description: 'Default 40' },
      },
      required: ['siteUrl'],
    }
  },
  {
    name: 'ga4_geo_breakdown',
    description: 'Country/city/region breakdown with device split. Use country level for example-org Slovakia focus; city level when narrowing in.',
    input_schema: {
      type: 'object' as const,
      properties: {
        siteUrl: { type: 'string' },
        level: { type: 'string', enum: ['country', 'city', 'region'], description: 'Default country' },
        filterCountry: { type: 'string', description: 'Optional ISO-2 (e.g. SK) to narrow to one country at city level' },
        startDate: { type: 'string' }, endDate: { type: 'string' },
        limit: { type: 'number', description: 'Default 30' },
      },
      required: ['siteUrl'],
    }
  },
  {
    name: 'ga4_device_breakdown',
    description: 'deviceCategory × browser × OS — mobile-first audit. Returns sessions, engagementRate, conversions per combo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        siteUrl: { type: 'string' },
        startDate: { type: 'string' }, endDate: { type: 'string' },
        breakdown: { type: 'string', enum: ['device', 'device_browser', 'device_browser_os'], description: 'Default device_browser' },
        limit: { type: 'number', description: 'Default 30' },
      },
      required: ['siteUrl'],
    }
  },
  {
    name: 'ga4_key_events',
    description: 'Conversion/key event volume per event_name with optional breakdown by page or source. example-org common events: form_submit, scroll, click, session_start. Agent should call ga4_metadata first to discover custom events specific to the property.',
    input_schema: {
      type: 'object' as const,
      properties: {
        siteUrl: { type: 'string' },
        eventName: { type: 'string', description: 'Optional — filter to one event_name' },
        breakBy: { type: 'string', enum: ['pagePath', 'sessionSource', 'sessionMedium', 'deviceCategory'], description: 'Optional second dimension' },
        startDate: { type: 'string' }, endDate: { type: 'string' },
        limit: { type: 'number', description: 'Default 30' },
      },
      required: ['siteUrl'],
    }
  },
  {
    name: 'ga4_channel_attribution',
    description: 'Channel group attribution with first-click vs last-click vs DDA comparison for a chosen conversion event. Reveals which channels assist vs which close.',
    input_schema: {
      type: 'object' as const,
      properties: {
        siteUrl: { type: 'string' },
        conversionEvent: { type: 'string', description: 'Event name to attribute (default: any key_event)' },
        startDate: { type: 'string' }, endDate: { type: 'string' },
      },
      required: ['siteUrl'],
    }
  },
  {
    name: 'ga4_compare_periods',
    description: 'Period-over-period delta (WoW, MoM, YoY) for any metric × dimension. Mirrors gsc_compare_periods. Returns rows with currentValue, previousValue, deltaAbs, deltaPct.',
    input_schema: {
      type: 'object' as const,
      properties: {
        siteUrl: { type: 'string' },
        metrics: { type: 'array', items: { type: 'string' }, description: 'Default [sessions, activeUsers]' },
        dimensions: { type: 'array', items: { type: 'string' }, description: 'Default [date]' },
        preset: { type: 'string', enum: ['WoW', 'MoM', 'YoY'], description: 'Shortcut — auto-fills the 4 dates' },
        currentStart: { type: 'string' }, currentEnd: { type: 'string' },
        previousStart: { type: 'string' }, previousEnd: { type: 'string' },
        limit: { type: 'number', description: 'Default 30' },
      },
      required: ['siteUrl'],
    }
  },
  {
    name: 'ga4_funnel_report',
    description: 'Sequential funnel analysis (landing → article → CTA → conversion). Default example-org funnel: organic landing → article view → application/contact. Override `steps` for ad-hoc funnels. Uses v1alpha runFunnelReport when available, falls back to per-step approximation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        siteUrl: { type: 'string' },
        steps: {
          type: 'array',
          description: 'Default example-org basic funnel if omitted.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              filter: {
                type: 'object',
                properties: {
                  eventName: { type: 'string' },
                  pagePathContains: { type: 'string' },
                }
              }
            }
          }
        },
        startDate: { type: 'string' }, endDate: { type: 'string' },
      },
      required: ['siteUrl'],
    }
  },
  {
    name: 'ga4_cohort_retention',
    description: 'Cohort retention matrix — weekly by default (example-org content cycle). Daily / monthly supported. Tracks N-period return rate per acquisition cohort.',
    input_schema: {
      type: 'object' as const,
      properties: {
        siteUrl: { type: 'string' },
        granularity: { type: 'string', enum: ['DAILY', 'WEEKLY', 'MONTHLY'], description: 'Default WEEKLY' },
        cohortSize: { type: 'number', description: 'Number of cohorts (default 6, max 12)' },
        metric: { type: 'string', description: 'Default cohortActiveUsers' },
      },
      required: ['siteUrl'],
    }
  },
  {
    name: 'ga4_path_exploration',
    description: 'Page-to-page next/previous step analysis — UX flow trace. Top adjacent pages by traffic share for a chosen startPage. Forward = where users go next, backward = where they came from.',
    input_schema: {
      type: 'object' as const,
      properties: {
        siteUrl: { type: 'string' },
        startPage: { type: 'string', description: 'pagePath to centre on, e.g. /clanky/seo-trends' },
        direction: { type: 'string', enum: ['forward', 'backward'], description: 'Default forward' },
        startDate: { type: 'string' }, endDate: { type: 'string' },
      },
      required: ['siteUrl', 'startPage'],
    }
  },
  {
    name: 'ga4_realtime_pages',
    description: 'Realtime — top active pagePaths / events / sources right now (last 30 min). Beyond bare ga4_realtime_users by adding the dimension.',
    input_schema: {
      type: 'object' as const,
      properties: {
        siteUrl: { type: 'string' },
        dimension: { type: 'string', enum: ['pagePath', 'eventName', 'sessionSource', 'country', 'deviceCategory'], description: 'Default pagePath' },
      },
      required: ['siteUrl'],
    }
  },
  {
    name: 'ga4_demographics',
    description: 'Age × gender × interestCategory breakdown (where enabled in GA4 property). Useful for HR / employer-branding content profiling.',
    input_schema: {
      type: 'object' as const,
      properties: {
        siteUrl: { type: 'string' },
        dimension: { type: 'string', enum: ['userAgeBracket', 'userGender', 'brandingInterest', 'newVsReturning'], description: 'Default userAgeBracket' },
        startDate: { type: 'string' }, endDate: { type: 'string' },
      },
      required: ['siteUrl'],
    }
  },
  {
    name: 'ga4_metadata',
    description: 'List available dimensions + metrics + custom_dimensions + custom_metrics for a property (Data API properties.getMetadata). Prevents agent guessing custom event names. Call this FIRST when unsure what fields exist on a given property.',
    input_schema: {
      type: 'object' as const,
      properties: {
        siteUrl: { type: 'string' },
        filter: { type: 'string', enum: ['all', 'dimensions', 'metrics', 'custom'], description: 'Default all' },
      },
      required: ['siteUrl'],
    }
  },
  {
    name: 'ga4_quota_status',
    description: 'Returns the latest captured GA4 propertyQuota snapshot (tokensPerHour, tokensPerDay, concurrent, serverErrorsPerProjectPerHour). Standard property → 250 tokensPerHour / 25k per day; Realtime → 1.5k per hour. Call when a tool errors with quota exhausted.',
    input_schema: { type: 'object' as const, properties: {} }
  },

  // ==================== APACHE AGE — KNOWLEDGE GRAPH ====================
  {
    name: 'knowledge_graph_query',
    description: 'Traverse the Brain knowledge graph (hive_kg_graph) backed by Apache AGE. Nodes are Entity/Memory/Domain — seeded from brain_embeddings + brain_memories. Edges: IN_DOMAIN (memory→domain hub), RELATED_TO (top-5 cosine neighbours per entity, score property). Use this when you need MULTI-HOP reasoning ("what links memory A to brand asset B") or DOMAIN clustering ("show every memory tagged \"example-org-careers\""). For plain semantic search use docs_query or the unified context search instead. Three modes: stats (counts), explore (1-2 hop neighbourhood around a node), path (shortest path between two entity ids).',
    input_schema: {
      type: 'object' as const,
      properties: {
        mode: {
          type: 'string',
          enum: ['stats', 'explore', 'path'],
          description: 'stats=label/edge counts + top domains; explore=neighbourhood; path=shortest connection',
        },
        node:     { type: 'string', description: 'For mode=explore — the entity id (brain_embeddings.id) to centre on' },
        depth:    { type: 'number', description: 'For mode=explore — 1 (direct neighbours) or 2 (two hops). Default 1.' },
        fromNode: { type: 'string', description: 'For mode=path — starting entity id' },
        toNode:   { type: 'string', description: 'For mode=path — target entity id' },
        maxDepth: { type: 'number', description: 'For mode=path — max edges to consider (default 3, cap 5)' },
      },
      required: ['mode'],
    }
  },

  // ==================== PTC — Programmatic Tool Calling ====================
  // Sandboxed JS execution for math, data analysis, transformations on prior tool outputs.
  // Implements "llm-not-calculator" rule: any calc > 3 steps, > 4-digit precision, or aggregation
  // over arrays MUST go through code_execute. Saves tokens (no inline reasoning) and is exact.
  {
    name: 'code_execute',
    description: 'Sandboxed JS execution for math, data analysis, aggregation, sorting, filtering, percentile calculations, regression, cohort math, table joins. USE THIS WHEN: (a) aggregating over arrays/objects (sum/avg/min/max/percentiles), (b) any calc with > 3 arithmetic steps, (c) any precision math with > 4-digit numbers, (d) joining two tool outputs (e.g. matching GSC rows with GA4 rows by URL), (e) computing deltas, ratios, conversion rates across periods, (f) sorting/filtering > 20 rows. Pass prior tool output as `data` and write code that returns `result`. Code runs in a VM sandbox (no network, no fs, 10s timeout, 100MB memory). Globals available: Math, JSON, Date, console.log (captured), data. Examples: {"code":"const sum = data.rows.reduce((a,r)=>a+r.sessions,0); const avg = sum/data.rows.length; result = { sum, avg };", "data": {...prior tool output}} or {"code":"result = data.filter(r => r.clicks > 10 && r.position > 5).map(r => r.query)", "data": [...rows]}. Returns: { result, logs[], duration_ms }.',
    input_schema: {
      type: 'object' as const,
      properties: {
        code: { type: 'string', description: 'JavaScript code. Must assign to `result` variable (or return last expression). Has access to: data, Math, JSON, Date, console.log.' },
        data: { description: 'Optional data passed into the sandbox as `data` variable. Pass prior tool outputs here for analysis.' },
      },
      required: ['code'],
    }
  }
];

// Estimated token costs per tool (for Master Planner budget estimation)
export const TOOL_TOKEN_COSTS: Record<string, { avg: number; max: number }> = {
  ahrefs_domain_rating: { avg: 500, max: 1000 },
  ahrefs_organic_keywords: { avg: 8000, max: 20000 },
  ahrefs_backlinks: { avg: 3000, max: 10000 },
  ahrefs_top_pages: { avg: 3000, max: 10000 },
  ahrefs_competitors: { avg: 3000, max: 8000 },
  ahrefs_keyword_overview: { avg: 1000, max: 3000 },
  ahrefs_serp_overview: { avg: 5000, max: 15000 },
  ahrefs_broken_backlinks: { avg: 3000, max: 10000 },
  ahrefs_keyword_ideas: { avg: 5000, max: 15000 },
  ahrefs_referring_domains: { avg: 3000, max: 10000 },
  ahrefs_batch_analysis: { avg: 2000, max: 5000 },
  ahrefs_site_audit_projects: { avg: 200, max: 500 },
  ahrefs_site_audit_issues: { avg: 5000, max: 15000 },
  ahrefs_site_audit_page_explorer: { avg: 5000, max: 15000 },
  ahrefs_related_terms: { avg: 5000, max: 15000 },
  ahrefs_search_suggestions: { avg: 3000, max: 8000 },
  ahrefs_volume_by_country: { avg: 1000, max: 3000 },
  ahrefs_anchors: { avg: 3000, max: 10000 },
  ahrefs_pages_by_backlinks: { avg: 3000, max: 10000 },
  ahrefs_pages_by_internal_links: { avg: 3000, max: 8000 },
  ahrefs_linked_anchors_internal: { avg: 3000, max: 8000 },
  ahrefs_pages_by_traffic: { avg: 3000, max: 10000 },
  ahrefs_linked_domains: { avg: 3000, max: 8000 },
  gsc_search_analytics: { avg: 10000, max: 40000 },
  gsc_quick_wins: { avg: 5000, max: 15000 },
  gsc_tech_seo: { avg: 2000, max: 5000 },
  web_fetch: { avg: 3000, max: 8000 },
  web_render: { avg: 5000, max: 15000 },
  plan_task: { avg: 100, max: 500 },
  lighthouse_audit: { avg: 20000, max: 45000 },
  get_current_date: { avg: 100, max: 200 },
  suggest_ahrefs_export: { avg: 500, max: 1000 },
  content_calendar: { avg: 1000, max: 5000 },
  save_user_file: { avg: 200, max: 500 },
  docs_query: { avg: 2000, max: 6000 },
  knowledge_graph_query: { avg: 800, max: 3000 },
  // GA4 Max (Run T) — most are runReport wrappers with similar shape.
  ga4_landing_pages: { avg: 2500, max: 8000 },
  ga4_page_engagement: { avg: 2000, max: 6000 },
  ga4_source_medium: { avg: 2500, max: 7000 },
  ga4_geo_breakdown: { avg: 2500, max: 7000 },
  ga4_device_breakdown: { avg: 2000, max: 6000 },
  ga4_key_events: { avg: 2500, max: 7000 },
  ga4_channel_attribution: { avg: 2500, max: 7000 },
  ga4_compare_periods: { avg: 3000, max: 9000 },
  ga4_funnel_report: { avg: 3500, max: 10000 },
  ga4_cohort_retention: { avg: 3000, max: 9000 },
  ga4_path_exploration: { avg: 2500, max: 7000 },
  ga4_realtime_pages: { avg: 1500, max: 4000 },
  ga4_demographics: { avg: 2000, max: 5000 },
  ga4_metadata: { avg: 1500, max: 4000 },
  ga4_quota_status: { avg: 300, max: 600 },
};

// Tool categories for UI
export const TOOL_CATEGORIES = {
  seo: {
    name: 'SEO & Ahrefs',
    icon: '📊',
    tools: ['ahrefs_domain_rating', 'ahrefs_organic_keywords', 'ahrefs_backlinks', 'ahrefs_top_pages', 'ahrefs_competitors', 'ahrefs_keyword_overview', 'ahrefs_serp_overview', 'ahrefs_broken_backlinks', 'ahrefs_keyword_ideas', 'ahrefs_referring_domains', 'ahrefs_batch_analysis', 'ahrefs_site_audit_projects', 'ahrefs_site_audit_issues', 'ahrefs_site_audit_page_explorer', 'ahrefs_related_terms', 'ahrefs_search_suggestions', 'ahrefs_volume_by_country', 'ahrefs_anchors', 'ahrefs_pages_by_backlinks', 'ahrefs_pages_by_internal_links', 'ahrefs_linked_anchors_internal', 'ahrefs_pages_by_traffic', 'ahrefs_linked_domains']
  },
  gsc: {
    name: 'Google Search Console',
    icon: '🔍',
    tools: ['gsc_search_analytics', 'gsc_quick_wins', 'gsc_tech_seo']
  },
  search: {
    name: 'Utilities',
    icon: '⚙️',
    tools: ['web_search', 'web_fetch', 'web_render', 'get_current_date']
  },
  docs: {
    name: 'Docs',
    icon: '📖',
    tools: ['docs_query']
  },
  graph: {
    name: 'Knowledge Graph',
    icon: '🕸️',
    tools: ['knowledge_graph_query'],
  },
  // Run S 2026-05-26 — was missing entirely. The 3 ga4_* tools fell into the
  // 'other' bucket and were invisible in ToolsBrowser. Adding the category
  // surfaces them as a proper group with 📈 chip.
  ga4: {
    name: 'Google Analytics 4',
    icon: '📈',
    tools: [
      // Originals
      'ga4_run_report', 'ga4_traffic_overview', 'ga4_realtime_users',
      // Run T expansion — pages / sources / geo / device
      'ga4_landing_pages', 'ga4_page_engagement', 'ga4_source_medium',
      'ga4_geo_breakdown', 'ga4_device_breakdown',
      // Events / attribution / compare
      'ga4_key_events', 'ga4_channel_attribution', 'ga4_compare_periods',
      // Funnel / cohort / path
      'ga4_funnel_report', 'ga4_cohort_retention', 'ga4_path_exploration',
      // Realtime / demographics / infra
      'ga4_realtime_pages', 'ga4_demographics', 'ga4_metadata', 'ga4_quota_status',
    ],
  },
};

// Quick actions for UI buttons
export const QUICK_ACTIONS = [
  {
    id: 'domain_analysis',
    label: 'Analyze Domain',
    icon: '🌐',
    prompt: 'Analyzuj doménu {domain} - DR, organický traffic, top keywords'
  },
  {
    id: 'keyword_research',
    label: 'Keyword Research',
    icon: '🔑',
    prompt: 'Nájdi kľúčové slová pre {topic} na slovenskom trhu'
  },
  {
    id: 'competitor_analysis',
    label: 'Competitors',
    icon: '⚔️',
    prompt: 'Kto sú hlavní konkurenti pre {domain}?'
  },
  {
    id: 'backlink_check',
    label: 'Backlinks',
    icon: '🔗',
    prompt: 'Aké backlinky má {domain}?'
  },
  {
    id: 'serp_check',
    label: 'SERP Check',
    icon: '📈',
    prompt: 'Kto rankuje na keyword "{keyword}"?'
  }
];
