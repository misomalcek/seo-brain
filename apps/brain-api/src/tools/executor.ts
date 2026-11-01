import { brainPath } from '../paths';
// Tool executor - executes tools and returns results
// Uses MCP Bridge to access Ahrefs tools via Claude Code CLI

import Anthropic from '@anthropic-ai/sdk';
import { executeMCPTool, MCPRequest, MCPResult } from '../services/mcp-bridge';
import { query, queryOne } from '../db/connection';

interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

// Current user context for report tracking (set per-request in executeTool)
let _currentUserId: string | undefined;
let _currentUserRole: string | undefined; // set per executeTool call — gates self-mgmt writes

// Helper for MCP Bridge calls (replaces direct Ahrefs API)
async function callMCPTool(toolName: string, params: Record<string, any>): Promise<any> {
  const request: MCPRequest = {
    tool: toolName,
    params: params,
    outputFormat: 'json'
  };

  const result: MCPResult = await executeMCPTool(request, _currentUserId);

  if (!result.success) {
    throw new Error(result.error || 'MCP tool execution failed');
  }

  return result.data;
}

// Tool executors
const toolExecutors: Record<string, (input: any) => Promise<ToolResult>> = {

  // ==================== AHREFS TOOLS (via MCP Bridge) ====================

  async ahrefs_domain_rating(input: { target: string }): Promise<ToolResult> {
    try {
      const data = await callMCPTool('ahrefs_domain_rating', {
        target: input.target
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async ahrefs_organic_keywords(input: { target: string; country?: string; limit?: number }): Promise<ToolResult> {
    try {
      const data = await callMCPTool('ahrefs_organic_keywords', {
        target: input.target,
        country: input.country || 'sk',
        limit: Math.min(input.limit || 50, 500) // cap at 500 — snapshot needs up to 500
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async ahrefs_backlinks(input: { target: string; limit?: number }): Promise<ToolResult> {
    try {
      const data = await callMCPTool('ahrefs_backlinks', {
        target: input.target,
        limit: input.limit || 10
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async ahrefs_top_pages(input: { target: string; country?: string; limit?: number }): Promise<ToolResult> {
    try {
      const data = await callMCPTool('ahrefs_top_pages', {
        target: input.target,
        country: input.country || 'sk',
        limit: input.limit || 10
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async ahrefs_competitors(input: { target: string; country?: string; limit?: number }): Promise<ToolResult> {
    try {
      const data = await callMCPTool('ahrefs_competitors', {
        target: input.target,
        country: input.country || 'sk',
        limit: input.limit || 10
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async ahrefs_keyword_overview(input: { keywords: string; country?: string }): Promise<ToolResult> {
    try {
      const data = await callMCPTool('ahrefs_keyword_overview', {
        keyword: input.keywords,
        country: input.country || 'sk'
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async ahrefs_serp_overview(input: { keyword: string; country?: string }): Promise<ToolResult> {
    try {
      const data = await callMCPTool('ahrefs_serp_overview', {
        keyword: input.keyword,
        country: input.country || 'sk'
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async ahrefs_broken_backlinks(input: { target: string; limit?: number }): Promise<ToolResult> {
    try {
      const data = await callMCPTool('ahrefs_broken_backlinks', {
        target: input.target,
        limit: input.limit || 50
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async ahrefs_keyword_ideas(input: { keyword: string; country?: string; limit?: number }): Promise<ToolResult> {
    try {
      const data = await callMCPTool('ahrefs_keyword_ideas', {
        keyword: input.keyword,
        country: input.country || 'sk',
        limit: Math.min(input.limit || 30, 50) // cap at 50 — this is the most expensive endpoint (46% of units)
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async ahrefs_referring_domains(input: { target: string; limit?: number }): Promise<ToolResult> {
    try {
      const data = await callMCPTool('ahrefs_referring_domains', {
        target: input.target,
        limit: Math.min(input.limit || 30, 200)
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async ahrefs_batch_analysis(input: { targets: string[]; date?: string }): Promise<ToolResult> {
    try {
      const data = await callMCPTool('ahrefs_batch_analysis', {
        targets: input.targets,
        date: input.date
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  // ==================== SITE AUDIT TOOLS ====================

  async ahrefs_site_audit_projects(): Promise<ToolResult> {
    try {
      const data = await callMCPTool('ahrefs_site_audit_projects', {});
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async ahrefs_site_audit_issues(input: { project_id: string; limit?: number }): Promise<ToolResult> {
    try {
      const data = await callMCPTool('ahrefs_site_audit_issues', {
        project_id: input.project_id,
        limit: Math.min(input.limit || 100, 200)
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async ahrefs_site_audit_page_explorer(input: { project_id: string; limit?: number }): Promise<ToolResult> {
    try {
      const data = await callMCPTool('ahrefs_site_audit_page_explorer', {
        project_id: input.project_id,
        limit: Math.min(input.limit || 50, 200)
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  // ==================== KEYWORDS EXPLORER TOOLS ====================

  async ahrefs_related_terms(input: { keyword: string; country?: string; limit?: number }): Promise<ToolResult> {
    try {
      const data = await callMCPTool('ahrefs_related_terms', {
        keyword: input.keyword,
        country: input.country || 'sk',
        limit: Math.min(input.limit || 30, 50)
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async ahrefs_search_suggestions(input: { keyword: string; country?: string; limit?: number }): Promise<ToolResult> {
    try {
      const data = await callMCPTool('ahrefs_search_suggestions', {
        keyword: input.keyword,
        country: input.country || 'sk',
        limit: Math.min(input.limit || 30, 50)
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async ahrefs_volume_by_country(input: { keyword: string }): Promise<ToolResult> {
    try {
      const data = await callMCPTool('ahrefs_volume_by_country', {
        keyword: input.keyword
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  // ==================== LINK ANALYSIS TOOLS ====================

  async ahrefs_anchors(input: { target: string; limit?: number }): Promise<ToolResult> {
    try {
      const data = await callMCPTool('ahrefs_anchors', {
        target: input.target,
        limit: Math.min(input.limit || 50, 200)
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async ahrefs_pages_by_backlinks(input: { target: string; limit?: number }): Promise<ToolResult> {
    try {
      const data = await callMCPTool('ahrefs_pages_by_backlinks', {
        target: input.target,
        limit: Math.min(input.limit || 50, 200)
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async ahrefs_pages_by_internal_links(input: { target: string; limit?: number }): Promise<ToolResult> {
    try {
      const data = await callMCPTool('ahrefs_pages_by_internal_links', {
        target: input.target,
        limit: Math.min(input.limit || 50, 200)
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async ahrefs_linked_anchors_internal(input: { target: string; limit?: number }): Promise<ToolResult> {
    try {
      const data = await callMCPTool('ahrefs_linked_anchors_internal', {
        target: input.target,
        limit: Math.min(input.limit || 50, 200)
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async ahrefs_pages_by_traffic(input: { target: string; country?: string; limit?: number }): Promise<ToolResult> {
    try {
      const data = await callMCPTool('ahrefs_pages_by_traffic', {
        target: input.target,
        country: input.country || 'sk',
        limit: Math.min(input.limit || 50, 200)
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async ahrefs_linked_domains(input: { target: string; limit?: number }): Promise<ToolResult> {
    try {
      const data = await callMCPTool('ahrefs_linked_domains', {
        target: input.target,
        limit: Math.min(input.limit || 50, 200)
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  // ==================== GSC TOOLS (via custom OAuth 2.0 GSC API) ====================

  async gsc_list_sites(): Promise<ToolResult> {
    try {
      const { listSites } = await import('../services/gsc-api.js');
      const sites = await listSites();
      return { success: true, data: { sites } };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async gsc_search_analytics(input: { siteUrl: string; startDate?: string; endDate?: string; dimensions?: string[]; rowLimit?: number; startRow?: number; fetchAll?: boolean; saveAsFile?: boolean }): Promise<ToolResult> {
    try {
      // Auto-enable fetchAll + saveAsFile for large requests (prevents context overflow)
      // Threshold: 250+ rows triggers fetchAll, 250+ also auto-saves as file
      if ((input.rowLimit && input.rowLimit > 250) || input.fetchAll) {
        input.fetchAll = true;
        input.saveAsFile = true;
        console.log(`[GSC] Auto-enabled fetchAll+saveAsFile (rowLimit=${input.rowLimit})`);
      }

      // Map siteUrl to domain (dynamic from domain-config)
      const { getGSCPropertyMap } = await import('../config/domain-config.js');
      const siteUrlToDomain = await getGSCPropertyMap();
      const domain = siteUrlToDomain[input.siteUrl];

      // Server-side CSV save helper (bypasses Claude context for large datasets)
      const saveRowsAsFile = async (
        rows: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>,
        dimensions: string[],
        domainName: string,
        startDate: string,
        endDate: string,
      ): Promise<ToolResult> => {
        const fs = await import('fs/promises');
        const path = await import('path');

        // Build CSV header from dimensions + metrics
        const header = [...dimensions, 'clicks', 'impressions', 'ctr', 'position'].join(',');
        const csvRows = rows.map(r => [
          ...r.keys.map(k => `"${k.replace(/"/g, '""')}"`),
          r.clicks,
          r.impressions,
          (r.ctr * 100).toFixed(2) + '%',
          r.position.toFixed(1),
        ].join(','));
        const csv = [header, ...csvRows].join('\n');

        // Save directly to disk
        const uploadsDir = brainPath('uploads');
        await fs.mkdir(uploadsDir, { recursive: true });
        const userId = _currentUserId || 'system';
        const timestamp = Date.now();
        const filename = `gsc-${domainName}-${startDate}-to-${endDate}.csv`;
        const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = path.join(uploadsDir, `${userId}_${timestamp}_${sanitized}`);
        await fs.writeFile(storagePath, csv, 'utf-8');

        // Insert into user_files DB
        await query(
          `INSERT INTO user_files (user_id, filename, original_name, storage_path, mime_type, size_bytes)
           VALUES ($1, $2, $2, $3, 'text/csv', $4)`,
          [userId, filename, storagePath, Buffer.byteLength(csv)]
        );

        // Return summary only — NOT the rows (prevents context overflow)
        const top10 = rows.slice(0, 10).map((r, i) =>
          `${i + 1}. ${r.keys[0]} — ${r.clicks} clicks, ${r.impressions} imp, pos ${r.position.toFixed(1)}`
        );

        console.log(`[GSC] Saved ${rows.length} rows as ${filename} (${Buffer.byteLength(csv)} bytes)`);

        return {
          success: true,
          data: {
            savedFile: filename,
            totalRows: rows.length,
            csvSizeBytes: Buffer.byteLength(csv),
            domain: domainName,
            dateRange: { startDate, endDate },
            top10Keywords: top10,
            _meta: {
              source: 'gsc_server_side_export',
              message: `Uložených ${rows.length} riadkov do súboru ${filename}. Súbor je dostupný v sekcii Files.`,
            }
          }
        };
      };

      if (!domain) {
        // Fallback: domain not tracked, use direct API
        const { searchAnalytics, searchAnalyticsAll } = await import('../services/gsc-api.js');

        // fetchAll mode: auto-paginate to get all rows
        if (input.fetchAll) {
          const dims = input.dimensions || ['query'];
          const data = await searchAnalyticsAll({
            siteUrl: input.siteUrl,
            startDate: input.startDate,
            endDate: input.endDate,
            dimensions: dims,
            maxRows: input.rowLimit || 5000,
          });

          // saveAsFile: save directly to disk, return only summary
          if (input.saveAsFile || data.totalFetched > 500) {
            const now = new Date();
            const endD = input.endDate || new Date(now.getTime() - 2 * 86400000).toISOString().split('T')[0];
            const startD = input.startDate || new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];
            return saveRowsAsFile(data.rows, dims, input.siteUrl.replace(/[^a-z.-]/gi, ''), startD, endD);
          }

          return {
            success: true,
            data: {
              rows: data.rows,
              _meta: {
                rowsReturned: data.totalFetched,
                batches: data.batches,
                source: 'gsc_api_paginated',
                message: `Fetched all ${data.totalFetched} rows in ${data.batches} batches.`,
              }
            }
          };
        }

        const safeLimit = Math.min(input.rowLimit || 250, 25000);
        const data = await searchAnalytics({
          siteUrl: input.siteUrl,
          startDate: input.startDate,
          endDate: input.endDate,
          dimensions: input.dimensions || ['query'],
          rowLimit: safeLimit,
          startRow: input.startRow,
        });
        const rowCount = data?.rows?.length || 0;
        return {
          success: true,
          data: {
            ...data,
            _meta: {
              rowsReturned: rowCount,
              rowLimit: safeLimit,
              startRow: input.startRow || 0,
              hasMore: rowCount >= safeLimit,
              source: 'gsc_api_direct',
              nextAction: rowCount >= safeLimit
                ? `Viac riadkov dostupných. Použi startRow: ${(input.startRow || 0) + rowCount} pre ďalšiu stránku.`
                : 'Všetky riadky vrátené.',
            }
          }
        };
      }

      // fetchAll mode for tracked domains: bypass snapshot, use direct API pagination
      if (input.fetchAll || (input.startRow && input.startRow > 0)) {
        const { searchAnalyticsAll, searchAnalytics: searchAnalyticsDirect } = await import('../services/gsc-api.js');
        const siteUrl = Object.entries(siteUrlToDomain).find(([, d]) => d === domain)?.[0] || input.siteUrl;

        if (input.fetchAll) {
          const dims = input.dimensions || ['query'];
          const data = await searchAnalyticsAll({
            siteUrl,
            startDate: input.startDate,
            endDate: input.endDate,
            dimensions: dims,
            maxRows: input.rowLimit || 5000,
          });
          console.log(`[GSC] fetchAll: ${data.totalFetched} rows in ${data.batches} batches for ${domain}`);

          // Auto-save to file if >500 rows or explicitly requested
          if (input.saveAsFile || data.totalFetched > 500) {
            const now = new Date();
            const endD = input.endDate || new Date(now.getTime() - 2 * 86400000).toISOString().split('T')[0];
            const startD = input.startDate || new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];
            return saveRowsAsFile(data.rows, dims, domain, startD, endD);
          }

          return {
            success: true,
            data: {
              rows: data.rows,
              _meta: {
                rowsReturned: data.totalFetched,
                batches: data.batches,
                source: 'gsc_api_paginated',
                message: `Stiahnutých ${data.totalFetched} riadkov v ${data.batches} dávkach.`,
              }
            }
          };
        }

        // Manual pagination with startRow
        const safeLimit = Math.min(input.rowLimit || 250, 25000);
        const data = await searchAnalyticsDirect({
          siteUrl,
          startDate: input.startDate,
          endDate: input.endDate,
          dimensions: input.dimensions || ['query'],
          rowLimit: safeLimit,
          startRow: input.startRow,
        });
        const rowCount = data?.rows?.length || 0;
        console.log(`[GSC] Paginated: startRow=${input.startRow}, got ${rowCount} rows for ${domain}`);
        return {
          success: true,
          data: {
            ...data,
            _meta: {
              rowsReturned: rowCount,
              rowLimit: safeLimit,
              startRow: input.startRow || 0,
              hasMore: rowCount >= safeLimit,
              source: 'gsc_api_paginated',
            }
          }
        };
      }

      // Direct API for tracked domains (no more snapshot-first — v2 weekly snapshots handle caching)
      const { searchAnalytics: searchDirect } = await import('../services/gsc-api.js');
      const siteUrlDirect = Object.entries(siteUrlToDomain).find(([, d]) => d === domain)?.[0] || input.siteUrl;
      const safeLimit = Math.min(input.rowLimit || 250, 25000); // Default small for interactive queries

      console.log(`[GSC] Direct API: ${domain} rowLimit=${safeLimit}`);

      const data = await searchDirect({
        siteUrl: siteUrlDirect,
        startDate: input.startDate,
        endDate: input.endDate,
        dimensions: input.dimensions || ['query'],
        rowLimit: safeLimit,
      });

      const rowCount = data?.rows?.length || 0;
      console.log(`[GSC] Direct: got ${rowCount} rows for ${domain}`);

      return {
        success: true,
        data: {
          ...data,
          _noTruncate: true, // Small queries are safe
          _meta: {
            rowsReturned: rowCount,
            rowLimit: safeLimit,
            source: 'gsc_api_direct',
            snapshotInfo: 'Weekly v2 snapshots (Wednesday 1:30AM) available in Snímky tab. Pre kompletný export použi fetchAll=true.',
            hasMore: rowCount >= safeLimit,
          }
        }
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async gsc_quick_wins(input: {
    siteUrl: string;
    minPosition?: number;
    maxPosition?: number;
    minImpressions?: number;
    minClicks?: number;
    limit?: number;
    sort?: 'position' | 'impressions' | 'clicks';
  }): Promise<ToolResult> {
    try {
      const { quickWins } = await import('../services/gsc-api.js');
      const data = await quickWins(input);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async ahrefs_budget(_input: Record<string, never>): Promise<ToolResult> {
    try {
      const { executeMCPTool } = await import('../services/mcp-bridge.js');
      const raw = await executeMCPTool({ tool: 'ahrefs_budget', params: {} });
      if (!raw.success) {
        return { success: false, error: raw.error || 'Ahrefs budget fetch failed' };
      }

      // Normalize Ahrefs response shape (varies by API version)
      const data: any = raw.data || {};
      const total = Number(data.subscription?.units_limit || data.units_limit || data.total || 500000);
      const used = Number(data.subscription?.units_used || data.units_used || data.used || 0);
      const remaining = Math.max(0, total - used);
      const remainingPercent = total > 0 ? (remaining / total) * 100 : 0;

      // Warning level based on remaining percent
      let warning: 'NORMAL' | 'HIGH_USAGE' | 'LOW' = 'NORMAL';
      if (remainingPercent < 20) warning = 'HIGH_USAGE';
      else if (remainingPercent < 10) warning = 'LOW';

      // Top consumers from mcp_cache — last 30 days
      let topConsumers: Array<{ tool: string; calls: number }> = [];
      try {
        const { query } = await import('../db/connection.js');
        const rows = await query<{ tool_name: string; count: string }>(
          `SELECT tool_name, COUNT(*) as count
           FROM mcp_cache
           WHERE created_at > NOW() - INTERVAL '30 days' AND tool_name LIKE 'ahrefs_%'
           GROUP BY tool_name
           ORDER BY count DESC
           LIMIT 10`
        );
        topConsumers = rows.map(r => ({ tool: r.tool_name, calls: Number(r.count) }));
      } catch { /* mcp_cache query is best-effort, don't fail whole tool on it */ }

      return {
        success: true,
        data: {
          total_units: total,
          used_units: used,
          remaining_units: remaining,
          remaining_percent: Number(remainingPercent.toFixed(1)),
          reset_date: data.subscription?.reset_date || data.reset_date || null,
          warning,
          top_consumers: topConsumers,
          raw_response: data,  // passthrough for debugging
        }
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async gsc_compare_periods(input: {
    siteUrl: string;
    period1: { startDate: string; endDate: string; label?: string };
    period2: { startDate: string; endDate: string; label?: string };
    dimension?: 'query' | 'page';
    minImpressions?: number;
    minChangeThreshold?: number;
    limit?: number;
    rowLimit?: number;
  }): Promise<ToolResult> {
    try {
      const { comparePeriods } = await import('../services/gsc-api.js');
      const data = await comparePeriods(input);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async gsc_tech_seo(input: { action: string; site_url: string; inspect_url?: string; urls?: string[] }): Promise<ToolResult> {
    try {
      switch (input.action) {
        case 'inspect_url': {
          if (!input.inspect_url) {
            return { success: false, error: 'inspect_url parameter is required for inspect_url action' };
          }
          const { inspectUrl } = await import('../services/gsc-api.js');
          const data = await inspectUrl(input.site_url, input.inspect_url);
          return { success: true, data };
        }
        case 'inspect_batch': {
          if (!input.urls || !Array.isArray(input.urls) || input.urls.length < 2) {
            return { success: false, error: 'urls parameter is required for inspect_batch action (min 2 URLs)' };
          }
          if (input.urls.length > 20) {
            return { success: false, error: 'inspect_batch supports max 20 URLs. For larger batches, use multiple calls.' };
          }

          const { inspectUrl } = await import('../services/gsc-api.js');
          const results = [];
          const statusCounts: Record<string, number> = {};
          let indexed = 0;
          let notIndexed = 0;
          let errors = 0;

          for (const url of input.urls) {
            try {
              const result = await inspectUrl(input.site_url, url);
              const status = result.indexStatusResult?.coverageState || 'Unknown';

              results.push({
                url,
                status,
                indexingState: result.indexStatusResult?.indexingState,
                lastCrawlTime: result.indexStatusResult?.lastCrawlTime,
                mobileUsability: result.mobileUsabilityResult?.verdict
              });

              statusCounts[status] = (statusCounts[status] || 0) + 1;

              if (status === 'Submitted and indexed') {
                indexed++;
              } else if (status.includes('not indexed') || status.includes('Excluded')) {
                notIndexed++;
              }
            } catch (err) {
              results.push({ url, status: 'Error', error: String(err) });
              errors++;
            }
          }

          return {
            success: true,
            data: {
              summary: { total: input.urls.length, indexed, not_indexed: notIndexed, errors },
              results,
              by_status: statusCounts
            }
          };
        }
        case 'list_sitemaps': {
          const { listSitemaps } = await import('../services/gsc-api.js');
          const data = await listSitemaps(input.site_url);
          return { success: true, data: { sitemaps: data, count: data.length } };
        }
        case 'core_web_vitals': {
          const { getCoreWebVitals } = await import('../services/gsc-api.js');
          const data = await getCoreWebVitals(input.site_url);
          return { success: true, data };
        }
        default:
          return { success: false, error: `Unknown action: ${input.action}. Use inspect_url, inspect_batch, list_sitemaps, or core_web_vitals.` };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  // ==================== GA4 TOOLS ====================

  async ga4_run_report(input: {
    siteUrl: string;
    startDate?: string;
    endDate?: string;
    dimensions?: string[];
    metrics?: string[];
    limit?: number;
    orderBy?: { metric?: string; dimension?: string; desc?: boolean };
  }): Promise<ToolResult> {
    try {
      const { runReport, getGA4PropertyMap } = await import('../services/ga4-api.js');
      // Resolve siteUrl: numeric → use as property ID; otherwise look up via sites table
      let propertyId = input.siteUrl;
      if (!/^\d+$/.test(propertyId)) {
        const map = await getGA4PropertyMap();
        const resolved = map[input.siteUrl] || map[input.siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')];
        if (!resolved) {
          return {
            success: false,
            error: `No GA4 property mapped for "${input.siteUrl}". Add ga4_property_id to sites table (Admin > Sites) or pass numeric property ID directly.`
          };
        }
        propertyId = resolved;
      }
      const data = await runReport({ ...input, propertyId, hostName: ga4NormalizeHostName(input.siteUrl) ?? undefined });
      // Flatten for easier downstream consumption
      const rows = data.rows.map(r => {
        const obj: Record<string, string | number> = {};
        data.dimensionHeaders.forEach((h, i) => { obj[h.name] = r.dimensionValues[i]?.value ?? ''; });
        data.metricHeaders.forEach((h, i) => {
          const v = r.metricValues[i]?.value ?? '0';
          obj[h.name] = h.type === 'TYPE_INTEGER' ? parseInt(v, 10) : parseFloat(v);
        });
        return obj;
      });
      return {
        success: true,
        data: {
          propertyId, rowCount: data.rowCount, rows,
          _meta: { source: 'ga4_data_api', period: { start: input.startDate || '7daysAgo', end: input.endDate || 'today' } }
        }
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async ga4_traffic_overview(input: { siteUrl: string; startDate?: string; endDate?: string }): Promise<ToolResult> {
    try {
      const { trafficOverview, getGA4PropertyMap } = await import('../services/ga4-api.js');
      const { ga4PropertyForHost } = await import('../services/settings.js');
      let propertyId = input.siteUrl;
      if (!/^\d+$/.test(propertyId)) {
        const map = await getGA4PropertyMap();
        const resolved = map[input.siteUrl] || map[input.siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')] || ga4PropertyForHost(input.siteUrl);
        if (!resolved) {
          return { success: false, error: `No GA4 property mapped for "${input.siteUrl}". Add ga4_property_id to sites table.` };
        }
        propertyId = resolved;
      }
      const data = await trafficOverview(propertyId, input.startDate, input.endDate, ga4NormalizeHostName(input.siteUrl) ?? undefined);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async ga4_realtime_users(input: { siteUrl: string; dimensions?: string[] }): Promise<ToolResult> {
    try {
      const { runRealtimeReport, getGA4PropertyMap } = await import('../services/ga4-api.js');
      let propertyId = input.siteUrl;
      if (!/^\d+$/.test(propertyId)) {
        const map = await getGA4PropertyMap();
        const resolved = map[input.siteUrl] || map[input.siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')];
        if (!resolved) {
          return { success: false, error: `No GA4 property mapped for "${input.siteUrl}". Add ga4_property_id to sites table.` };
        }
        propertyId = resolved;
      }
      const data = await runRealtimeReport(propertyId, input.dimensions, undefined, ga4NormalizeHostName(input.siteUrl) ?? undefined);
      // GA4 realtime API omits `rows` (and dimension/metric headers) when there are 0 active users
      const dimHeaders = data.dimensionHeaders ?? [];
      const metHeaders = data.metricHeaders ?? [];
      const rows = (data.rows ?? []).map(r => {
        const obj: Record<string, string | number> = {};
        dimHeaders.forEach((h, i) => { obj[h.name] = r.dimensionValues[i]?.value ?? ''; });
        metHeaders.forEach((h, i) => { obj[h.name] = parseInt(r.metricValues[i]?.value ?? '0', 10); });
        return obj;
      });
      const totalActive = rows.reduce((s, r) => s + (typeof r.activeUsers === 'number' ? r.activeUsers : 0), 0);
      return {
        success: true,
        data: { propertyId, totalActiveUsers: totalActive, byDimension: rows, _meta: { source: 'ga4_realtime', window: 'last 30 minutes' } }
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  // ──────────────────────────────────────────────────────────────────────
  // GA4 MAX — Run T (2026-05-26) — 15 new tool executors
  // Shared helper at bottom: ga4ResolveProperty + parseRows + quotaMeta.
  // ──────────────────────────────────────────────────────────────────────

  async ga4_landing_pages(input: { siteUrl: string; startDate?: string; endDate?: string; limit?: number; minSessions?: number }): Promise<ToolResult> {
    try {
      const ga4 = await import('../services/ga4-api.js');
      const propertyId = await ga4ResolveProperty(input.siteUrl, ga4);
      if (!propertyId) return { success: false, error: `No GA4 property for "${input.siteUrl}"` };
      const report = await ga4.runReportWithQuota({
        propertyId,
        startDate: input.startDate || '28daysAgo',
        endDate: input.endDate || 'yesterday',
        dimensions: ['landingPage'],
        metrics: ['sessions', 'engagedSessions', 'engagementRate', 'averageSessionDuration', 'conversions'],
        orderBy: { metric: 'sessions', desc: true },
        limit: Math.min(input.limit || 30, 5000),
        hostName: ga4NormalizeHostName(input.siteUrl) ?? undefined,
      });
      const minS = input.minSessions ?? 10;
      const rows = ga4ParseRows(report).filter((r: any) => r.sessions >= minS);
      return { success: true, data: { propertyId, period: { startDate: input.startDate || '28daysAgo', endDate: input.endDate || 'yesterday' }, rows, _meta: { quota: ga4.getLastQuotaSnapshot() } } };
    } catch (e) { return { success: false, error: String(e) }; }
  },

  async ga4_page_engagement(input: { siteUrl: string; pagePath?: string; pagePathContains?: string; startDate?: string; endDate?: string; limit?: number }): Promise<ToolResult> {
    try {
      const ga4 = await import('../services/ga4-api.js');
      const propertyId = await ga4ResolveProperty(input.siteUrl, ga4);
      if (!propertyId) return { success: false, error: `No GA4 property for "${input.siteUrl}"` };
      const report = await ga4.runReportWithQuota({
        propertyId,
        startDate: input.startDate || '28daysAgo', endDate: input.endDate || 'yesterday',
        dimensions: ['pagePath'],
        metrics: ['screenPageViews', 'userEngagementDuration', 'engagementRate', 'bounceRate', 'eventCount'],
        orderBy: { metric: 'screenPageViews', desc: true },
        limit: Math.min(input.limit || 50, 5000),
        hostName: ga4NormalizeHostName(input.siteUrl) ?? undefined,
      });
      let rows = ga4ParseRows(report);
      if (input.pagePath) rows = rows.filter((r: any) => r.pagePath === input.pagePath);
      if (input.pagePathContains) rows = rows.filter((r: any) => String(r.pagePath || '').includes(input.pagePathContains!));
      return { success: true, data: { propertyId, rows, _meta: { quota: ga4.getLastQuotaSnapshot() } } };
    } catch (e) { return { success: false, error: String(e) }; }
  },

  async ga4_source_medium(input: { siteUrl: string; startDate?: string; endDate?: string; limit?: number }): Promise<ToolResult> {
    try {
      const ga4 = await import('../services/ga4-api.js');
      const propertyId = await ga4ResolveProperty(input.siteUrl, ga4);
      if (!propertyId) return { success: false, error: `No GA4 property for "${input.siteUrl}"` };
      const report = await ga4.runReportWithQuota({
        propertyId,
        startDate: input.startDate || '28daysAgo', endDate: input.endDate || 'yesterday',
        dimensions: ['sessionSource', 'sessionMedium'],
        metrics: ['sessions', 'newUsers', 'conversions'],
        orderBy: { metric: 'sessions', desc: true },
        limit: Math.min(input.limit || 40, 5000),
        hostName: ga4NormalizeHostName(input.siteUrl) ?? undefined,
      });
      const rows = ga4ParseRows(report).map((r: any) => ({
        ...r,
        conversionRate: r.sessions > 0 ? +(r.conversions / r.sessions * 100).toFixed(2) : 0,
      }));
      return { success: true, data: { propertyId, rows, _meta: { quota: ga4.getLastQuotaSnapshot() } } };
    } catch (e) { return { success: false, error: String(e) }; }
  },

  async ga4_geo_breakdown(input: { siteUrl: string; level?: 'country' | 'city' | 'region'; filterCountry?: string; startDate?: string; endDate?: string; limit?: number }): Promise<ToolResult> {
    try {
      const ga4 = await import('../services/ga4-api.js');
      const propertyId = await ga4ResolveProperty(input.siteUrl, ga4);
      if (!propertyId) return { success: false, error: `No GA4 property for "${input.siteUrl}"` };
      const lvl = input.level || 'country';
      const dim = lvl === 'country' ? 'country' : lvl === 'region' ? 'region' : 'city';
      const dims = lvl === 'country' ? ['country'] : ['country', dim];
      const report = await ga4.runReportWithQuota({
        propertyId,
        startDate: input.startDate || '28daysAgo', endDate: input.endDate || 'yesterday',
        dimensions: dims,
        metrics: ['sessions', 'activeUsers', 'engagementRate'],
        orderBy: { metric: 'sessions', desc: true },
        limit: Math.min(input.limit || 30, 5000),
        hostName: ga4NormalizeHostName(input.siteUrl) ?? undefined,
      });
      let rows = ga4ParseRows(report);
      if (input.filterCountry) rows = rows.filter((r: any) => r.country === input.filterCountry);
      return { success: true, data: { propertyId, level: lvl, rows, _meta: { quota: ga4.getLastQuotaSnapshot() } } };
    } catch (e) { return { success: false, error: String(e) }; }
  },

  async ga4_device_breakdown(input: { siteUrl: string; startDate?: string; endDate?: string; breakdown?: 'device' | 'device_browser' | 'device_browser_os'; limit?: number }): Promise<ToolResult> {
    try {
      const ga4 = await import('../services/ga4-api.js');
      const propertyId = await ga4ResolveProperty(input.siteUrl, ga4);
      if (!propertyId) return { success: false, error: `No GA4 property for "${input.siteUrl}"` };
      const brk = input.breakdown || 'device_browser';
      const dims = brk === 'device' ? ['deviceCategory'] :
                   brk === 'device_browser_os' ? ['deviceCategory', 'browser', 'operatingSystem'] :
                   ['deviceCategory', 'browser'];
      const report = await ga4.runReportWithQuota({
        propertyId,
        startDate: input.startDate || '28daysAgo', endDate: input.endDate || 'yesterday',
        dimensions: dims,
        metrics: ['sessions', 'engagementRate', 'conversions'],
        orderBy: { metric: 'sessions', desc: true },
        limit: Math.min(input.limit || 30, 5000),
        hostName: ga4NormalizeHostName(input.siteUrl) ?? undefined,
      });
      return { success: true, data: { propertyId, breakdown: brk, rows: ga4ParseRows(report), _meta: { quota: ga4.getLastQuotaSnapshot() } } };
    } catch (e) { return { success: false, error: String(e) }; }
  },

  async ga4_key_events(input: { siteUrl: string; eventName?: string; breakBy?: string; startDate?: string; endDate?: string; limit?: number }): Promise<ToolResult> {
    try {
      const ga4 = await import('../services/ga4-api.js');
      const propertyId = await ga4ResolveProperty(input.siteUrl, ga4);
      if (!propertyId) return { success: false, error: `No GA4 property for "${input.siteUrl}"` };
      const dims = input.breakBy ? ['eventName', input.breakBy] : ['eventName'];
      const report = await ga4.runReportWithQuota({
        propertyId,
        startDate: input.startDate || '28daysAgo', endDate: input.endDate || 'yesterday',
        dimensions: dims,
        metrics: ['eventCount', 'eventCountPerUser', 'totalRevenue'],
        orderBy: { metric: 'eventCount', desc: true },
        limit: Math.min(input.limit || 30, 5000),
        hostName: ga4NormalizeHostName(input.siteUrl) ?? undefined,
      });
      let rows = ga4ParseRows(report);
      if (input.eventName) rows = rows.filter((r: any) => r.eventName === input.eventName);
      // Fallback: if no key events configured, surface generic defaults from common example-org patterns
      const defaults = ['form_submit', 'scroll', 'click', 'session_start', 'page_view'];
      return {
        success: true,
        data: {
          propertyId, rows,
          _hint: rows.length === 0 ? `No events matched. Common GA4 events to look for: ${defaults.join(', ')}. Call ga4_metadata to see custom events on this property.` : undefined,
          _meta: { quota: ga4.getLastQuotaSnapshot() }
        }
      };
    } catch (e) { return { success: false, error: String(e) }; }
  },

  async ga4_channel_attribution(input: { siteUrl: string; conversionEvent?: string; startDate?: string; endDate?: string }): Promise<ToolResult> {
    try {
      const ga4 = await import('../services/ga4-api.js');
      const propertyId = await ga4ResolveProperty(input.siteUrl, ga4);
      if (!propertyId) return { success: false, error: `No GA4 property for "${input.siteUrl}"` };
      // GA4 attribution model API is not exposed via Data API v1beta directly;
      // we approximate with sessionDefaultChannelGroup × conversions and supply
      // the breakdown the agent can reason about (first vs last touch comparison
      // requires v1alpha audience export which example-org property may not expose).
      const report = await ga4.runReportWithQuota({
        propertyId,
        startDate: input.startDate || '28daysAgo', endDate: input.endDate || 'yesterday',
        dimensions: ['sessionDefaultChannelGroup', 'firstUserDefaultChannelGroup'],
        metrics: ['sessions', 'conversions', 'totalRevenue'],
        orderBy: { metric: 'conversions', desc: true },
        limit: 50,
        hostName: ga4NormalizeHostName(input.siteUrl) ?? undefined,
      });
      return {
        success: true,
        data: {
          propertyId, rows: ga4ParseRows(report),
          note: 'firstUserDefaultChannelGroup × sessionDefaultChannelGroup approximates first-touch vs last-touch attribution. For DDA use GA4 UI Attribution > Model comparison.',
          _meta: { quota: ga4.getLastQuotaSnapshot() }
        }
      };
    } catch (e) { return { success: false, error: String(e) }; }
  },

  async ga4_compare_periods(input: { siteUrl: string; metrics?: string[]; dimensions?: string[]; preset?: 'WoW' | 'MoM' | 'YoY'; currentStart?: string; currentEnd?: string; previousStart?: string; previousEnd?: string; limit?: number }): Promise<ToolResult> {
    try {
      const ga4 = await import('../services/ga4-api.js');
      const propertyId = await ga4ResolveProperty(input.siteUrl, ga4);
      if (!propertyId) return { success: false, error: `No GA4 property for "${input.siteUrl}"` };
      let { currentStart, currentEnd, previousStart, previousEnd } = input;
      if (input.preset) {
        const today = new Date(); const d = (n: number) => { const x = new Date(today); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
        if (input.preset === 'WoW') { currentStart = d(7); currentEnd = d(1); previousStart = d(14); previousEnd = d(8); }
        else if (input.preset === 'MoM') { currentStart = d(30); currentEnd = d(1); previousStart = d(60); previousEnd = d(31); }
        else if (input.preset === 'YoY') { currentStart = d(7); currentEnd = d(1); previousStart = d(372); previousEnd = d(366); }
      }
      if (!currentStart || !currentEnd || !previousStart || !previousEnd) {
        return { success: false, error: 'Supply preset or all 4 dates (currentStart/End + previousStart/End)' };
      }
      const data = await ga4.runCompareReport({
        propertyId,
        dimensions: input.dimensions || ['date'],
        metrics: input.metrics || ['sessions', 'activeUsers'],
        currentStart, currentEnd, previousStart, previousEnd,
        limit: input.limit,
        hostName: ga4NormalizeHostName(input.siteUrl) ?? undefined,
      });
      // Pivot rows by dateRange name for delta calculation
      const merged: Record<string, any> = {};
      for (const row of (data.rows || [])) {
        const dimKey = row.dimensionValues.slice(0, -1).map((v: any) => v.value).join('|');  // last dim is dateRange
        const which = row.dimensionValues[row.dimensionValues.length - 1].value;
        if (!merged[dimKey]) merged[dimKey] = { _key: dimKey };
        for (let i = 0; i < (data.metricHeaders || []).length; i++) {
          const m = data.metricHeaders[i].name;
          merged[dimKey][`${m}_${which}`] = parseFloat(row.metricValues[i].value);
        }
      }
      const out = Object.values(merged).map((r: any) => {
        const result: any = { dimension: r._key };
        for (const m of (input.metrics || ['sessions', 'activeUsers'])) {
          const cur = r[`${m}_current`] || 0;
          const prev = r[`${m}_previous`] || 0;
          result[m] = { current: cur, previous: prev, deltaAbs: cur - prev, deltaPct: prev > 0 ? +((cur - prev) / prev * 100).toFixed(2) : null };
        }
        return result;
      });
      return { success: true, data: { propertyId, periods: { current: { start: currentStart, end: currentEnd }, previous: { start: previousStart, end: previousEnd } }, rows: out, _meta: { quota: ga4.getLastQuotaSnapshot() } } };
    } catch (e) { return { success: false, error: String(e) }; }
  },

  async ga4_funnel_report(input: { siteUrl: string; steps?: any[]; startDate?: string; endDate?: string }): Promise<ToolResult> {
    try {
      const ga4 = await import('../services/ga4-api.js');
      const propertyId = await ga4ResolveProperty(input.siteUrl, ga4);
      if (!propertyId) return { success: false, error: `No GA4 property for "${input.siteUrl}"` };
      // Default example-org basic funnel if not specified
      const defaultSteps = [
        { name: 'Landing (organic)', filter: { pagePathContains: '/' } },
        { name: 'Article view', filter: { pagePathContains: '/clanky' } },
        { name: 'Contact/Apply', filter: { pagePathContains: '/kontakt' } },
      ];
      const steps = input.steps && input.steps.length > 0 ? input.steps : defaultSteps;
      const data = await ga4.runFunnelReport({ propertyId, steps, startDate: input.startDate, endDate: input.endDate, hostName: ga4NormalizeHostName(input.siteUrl) ?? undefined });
      return { success: true, data: { propertyId, ...data, _meta: { quota: ga4.getLastQuotaSnapshot(), defaultsUsed: !input.steps } } };
    } catch (e) { return { success: false, error: String(e) }; }
  },

  async ga4_cohort_retention(input: { siteUrl: string; granularity?: 'DAILY' | 'WEEKLY' | 'MONTHLY'; cohortSize?: number; metric?: string }): Promise<ToolResult> {
    try {
      const ga4 = await import('../services/ga4-api.js');
      const propertyId = await ga4ResolveProperty(input.siteUrl, ga4);
      if (!propertyId) return { success: false, error: `No GA4 property for "${input.siteUrl}"` };
      const data = await ga4.runCohortReport({ propertyId, granularity: input.granularity, cohortSize: input.cohortSize, metric: input.metric, hostName: ga4NormalizeHostName(input.siteUrl) ?? undefined });
      return { success: true, data: { propertyId, ...data, _meta: { quota: ga4.getLastQuotaSnapshot() } } };
    } catch (e) { return { success: false, error: String(e) }; }
  },

  async ga4_path_exploration(input: { siteUrl: string; startPage: string; direction?: 'forward' | 'backward'; startDate?: string; endDate?: string }): Promise<ToolResult> {
    try {
      const ga4 = await import('../services/ga4-api.js');
      const propertyId = await ga4ResolveProperty(input.siteUrl, ga4);
      if (!propertyId) return { success: false, error: `No GA4 property for "${input.siteUrl}"` };
      const data = await ga4.runPathReport({ propertyId, startPage: input.startPage, direction: input.direction, startDate: input.startDate, endDate: input.endDate, hostName: ga4NormalizeHostName(input.siteUrl) ?? undefined });
      return { success: true, data: { ...data, _meta: { quota: ga4.getLastQuotaSnapshot() } } };
    } catch (e) { return { success: false, error: String(e) }; }
  },

  async ga4_realtime_pages(input: { siteUrl: string; dimension?: string }): Promise<ToolResult> {
    try {
      const ga4 = await import('../services/ga4-api.js');
      const propertyId = await ga4ResolveProperty(input.siteUrl, ga4);
      if (!propertyId) return { success: false, error: `No GA4 property for "${input.siteUrl}"` };
      const dim = input.dimension || 'pagePath';
      const data = await ga4.runRealtimeReport(propertyId, [dim], undefined, ga4NormalizeHostName(input.siteUrl) ?? undefined);
      const rows = (data.rows || []).map((r: any) => ({
        [dim]: r.dimensionValues[0]?.value || '',
        activeUsers: parseInt(r.metricValues[0]?.value || '0', 10),
      }));
      return { success: true, data: { propertyId, dimension: dim, rows, _meta: { window: 'last 30 minutes' } } };
    } catch (e) { return { success: false, error: String(e) }; }
  },

  async ga4_demographics(input: { siteUrl: string; dimension?: string; startDate?: string; endDate?: string }): Promise<ToolResult> {
    try {
      const ga4 = await import('../services/ga4-api.js');
      const propertyId = await ga4ResolveProperty(input.siteUrl, ga4);
      if (!propertyId) return { success: false, error: `No GA4 property for "${input.siteUrl}"` };
      const dim = input.dimension || 'userAgeBracket';
      const report = await ga4.runReportWithQuota({
        propertyId,
        startDate: input.startDate || '28daysAgo', endDate: input.endDate || 'yesterday',
        dimensions: [dim],
        metrics: ['activeUsers', 'engagementRate'],
        orderBy: { metric: 'activeUsers', desc: true },
        limit: 30,
        hostName: ga4NormalizeHostName(input.siteUrl) ?? undefined,
      });
      const rows = ga4ParseRows(report);
      const hint = rows.length === 0 ? 'No demographic data — GA4 property may not have Google Signals enabled or audience too small for thresholding.' : undefined;
      return { success: true, data: { propertyId, dimension: dim, rows, _hint: hint, _meta: { quota: ga4.getLastQuotaSnapshot() } } };
    } catch (e) { return { success: false, error: String(e) }; }
  },

  async ga4_metadata(input: { siteUrl: string; filter?: 'all' | 'dimensions' | 'metrics' | 'custom' }): Promise<ToolResult> {
    try {
      const ga4 = await import('../services/ga4-api.js');
      const propertyId = await ga4ResolveProperty(input.siteUrl, ga4);
      if (!propertyId) return { success: false, error: `No GA4 property for "${input.siteUrl}"` };
      const meta: any = await ga4.getPropertyMetadata(propertyId);
      const filter = input.filter || 'all';
      const dims = (meta.dimensions || []).map((d: any) => ({ apiName: d.apiName, uiName: d.uiName, customDefinition: d.customDefinition }));
      const mets = (meta.metrics || []).map((m: any) => ({ apiName: m.apiName, uiName: m.uiName, customDefinition: m.customDefinition }));
      const customDims = dims.filter((d: any) => d.customDefinition);
      const customMets = mets.filter((m: any) => m.customDefinition);
      const payload: any = { propertyId, totalDims: dims.length, totalMets: mets.length, custom: { dimensions: customDims, metrics: customMets } };
      if (filter === 'all' || filter === 'dimensions') payload.dimensions = dims;
      if (filter === 'all' || filter === 'metrics') payload.metrics = mets;
      return { success: true, data: payload };
    } catch (e) { return { success: false, error: String(e) }; }
  },

  async ga4_quota_status(_input: {}): Promise<ToolResult> {
    try {
      const ga4 = await import('../services/ga4-api.js');
      const snap = ga4.getLastQuotaSnapshot();
      if (!snap) {
        return { success: true, data: { note: 'No GA4 calls captured yet this session. Standard property limits: tokensPerHour=250, tokensPerDay=25000, concurrentRequests=10. Realtime: tokensPerHour=1500.' } };
      }
      return { success: true, data: snap };
    } catch (e) { return { success: false, error: String(e) }; }
  },

  // ==================== UNIFIED CONTEXT RETRIEVAL (D4 crown) ====================

  async context_search(input: { query: string; limit?: number; perSource?: number; minScore?: number; sources?: string[] }): Promise<ToolResult> {
    try {
      const { unifiedContextSearch } = await import('../services/brain-memory.js');
      const result = await unifiedContextSearch(input.query, {
        limit: input.limit, perSourceLimit: input.perSource,
        minScore: input.minScore, sources: input.sources,
      });
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  // ==================== ARTICLES SEMANTIC SEARCH ====================

  async articles_search(input: { query: string; mode?: 'semantic' | 'lexical' | 'hybrid'; domain?: string; limit?: number; minScore?: number }): Promise<ToolResult> {
    try {
      const { searchSemantic, searchLexical, searchHybrid } = await import('../services/vector.js');
      const limit = Math.min(input.limit || 10, 5000);
      const mode = input.mode || 'semantic';
      const opts: any = { limit, domain: input.domain };
      if (input.minScore !== undefined) opts.minScore = input.minScore;
      let results;
      if (mode === 'lexical') results = await searchLexical(input.query, opts);
      else if (mode === 'hybrid') results = await searchHybrid(input.query, opts);
      else results = await searchSemantic(input.query, opts);
      return {
        success: true,
        data: {
          query: input.query, mode, domain: input.domain, count: results.length,
          rows: results.map(r => ({
            id: r.id, url: r.url, title: r.title, domain: r.domain,
            score: Number(r.score.toFixed(4)), word_count: r.word_count,
            scraped_at: r.scraped_at,
            preview: (r.content_md || '').slice(0, 240),
          })),
          _meta: { source: 'articles_vector_search', total_articles_indexed: 1079 }
        }
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async articles_similar(input: { articleId: string; limit?: number }): Promise<ToolResult> {
    try {
      const { findSimilarArticles } = await import('../services/vector.js');
      const results = await findSimilarArticles(input.articleId, Math.min(input.limit || 10, 5000));
      return {
        success: true,
        data: {
          source_article_id: input.articleId, count: results.length,
          rows: results.map(r => ({
            id: r.id, url: r.url, title: r.title, domain: r.domain,
            similarity: Number(r.score.toFixed(4)),
          }))
        }
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  // ==================== UTILITY TOOLS ====================

  // web_search is now handled by Anthropic native connector (server-side)
  // No executor needed - Claude handles it automatically

  // web_fetch kept as fast fallback for simple static pages/APIs
  async web_fetch(input: { url: string }): Promise<ToolResult> {
    try {
      const url = input.url.startsWith('http') ? input.url : `https://${input.url}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'TeamBrain/1.5 (SEO Content Tool)',
          'Accept': 'text/html,application/xhtml+xml,text/plain',
        },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();

      let content = text;
      if (contentType.includes('html')) {
        content = text
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      if (content.length > 8000) {
        content = content.slice(0, 8000) + '... [truncated]';
      }

      return {
        success: true,
        data: { url, contentType, length: content.length, content }
      };
    } catch (error: any) {
      return { success: false, error: `Fetch failed: ${error.message}` };
    }
  },

  // web_render — headless Chromium via Playwright for JS-heavy pages (SPAs, dashboards)
  async web_render(input: {
    url: string;
    wait_for?: string;
    extract_tables?: boolean;
    actions?: Array<{ type: 'click' | 'fill' | 'select' | 'wait'; target: string; value?: string; wait_after?: number }>;
    content_max_length?: number;
  }): Promise<ToolResult> {
    try {
      const { chromium } = await import('playwright-core');
      const url = input.url.startsWith('http') ? input.url : `https://${input.url}`;
      const maxLen = Math.min(input.content_max_length || 10000, 50000);

      const browser = await chromium.launch({
        executablePath: '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      });

      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        viewport: { width: 1440, height: 900 },
      });

      const page = await context.newPage();

      try {
        // Use domcontentloaded for pages with actions (SPAs may never reach networkidle)
        const waitStrategy = (input.actions && input.actions.length > 0) ? 'domcontentloaded' : 'networkidle';
        await page.goto(url, { waitUntil: waitStrategy as any, timeout: 45000 });

        // Optional: wait for a specific selector to appear
        if (input.wait_for) {
          await page.waitForSelector(input.wait_for, { timeout: 15000 }).catch(() => {});
        }

        // Execute sequential browser actions if provided
        const actionLog: string[] = [];
        if (input.actions && input.actions.length > 0) {
          for (const action of input.actions) {
            try {
              const waitAfter = action.wait_after ?? 5000;
              switch (action.type) {
                case 'wait':
                  await page.waitForTimeout(parseInt(action.target) || 5000);
                  actionLog.push(`wait ${action.target}ms`);
                  break;
                case 'click': {
                  // Try text match first, then CSS selector
                  const textLocator = page.getByText(action.target, { exact: false }).first();
                  const hasText = await textLocator.isVisible().catch(() => false);
                  if (hasText) {
                    await textLocator.click();
                  } else {
                    await page.click(action.target);
                  }
                  await page.waitForTimeout(waitAfter);
                  actionLog.push(`click "${action.target}"`);
                  break;
                }
                case 'fill':
                  await page.fill(action.target, action.value || '');
                  await page.waitForTimeout(waitAfter);
                  actionLog.push(`fill "${action.target}" = "${action.value}"`);
                  break;
                case 'select':
                  await page.selectOption(action.target, action.value || '');
                  await page.waitForTimeout(waitAfter);
                  actionLog.push(`select "${action.target}" = "${action.value}"`);
                  break;
              }
            } catch (actionErr: any) {
              actionLog.push(`FAILED ${action.type} "${action.target}": ${actionErr.message}`);
            }
          }
        }

        // Extract tables as structured data if requested
        let tables: Array<{ headers: string[]; rows: string[][] }> = [];
        if (input.extract_tables) {
          tables = await page.evaluate(() => {
            // @ts-expect-error - runs in browser context
            return Array.from(document.querySelectorAll('table, [role="table"]')).map((table: any) => {
              const headers = Array.from(table.querySelectorAll('th, [role="columnheader"]')).map((th: any) => th.textContent?.trim() || '');
              const rows = Array.from(table.querySelectorAll('tr, [role="row"]')).slice(headers.length > 0 ? 1 : 0).map((tr: any) =>
                Array.from(tr.querySelectorAll('td, [role="cell"]')).map((td: any) => td.textContent?.trim() || '')
              ).filter((row: any) => row.length > 0);
              return { headers, rows };
            });
          }) as any;
        }

        // Get rendered text content
        const title = await page.title();
        let content = await page.evaluate(() => {
          ['script', 'style', 'noscript'].forEach((tag: string) => {
            // @ts-expect-error - runs in browser context
            document.querySelectorAll(tag).forEach((el: any) => el.remove());
          });
          // @ts-expect-error - runs in browser context
          return document.body?.innerText || document.body?.textContent || '';
        }) as string;

        content = content.replace(/\s+/g, ' ').trim();
        if (content.length > maxLen) {
          content = content.slice(0, maxLen) + '... [truncated]';
        }

        return {
          success: true,
          data: {
            url,
            title,
            content,
            tables: tables.length > 0 ? tables : undefined,
            actions_performed: actionLog.length > 0 ? actionLog : undefined,
          }
        };
      } finally {
        await browser.close();
      }
    } catch (error: any) {
      return { success: false, error: `web_render failed: ${error.message}` };
    }
  },

  // ── Plan Task (structured planning before execution) ──────────────────────

  async plan_task(input: {
    title: string;
    goal: string;
    scope_in?: string;
    scope_out?: string;
    steps: Array<{ n: number; title: string; description: string; tools: string[]; output: string }>;
    risks?: string[];
    api_unit_estimate?: number;
  }): Promise<ToolResult> {
    // Render a structured markdown plan. The chat stream emits this as text so
    // the frontend Plan Approval buttons (existing logic) can detect it.
    const lines: string[] = [];
    lines.push(`## 📋 Plán: ${input.title}`);
    lines.push('');
    lines.push(`**Cieľ:** ${input.goal}`);
    if (input.scope_in) lines.push(`**Scope IN:** ${input.scope_in}`);
    if (input.scope_out) lines.push(`**Scope OUT:** ${input.scope_out}`);
    if (input.api_unit_estimate) lines.push(`**Ahrefs API odhad:** ~${input.api_unit_estimate} units`);
    lines.push('');
    lines.push('### Kroky');
    lines.push('');
    for (const step of input.steps) {
      lines.push(`**${step.n}. ${step.title}**`);
      lines.push(`   ${step.description}`);
      if (step.tools.length > 0) lines.push(`   *Nástroje: ${step.tools.join(', ')}*`);
      lines.push(`   *Výstup: ${step.output}*`);
      lines.push('');
    }
    if (input.risks && input.risks.length > 0) {
      lines.push('### Riziká / Unknowns');
      for (const risk of input.risks) lines.push(`- ${risk}`);
      lines.push('');
    }
    lines.push('---');
    lines.push('✅ **Schváliť a začať** | ✏️ **Upraviť plán** | ❌ **Zrušiť**');

    return {
      success: true,
      data: {
        _plan: true,
        title: input.title,
        steps: input.steps.length,
        rendered: lines.join('\n'),
      }
    };
  },

  // ── Lighthouse (PageSpeed Insights API) ───────────────────────────────────

  async lighthouse_audit(input: {
    url: string;
    strategy?: 'mobile' | 'desktop';
    categories?: string[];
  }): Promise<ToolResult> {
    const apiKey = process.env.CRUX_API_KEY;
    if (!apiKey) {
      return { success: false, error: 'CRUX_API_KEY not configured — required for PageSpeed Insights API' };
    }

    const strategy = input.strategy || 'mobile';
    const cats = input.categories?.length
      ? input.categories
      : ['performance', 'accessibility', 'best-practices', 'seo'];

    const catParams = cats.map(c => `category=${encodeURIComponent(c)}`).join('&');
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(input.url)}&key=${apiKey}&strategy=${strategy}&${catParams}`;

    try {
      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(45000) });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return { success: false, error: `PageSpeed Insights API error ${res.status}: ${errText.slice(0, 200)}` };
      }

      const json = await res.json() as any;
      const lhr = json.lighthouseResult;
      const crux = json.loadingExperience;

      if (!lhr) {
        return { success: false, error: 'PageSpeed Insights returned no lighthouseResult' };
      }

      // Extract category scores
      const scores: Record<string, number | null> = {};
      for (const cat of cats) {
        const key = cat === 'best-practices' ? 'best-practices' : cat;
        scores[cat] = lhr.categories?.[key]?.score != null
          ? Math.round(lhr.categories[key].score * 100)
          : null;
      }

      // Core Web Vitals from field data (CrUX) — may be absent for low-traffic pages
      const fieldData: Record<string, any> = {};
      if (crux?.metrics) {
        const m = crux.metrics;
        const metricMap: Record<string, string> = {
          LARGEST_CONTENTFUL_PAINT_MS: 'lcp_ms',
          CUMULATIVE_LAYOUT_SHIFT_SCORE: 'cls',
          INTERACTION_TO_NEXT_PAINT: 'inp_ms',
          EXPERIMENTAL_TIME_TO_FIRST_BYTE: 'ttfb_ms',
          FIRST_CONTENTFUL_PAINT_MS: 'fcp_ms',
        };
        for (const [apiKey, alias] of Object.entries(metricMap)) {
          if (m[apiKey]) {
            fieldData[alias] = {
              p75: m[apiKey].percentiles?.p75,
              category: m[apiKey].category,
            };
          }
        }
        fieldData.overall = crux.overall_category;
      }

      // Key lab metrics from Lighthouse
      const labMetrics: Record<string, any> = {};
      const auditKeys = ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index', 'interactive'];
      for (const key of auditKeys) {
        const audit = lhr.audits?.[key];
        if (audit) {
          labMetrics[key] = { displayValue: audit.displayValue, score: audit.score != null ? Math.round(audit.score * 100) : null };
        }
      }

      // Top opportunities (low-score audits with savings estimates)
      const opportunities: any[] = [];
      if (lhr.audits) {
        for (const [, audit] of Object.entries(lhr.audits as Record<string, any>)) {
          if (audit.score !== null && audit.score < 0.9 && audit.details?.type === 'opportunity' && audit.details?.overallSavingsMs > 100) {
            opportunities.push({
              id: audit.id,
              title: audit.title,
              score: Math.round((audit.score || 0) * 100),
              savingsMs: Math.round(audit.details.overallSavingsMs),
            });
          }
        }
        opportunities.sort((a, b) => b.savingsMs - a.savingsMs);
      }

      return {
        success: true,
        data: {
          url: input.url,
          strategy,
          fetchTime: lhr.fetchTime,
          scores,
          fieldData: Object.keys(fieldData).length ? fieldData : null,
          labMetrics,
          opportunities: opportunities.slice(0, 8),
          _meta: {
            source: 'pagespeed_insights_v5',
            lighthouseVersion: lhr.lighthouseVersion,
            userAgent: lhr.environment?.networkUserAgent?.slice(0, 60),
          }
        }
      };
    } catch (error: any) {
      return { success: false, error: `lighthouse_audit failed: ${error.message}` };
    }
  },

  async get_current_date(): Promise<ToolResult> {
    const now = new Date();
    return {
      success: true,
      data: {
        date: now.toISOString().split('T')[0],
        time: now.toTimeString().split(' ')[0],
        timestamp: now.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    };
  },

  async suggest_ahrefs_export(input: {
    export_type: string;
    target: string;
    competitors?: string[];
    estimated_rows?: number;
    estimated_units?: number;
  }): Promise<ToolResult> {
    try {
      const { generateExportSuggestion, generateAhrefsUrl } = await import('../services/ahrefs-export');

      const suggestion = generateExportSuggestion(input.export_type, input.target, {
        competitors: input.competitors,
        estimatedRows: input.estimated_rows,
        estimatedUnits: input.estimated_units,
      });

      const url = generateAhrefsUrl(input.export_type, input.target, {
        mode: 'subdomains',
        country: 'sk',
        competitors: input.competitors,
      });

      return {
        success: true,
        data: {
          export_type: input.export_type,
          target: input.target,
          url,
          suggestion,
          message: 'Export suggestion generated. Display the "suggestion" field to the user as markdown.',
        }
      };
    } catch (error: any) {
      return { success: false, error: `suggest_ahrefs_export failed: ${error.message}` };
    }
  },

  async content_calendar(input: {
    action: 'create' | 'update' | 'list' | 'advance_status';
    title?: string;
    description?: string;
    status?: string;
    contentType?: string;
    deadline?: string;
    keywords?: string[];
    notes?: string;
    itemId?: string;
    filterStatus?: string;
    filterSearch?: string;
    siteId?: string;
  }): Promise<ToolResult> {
    try {
      const statusOrder = ['idea', 'brief', 'draft', 'review', 'published', 'archived'];

      switch (input.action) {
        case 'list': {
          const conditions: string[] = [];
          const params: any[] = [];
          let idx = 1;

          if (input.filterStatus) {
            conditions.push(`ci.status = $${idx++}`);
            params.push(input.filterStatus);
          }
          if (input.filterSearch) {
            conditions.push(`(ci.title ILIKE $${idx} OR ci.description ILIKE $${idx})`);
            params.push(`%${input.filterSearch}%`);
            idx++;
          }

          const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
          const items = await query(
            `SELECT ci.id, ci.title, ci.description, ci.status, ci.content_type, ci.deadline,
                    ci.keywords, ci.notes, ci.attachments, s.domain as site_domain,
                    u.name as assignee_name, ci.created_at, ci.updated_at
             FROM content_items ci
             LEFT JOIN sites s ON ci.site_id = s.id
             LEFT JOIN users u ON ci.assignee_id = u.id
             ${where}
             ORDER BY ci.updated_at DESC
             LIMIT 50`,
            params
          );

          return {
            success: true,
            data: {
              items: items.map(i => ({
                id: i.id,
                title: i.title,
                description: i.description,
                status: i.status,
                contentType: i.content_type,
                deadline: i.deadline,
                keywords: i.keywords,
                notes: i.notes,
                siteDomain: i.site_domain,
                assigneeName: i.assignee_name,
                createdAt: i.created_at,
                updatedAt: i.updated_at,
              })),
              total: items.length,
            }
          };
        }

        case 'create': {
          if (!input.title) {
            return { success: false, error: 'title is required for create action' };
          }
          const result = await queryOne<{ id: string }>(
            `INSERT INTO content_items (title, description, status, content_type, deadline, keywords, notes, site_id, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id`,
            [
              input.title,
              input.description || null,
              input.status || 'idea',
              input.contentType || 'article',
              input.deadline || null,
              input.keywords || null,
              input.notes || null,
              input.siteId || null,
              _currentUserId || null,
            ]
          );
          return {
            success: true,
            data: { id: result!.id, title: input.title, status: input.status || 'idea', message: `Content item "${input.title}" created successfully` }
          };
        }

        case 'update': {
          if (!input.itemId) {
            return { success: false, error: 'itemId is required for update action' };
          }
          const updates: string[] = [];
          const params: any[] = [];
          let idx = 1;

          if (input.title) { updates.push(`title = $${idx++}`); params.push(input.title); }
          if (input.description !== undefined) { updates.push(`description = $${idx++}`); params.push(input.description); }
          if (input.status) { updates.push(`status = $${idx++}`); params.push(input.status); }
          if (input.contentType) { updates.push(`content_type = $${idx++}`); params.push(input.contentType); }
          if (input.deadline !== undefined) { updates.push(`deadline = $${idx++}`); params.push(input.deadline || null); }
          if (input.keywords) { updates.push(`keywords = $${idx++}`); params.push(input.keywords); }
          if (input.notes !== undefined) { updates.push(`notes = $${idx++}`); params.push(input.notes); }
          if (input.siteId !== undefined) { updates.push(`site_id = $${idx++}`); params.push(input.siteId || null); }

          if (updates.length === 0) {
            return { success: false, error: 'No fields to update' };
          }

          updates.push(`updated_at = NOW()`);
          params.push(input.itemId);
          await query(`UPDATE content_items SET ${updates.join(', ')} WHERE id = $${idx}`, params);
          return { success: true, data: { id: input.itemId, message: 'Content item updated successfully' } };
        }

        case 'advance_status': {
          if (!input.itemId) {
            return { success: false, error: 'itemId is required for advance_status action' };
          }
          const item = await queryOne<{ status: string; title: string }>('SELECT status, title FROM content_items WHERE id = $1', [input.itemId]);
          if (!item) {
            return { success: false, error: 'Content item not found' };
          }
          const currentIdx = statusOrder.indexOf(item.status);
          if (currentIdx === -1 || currentIdx >= statusOrder.length - 1) {
            return { success: false, error: `Cannot advance from status "${item.status}"` };
          }
          const nextStatus = statusOrder[currentIdx + 1];
          await query('UPDATE content_items SET status = $1, updated_at = NOW() WHERE id = $2', [nextStatus, input.itemId]);
          return {
            success: true,
            data: { id: input.itemId, title: item.title, previousStatus: item.status, newStatus: nextStatus, message: `"${item.title}" advanced from ${item.status} to ${nextStatus}` }
          };
        }

        default:
          return { success: false, error: `Unknown action: ${input.action}` };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async read_user_file(input: {
    filename: string;
    limit?: number;
    offset?: number;
    columns?: string[];
    filter?: string;
    sort?: { column: string; direction?: 'asc' | 'desc' };
  }): Promise<ToolResult> {
    try {
      if (!_currentUserId) {
        return { success: false, error: 'read_user_file requires authenticated user context' };
      }
      const { readUserFile } = await import('../services/file-reader.js');
      const result = await readUserFile({
        filename: input.filename,
        limit: input.limit,
        offset: input.offset,
        columns: input.columns,
        filter: input.filter,
        sort: input.sort,
        userId: _currentUserId,
      });
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async save_user_file(input: { filename: string; format: string; data: string; description?: string }): Promise<ToolResult> {
    try {
      // Log incoming data size for debugging
      const dataPreview = input.data.substring(0, 200);
      let rowCount = 0;
      try {
        const parsedData = JSON.parse(input.data);
        rowCount = Array.isArray(parsedData) ? parsedData.length : (parsedData.rows?.length || 0);
      } catch { /* data is not JSON — that's fine for md, html, csv, txt formats */ }
      console.log(`[save_user_file] Receiving ${input.format} with ${input.data.length} chars, ~${rowCount} rows`);
      console.log(`[save_user_file] Data preview: ${dataPreview}...`);

      const fs = await import('fs/promises');
      const path = await import('path');
      const { generateFile } = await import('../services/file-generator.js');

      // Validate format
      const validFormats = ['xlsx', 'csv', 'docx', 'json', 'html', 'md', 'txt'];
      if (!validFormats.includes(input.format)) {
        return { success: false, error: `Invalid format: ${input.format}. Valid: ${validFormats.join(', ')}` };
      }

      // Generate file using existing file-generator
      const { buffer, mimeType, extension } = await generateFile(input.data, input.format as any);

      // Ensure uploads directory exists
      const uploadsDir = brainPath('uploads');
      await fs.mkdir(uploadsDir, { recursive: true });

      // Create unique filename with timestamp
      const userId = _currentUserId || 'system';
      const timestamp = Date.now();
      const sanitizedFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = path.join(uploadsDir, `${userId}_${timestamp}_${sanitizedFilename}`);

      // Save file to disk
      await fs.writeFile(storagePath, buffer);

      // Insert to database
      await query(
        `INSERT INTO user_files (user_id, filename, original_name, mime_type, size_bytes, storage_path)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [userId, sanitizedFilename, input.filename, mimeType, buffer.length, storagePath]
      );

      return {
        success: true,
        data: {
          filename: input.filename,
          format: input.format,
          size: buffer.length,
          sizeFormatted: `${(buffer.length / 1024).toFixed(1)} KB`,
          path: storagePath,
          description: input.description,
          message: `✅ Súbor "${input.filename}" bol úspešne vytvorený a uložený do tvojich Files.\n\nVeľkosť: ${(buffer.length / 1024).toFixed(1)} KB\nFormát: ${input.format.toUpperCase()}\nPopis: ${input.description || 'N/A'}\n\nSúbor je dostupný v sekcii Files na stiahnutie.`
        }
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  // ── manage_agent ──────────────────────────────────────────────────────────────

  async manage_agent(input: {
    action: 'create' | 'update' | 'extend' | 'delete' | 'get' | 'list';
    slug: string;
    name?: string;
    description?: string;
    system_prompt?: string;
    model?: 'haiku' | 'sonnet' | 'sonnet-high';
    tools?: string[];
    keywords?: string[];
    color?: string;
    icon?: string;
  }): Promise<ToolResult> {
    try {
      const {
        createCustomAgent,
        updateCustomAgent,
        deleteCustomAgent,
        upsertAgentExtension,
        getCustomAgent,
        getAgentExtension,
      } = await import('../services/custom-agents.js');
      const { agentRegistry } = await import('../agents/registry.js');

      const userId = _currentUserId || 'system';

      // Authenticated users at any role may manage agents (handoff 2026-06-29 —
      // team-level users were blocked; brain is a shared team workspace, so
      // agent CRUD is team-wide). Authentication is enforced upstream by the
      // chat route; an anonymous call (no userId) still bounces here.
      const isWrite = ['create', 'update', 'extend', 'delete'].includes(input.action);
      if (isWrite && !_currentUserId) {
        return { success: false, error: 'manage_agent write actions require an authenticated user.' };
      }

      switch (input.action) {
        case 'get': {
          const custom = getCustomAgent(input.slug);
          if (custom) return { success: true, data: { kind: 'custom', agent: custom } };
          if (agentRegistry.knows(input.slug)) {
            const r = agentRegistry.resolveForChat(input.slug);
            return { success: true, data: { kind: 'base', agent: {
              id: input.slug, tools: r?.toolIds,
              prompt: (r?.prompt || '').slice(0, 6000),
              extension: getAgentExtension(input.slug) ?? null,
            } } };
          }
          return { success: false, error: `Agent "${input.slug}" not found.` };
        }

        case 'list': {
          return { success: true, data: {
            base_specialists: agentRegistry.getSpecialistCardsWithExtensions(),
            brain_core: agentRegistry.getBrainCoreCards(),
            custom_agents: agentRegistry.getCustomAgentCards(),
          } };
        }
        case 'create': {
          if (!input.name || !input.system_prompt) {
            return { success: false, error: 'create requires: name, system_prompt' };
          }
          const agent = await createCustomAgent(
            {
              slug: input.slug,
              name: input.name,
              description: input.description,
              system_prompt: input.system_prompt,
              model: input.model,
              tools: input.tools,
              keywords: input.keywords,
              color: input.color,
              icon: input.icon,
            },
            userId
          );
          return {
            success: true,
            data: {
              message: `✅ Agent "${agent.name}" (${agent.slug}) bol vytvorený. Dostupný v AgentBrowseri.`,
              agent: { slug: agent.slug, name: agent.name, model: agent.model, icon: agent.icon },
            },
          };
        }

        case 'update': {
          const updated = await updateCustomAgent(input.slug, {
            name: input.name,
            description: input.description,
            system_prompt: input.system_prompt,
            model: input.model,
            tools: input.tools,
            keywords: input.keywords,
            color: input.color,
            icon: input.icon,
          });
          return {
            success: true,
            data: { message: `✅ Agent "${updated.name}" bol aktualizovaný.`, agent: updated },
          };
        }

        case 'extend': {
          const isBase = agentRegistry.knows(input.slug) && !agentRegistry.isCustom(input.slug);
          if (!isBase) {
            return { success: false, error: `"${input.slug}" is not a base specialist. Use "create" for new agents or "update" for custom agents.` };
          }
          const ext = await upsertAgentExtension(
            input.slug,
            {
              custom_description: input.description,
              extra_system_prompt: input.system_prompt,
              extra_keywords: input.keywords,
            },
            userId
          );
          return {
            success: true,
            data: { message: `✅ Špecialista "${input.slug}" bol rozšírený o vlastné inštrukcie.`, extension: ext },
          };
        }

        case 'delete': {
          await deleteCustomAgent(input.slug);
          return {
            success: true,
            data: { message: `✅ Agent "${input.slug}" bol deaktivovaný.` },
          };
        }

        default:
          return { success: false, error: `Unknown action: ${(input as any).action}` };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  // ── manage_persona ────────────────────────────────────────────────────────────

  async manage_persona(input: {
    action: 'create' | 'update' | 'delete' | 'get' | 'list';
    slug?: string;
    name?: string;
    name_localized?: string;
    description?: string;
    system_prompt?: string;
    icon?: string;
    color?: string;
  }): Promise<ToolResult> {
    try {
      const {
        createCustomPersona,
        updateCustomPersona,
        deleteCustomPersona,
        getCustomPersona,
      } = await import('../services/custom-personas.js');
      const { getPersona, getAllPersonas, PERSONAS } = await import('../personas/definitions.js');

      const userId = _currentUserId || 'system';

      // Authenticated users at any role may manage personas (handoff 2026-06-29).
      const isWrite = ['create', 'update', 'delete'].includes(input.action);
      if (isWrite && !_currentUserId) {
        return { success: false, error: 'manage_persona write actions require an authenticated user.' };
      }

      switch (input.action) {
        case 'get': {
          if (!input.slug) return { success: false, error: 'slug is required for get action' };
          const dbRow = getCustomPersona(input.slug);
          const persona = getPersona(input.slug);
          if (!persona && !dbRow) {
            return { success: false, error: `Persona "${input.slug}" not found.` };
          }
          const kind = dbRow
            ? (PERSONAS[input.slug] ? 'builtin_overridden' : 'custom')
            : 'builtin';
          return { success: true, data: { kind, persona: persona ?? null } };
        }

        case 'list': {
          const all = getAllPersonas();
          return {
            success: true,
            data: {
              personas: all.map(p => ({
                slug: p.id,
                name: p.name,
                nameLocalized: p.nameLocalized,
                icon: p.icon,
                description: p.description,
                kind: getCustomPersona(p.id)
                  ? (PERSONAS[p.id] ? 'builtin_overridden' : 'custom')
                  : 'builtin',
              })),
              total: all.length,
            }
          };
        }

        case 'create': {
          if (!input.slug) return { success: false, error: 'slug is required for create action' };
          if (!input.name || !input.system_prompt) {
            return { success: false, error: 'create requires: name, system_prompt' };
          }
          const row = await createCustomPersona(
            {
              slug: input.slug,
              name: input.name,
              name_localized: input.name_localized,
              description: input.description,
              icon: input.icon,
              color: input.color,
              system_prompt: input.system_prompt,
            },
            userId
          );
          return {
            success: true,
            data: {
              message: `✅ Persona "${row.name}" (${row.slug}) bola vytvorená.`,
              persona: { slug: row.slug, name: row.name, icon: row.icon },
            },
          };
        }

        case 'update': {
          if (!input.slug) return { success: false, error: 'slug is required for update action' };

          // Subtle: if no DB row exists but slug matches a built-in → create an override row
          // seeded from the built-in's current fields merged with the incoming patch.
          const existingDbRow = getCustomPersona(input.slug);
          if (!existingDbRow) {
            const builtIn = PERSONAS[input.slug];
            if (!builtIn) {
              return { success: false, error: `Persona "${input.slug}" not found (no built-in, no custom row).` };
            }
            // Seed override from built-in fields, apply patch on top
            const overrideRow = await createCustomPersona(
              {
                slug: builtIn.id,
                name: input.name ?? builtIn.name,
                name_localized: input.name_localized ?? builtIn.nameLocalized,
                description: input.description ?? builtIn.description,
                icon: input.icon ?? builtIn.icon,
                color: input.color ?? builtIn.color,
                system_prompt: input.system_prompt ?? builtIn.systemPrompt,
              },
              userId
            );
            return {
              success: true,
              data: {
                message: `✅ Built-in persona "${overrideRow.name}" má teraz override row. Zmeny sú aktívne.`,
                persona: { slug: overrideRow.slug, name: overrideRow.name, icon: overrideRow.icon, kind: 'builtin_overridden' },
              },
            };
          }

          // Normal update of an existing custom/override row
          const updated = await updateCustomPersona(input.slug, {
            name: input.name,
            name_localized: input.name_localized,
            description: input.description,
            icon: input.icon,
            color: input.color,
            system_prompt: input.system_prompt,
          });
          return {
            success: true,
            data: { message: `✅ Persona "${updated.name}" bola aktualizovaná.`, persona: updated },
          };
        }

        case 'delete': {
          if (!input.slug) return { success: false, error: 'slug is required for delete action' };
          const existingDbRow = getCustomPersona(input.slug);
          if (!existingDbRow) {
            const builtIn = PERSONAS[input.slug];
            if (!builtIn) {
              return { success: false, error: `Persona "${input.slug}" not found.` };
            }
            // Create an inactive override row to hide the built-in
            await createCustomPersona(
              {
                slug: builtIn.id,
                name: builtIn.name,
                name_localized: builtIn.nameLocalized,
                description: builtIn.description,
                icon: builtIn.icon,
                color: builtIn.color,
                system_prompt: builtIn.systemPrompt,
              },
              userId
            );
            // Immediately deactivate it
            await updateCustomPersona(builtIn.id, { is_active: false });
            return {
              success: true,
              data: { message: `✅ Built-in persona "${input.slug}" bola skrytá (is_active=false override row).` },
            };
          }
          await deleteCustomPersona(input.slug);
          return {
            success: true,
            data: { message: `✅ Persona "${input.slug}" bola deaktivovaná.` },
          };
        }

        default:
          return { success: false, error: `Unknown action: ${(input as any).action}` };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  // ==================== HIVE STACK DOCS ====================

  async docs_query(input: { query: string; stack?: string; limit?: number }): Promise<ToolResult> {
    try {
      const { embed } = await import('../services/vector');
      const { query: dbQuery } = await import('../db/connection');

      const limit = Math.min(input.limit || 3, 5000);
      const queryVec = await embed(input.query, 'query');
      const vecStr = '[' + queryVec.join(',') + ']';

      const stackFilter = input.stack ? 'AND stack = $3' : '';
      const params: any[] = [vecStr, limit];
      if (input.stack) params.push(input.stack);

      const rows = await dbQuery<{
        stack: string; title: string; url: string; section: string; content_md: string; similarity: number;
      }>(
        `SELECT stack, title, url, section, content_md,
                1 - (text_vector <=> $1::vector) AS similarity
         FROM hive_stack_docs
         WHERE text_vector IS NOT NULL ${stackFilter}
         ORDER BY text_vector <=> $1::vector
         LIMIT $2`,
        params
      );

      if (rows.length === 0) {
        return {
          success: true,
          data: { results: [], message: `No docs found for: "${input.query}"${input.stack ? ` in ${input.stack}` : ''}` }
        };
      }

      const results = rows.map(r => ({
        stack: r.stack,
        title: r.title,
        url: r.url,
        section: r.section,
        similarity: Math.round(r.similarity * 1000) / 1000,
        content: r.content_md,
      }));

      return {
        success: true,
        data: {
          query: input.query,
          stack_filter: input.stack || null,
          results,
          summary: results.map(r => `**${r.stack} / ${r.title}** (${r.section}, sim ${r.similarity})\n${r.content.slice(0, 800)}`).join('\n\n---\n\n'),
        }
      };
    } catch (error) {
      return { success: false, error: `docs_query failed: ${String(error)}` };
    }
  },

  // ==================== APACHE AGE — KNOWLEDGE GRAPH ====================

  async knowledge_graph_query(input: {
    mode: 'stats' | 'explore' | 'path';
    node?: string; depth?: number;
    fromNode?: string; toNode?: string; maxDepth?: number;
  }): Promise<ToolResult> {
    if (process.env.SEO_BRAIN_DESKTOP === '1') {
      return { success: false, error: 'knowledge_graph_query needs the server edition.' };
    }
    try {
      const { query: dbQuery } = await import('../db/connection');

      // Reuse the same safety + parse helpers as the routes by inlining
      // a tiny version here — the executor runs in-process with the
      // routes file, so the SQL we issue is identical.
      const safe = (raw: unknown): string | null => {
        const s = String(raw ?? '').trim();
        if (!s || s.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(s)) return null;
        return s;
      };
      const parseAg = (v: any): any => {
        if (typeof v !== 'string') return v;
        const c = v.replace(/::(vertex|edge|path|numeric|integer)$/, '');
        try { return JSON.parse(c); } catch { return c; }
      };
      const runCypher = async (cy: string, cols: string[]) => {
        const colSig = cols.map(c => `${c} agtype`).join(', ');
        // AGE is preloaded by the postmaster (session_preload_libraries on
        // brain_app role); search_path is set per-connection in pool.on('connect').
        const ageGraph = (process.env.AGE_GRAPH || 'hive_kg_graph').replace(/[^a-zA-Z0-9_]/g, '');
        const rows = await dbQuery<any>(
          `SELECT * FROM cypher('${ageGraph}', $cy$ ${cy} $cy$) AS (${colSig})`,
        );
        return rows.map(r => Object.fromEntries(cols.map(c => [c, parseAg(r[c])])));
      };

      if (input.mode === 'stats') {
        const [vertices, edges, domains] = await Promise.all([
          runCypher(`MATCH (n) RETURN labels(n) AS lbl, count(*) AS c`, ['lbl', 'c']),
          runCypher(`MATCH ()-[r]->() RETURN type(r) AS rt, count(*) AS c`, ['rt', 'c']),
          runCypher(
            `MATCH (d:Domain)<-[r:IN_DOMAIN]-(:Memory)
             RETURN d.name AS name, count(r) AS degree
             ORDER BY degree DESC LIMIT 10`,
            ['name', 'degree'],
          ),
        ]);
        return { success: true, data: {
          mode: 'stats',
          vertices: vertices.map(v => ({ labels: Array.isArray(v.lbl) ? v.lbl : [v.lbl], count: Number(v.c) })),
          edges:    edges.map(e => ({ type: String(e.rt), count: Number(e.c) })),
          topDomains: domains.map(d => ({ name: String(d.name), degree: Number(d.degree) })),
        }};
      }

      if (input.mode === 'explore') {
        const node = safe(input.node);
        if (!node) return { success: false, error: 'node param required (UUID/alphanumeric ≤64)' };
        const depth = Math.min(Math.max(Number(input.depth ?? 1), 1), 2);
        const rows = await runCypher(
          `MATCH (n:Entity { id: '${node}' })-[r*1..${depth}]-(m:Entity)
           RETURN n, r, m LIMIT 50`,
          ['n', 'r', 'm'],
        );
        return { success: true, data: { mode: 'explore', node, depth, results: rows } };
      }

      if (input.mode === 'path') {
        const from = safe(input.fromNode);
        const to = safe(input.toNode);
        if (!from || !to) return { success: false, error: 'fromNode + toNode required' };
        const maxDepth = Math.min(Math.max(Number(input.maxDepth ?? 3), 1), 5);
        const rows = await runCypher(
          `MATCH p = (a:Entity { id: '${from}' })-[*1..${maxDepth}]-(b:Entity { id: '${to}' })
           RETURN p ORDER BY length(p) LIMIT 1`,
          ['p'],
        );
        return { success: true, data: { mode: 'path', from, to, found: rows.length > 0, path: rows[0]?.p ?? null } };
      }

      return { success: false, error: `unknown mode: ${input.mode}` };
    } catch (err: any) {
      return { success: false, error: `knowledge_graph_query failed: ${err?.message ?? String(err)}` };
    }
  },

  // ==================== PTC — Programmatic Tool Calling ====================
  // Sandboxed JS execution. Uses Node `vm` module — no network, no fs, no process.
  // Globals: Math, JSON, Date, console.log (captured), data (from input).
  // Code must assign final value to `result` (or expose last expression value).
  // Timeout 10s. Errors are returned, not thrown (LLM can react to them).
  async code_execute(input: { code: string; data?: unknown }): Promise<ToolResult> {
    const t0 = Date.now();
    try {
      const vm = await import('vm');
      const logs: string[] = [];
      const sandboxConsole = {
        log: (...args: unknown[]) => logs.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')),
        warn: (...args: unknown[]) => logs.push('[warn] ' + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')),
        error: (...args: unknown[]) => logs.push('[error] ' + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')),
      };
      const context: Record<string, unknown> = {
        Math, JSON, Date, console: sandboxConsole,
        data: input.data,
        result: undefined as unknown,
      };
      vm.createContext(context);

      // Try as expression first (so `result = ...` is optional); fall back to full statement body.
      let runError: string | null = null;
      try {
        const exprWrapped = `result = (${input.code});`;
        const script = new vm.Script(exprWrapped, { filename: 'code_execute.js' });
        script.runInContext(context, { timeout: 10_000 });
      } catch (_exprErr) {
        try {
          const script = new vm.Script(input.code, { filename: 'code_execute.js' });
          script.runInContext(context, { timeout: 10_000 });
        } catch (e: any) {
          runError = String(e?.message ?? e);
        }
      }

      const duration_ms = Date.now() - t0;
      if (runError) {
        return { success: false, error: runError, data: { logs, duration_ms } };
      }

      // Serialize result safely (truncate large outputs)
      const result = context.result;
      const serialized = result === undefined ? null : result;
      let resultStr: string;
      try {
        resultStr = JSON.stringify(serialized);
      } catch {
        resultStr = String(serialized);
      }
      const MAX_RESULT_BYTES = 200_000;
      const truncated = resultStr.length > MAX_RESULT_BYTES;
      const finalResult = truncated
        ? resultStr.slice(0, MAX_RESULT_BYTES) + `\n…[truncated, ${resultStr.length - MAX_RESULT_BYTES} more bytes]`
        : serialized;

      return {
        success: true,
        data: {
          result: finalResult,
          logs,
          duration_ms,
          ...(truncated && { truncated: true, total_bytes: resultStr.length }),
        },
      };
    } catch (err: any) {
      return { success: false, error: `code_execute failed: ${err?.message ?? String(err)}`, data: { duration_ms: Date.now() - t0 } };
    }
  },

  async cloudflare_zone_analytics(input: { domain: string; days?: number }): Promise<ToolResult> {
    try {
      const { zoneIdFor, zoneTraffic } = await import('../services/cloudflare-analytics.js');
      const token = process.env.CLOUDFLARE_API_TOKEN || '';
      if (!token.trim()) return { success: false, error: 'Cloudflare token is empty. Add it in Settings and run Check.' };
      const domain = String(input.domain || '').trim();
      const zoneId = await zoneIdFor(token, domain);
      const traffic = await zoneTraffic(token, zoneId, domain, Number(input.days || 7));
      return { success: true, data: traffic };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  async google_organic(input: { query: string; gl?: string; hl?: string; num?: number }): Promise<ToolResult> {
    try {
      const { googleOrganic } = await import('../services/serpapi.js');
      return { success: true, data: await googleOrganic(input) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  async google_ai_mode(input: { query: string }): Promise<ToolResult> {
    try {
      const { googleAiMode } = await import('../services/serpapi.js');
      return { success: true, data: await googleAiMode(input) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};

// Optional execution context — passed by caller to enrich Bronze observability rows
export interface ToolExecutionContext {
  agentId?: string;
  conversationId?: string;
  requestId?: string;
  model?: string;
  role?: string; // caller's user role — gates self-management write actions
}

// Bronze observability — fire-and-forget INSERT into tool_calls_log hypertable
// (migration 032). Never blocks or fails tool execution.
async function logToolCall(opts: {
  toolName: string;
  toolInput: Record<string, any>;
  userId?: string;
  durationMs: number;
  success: boolean;
  outputSizeBytes: number;
  errorMessage?: string;
  ctx?: ToolExecutionContext;
}): Promise<void> {
  try {
    // Truncate to keep table compact — full data lives in app logs
    const inputArgs = JSON.stringify(opts.toolInput).slice(0, 4000);
    const errorMsg = opts.errorMessage ? opts.errorMessage.slice(0, 1000) : null;
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    // user_id, conversation_id, request_id columns are uuid — guard against non-uuid (e.g. 'system')
    const userIdSafe = opts.userId && uuidRe.test(opts.userId) ? opts.userId : null;
    const convIdSafe = opts.ctx?.conversationId && uuidRe.test(opts.ctx.conversationId) ? opts.ctx.conversationId : null;
    const reqIdSafe = opts.ctx?.requestId && uuidRe.test(opts.ctx.requestId) ? opts.ctx.requestId : null;
    await query(
      `INSERT INTO tool_calls_log
        (tool_name, user_id, agent_id, conversation_id, request_id, model_used,
         input_args, output_size_bytes, duration_ms, success, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)`,
      [
        opts.toolName,
        userIdSafe,
        opts.ctx?.agentId || null,
        convIdSafe,
        reqIdSafe,
        opts.ctx?.model || null,
        inputArgs,
        opts.outputSizeBytes,
        opts.durationMs,
        opts.success,
        errorMsg,
      ]
    );
  } catch (err) {
    // Observability failure must not break tool execution
    console.warn(`[tool_calls_log] insert failed for ${opts.toolName}: ${String(err).slice(0, 200)}`);
  }
}

// Max result size guard (~15K tokens at 3.5 chars/token)
const MAX_RESULT_CHARS = 50000;

// Smart truncation: keeps structure, truncates rows
function truncateResult(data: any): any {
  // Skip truncation if explicitly disabled (e.g., snapshots already safe at 1000 rows)
  if (data?._noTruncate === true) {
    return data;
  }

  if (data?.rows && Array.isArray(data.rows) && data.rows.length > 200) {
    return {
      ...data,
      rows: data.rows.slice(0, 200),
      _truncated: true,
      _totalRows: data.rows.length,
      _message: `Zobrazených 200 z ${data.rows.length} riadkov. Pre kompletný export použi fetchAll=true s vyšším rowLimit — dáta sa automaticky uložia ako CSV súbor.`
    };
  }
  return data;
}

// Main executor function
export async function executeTool(
  toolName: string,
  toolInput: Record<string, any>,
  userId?: string,
  ctx?: ToolExecutionContext
): Promise<Anthropic.ToolResultBlockParam> {
  const toolStart = Date.now();
  console.log(`Executing tool: ${toolName}`, toolInput);
  _currentUserId = userId;
  _currentUserRole = ctx?.role;

  const executor = toolExecutors[toolName];

  if (!executor) {
    const duration = Date.now() - toolStart;
    console.error(`[Tool Error] ${JSON.stringify({ tool: toolName, error: 'unknown_tool', params_keys: Object.keys(toolInput), duration_ms: duration })}`);
    void logToolCall({
      toolName, toolInput, userId, ctx,
      durationMs: duration, success: false, outputSizeBytes: 0,
      errorMessage: 'unknown_tool',
    });
    return {
      type: 'tool_result',
      tool_use_id: '', // Will be set by caller
      content: JSON.stringify({
        error: `Unknown tool: ${toolName}`,
        available_tools: Object.keys(toolExecutors)
      }),
      is_error: true
    };
  }

  try {
    const result = await executor(toolInput);
    const duration = Date.now() - toolStart;

    if (!result.success) {
      console.error(`[Tool Error] ${JSON.stringify({ tool: toolName, error: result.error, params_keys: Object.keys(toolInput), duration_ms: duration })}`);
    } else {
      console.log(`Tool ${toolName} OK (${duration}ms)`);
    }

    let resultData = result.data || { error: result.error };
    let resultContent = JSON.stringify(resultData);

    // Token safety: truncate oversized results (unless explicitly disabled)
    if (resultContent.length > MAX_RESULT_CHARS && resultData?._noTruncate !== true) {
      console.warn(`[Token Safety] Tool ${toolName} result too large: ${resultContent.length} chars. Truncating.`);
      const beforeRows = resultData?.rows?.length || 0;
      resultData = truncateResult(resultData);
      const afterRows = resultData?.rows?.length || 0;
      console.log(`[Token Safety] Rows: ${beforeRows} → ${afterRows}`);
      resultContent = JSON.stringify(resultData);

      // If still too large after smart truncation, hard-cut
      if (resultContent.length > MAX_RESULT_CHARS) {
        resultContent = resultContent.slice(0, MAX_RESULT_CHARS) +
          '... [TRUNCATED: result exceeded ' + MAX_RESULT_CHARS + ' chars]';
      }
    } else if (resultData?._noTruncate === true && resultContent.length > MAX_RESULT_CHARS) {
      // Snapshot results: safe to pass through even if large (max 1000 rows)
      console.log(`[Token Safety] Tool ${toolName} result large (${resultContent.length} chars, ${resultData?.rows?.length || 0} rows) but marked _noTruncate, passing through.`);
    }

    void logToolCall({
      toolName, toolInput, userId, ctx,
      durationMs: duration,
      success: result.success,
      outputSizeBytes: resultContent.length,
      errorMessage: result.success ? undefined : (result.error || 'unknown_error'),
    });

    return {
      type: 'tool_result',
      tool_use_id: '', // Will be set by caller
      content: resultContent,
      is_error: !result.success
    };
  } catch (error) {
    const duration = Date.now() - toolStart;
    console.error(`[Tool Error] ${JSON.stringify({ tool: toolName, error: String(error), params_keys: Object.keys(toolInput), duration_ms: duration })}`);
    void logToolCall({
      toolName, toolInput, userId, ctx,
      durationMs: duration, success: false, outputSizeBytes: 0,
      errorMessage: String(error),
    });
    return {
      type: 'tool_result',
      tool_use_id: '', // Will be set by caller
      content: JSON.stringify({ error: String(error) }),
      is_error: true
    };
  }
}

// Check if Ahrefs MCP Bridge is available
// MCP Bridge uses Claude Code CLI, so it's always available if the server is running
export function isAhrefsConfigured(): boolean {
  return true; // MCP Bridge is always available
}

// ── GA4 Max helpers (Run T, 2026-05-26) ───────────────────────────────────

/**
 * Resolve siteUrl → GA4 propertyId. Accepts:
 *   - raw property ID (numeric, e.g. "123456789")
 *   - bare domain (e.g. "example.com")
 *   - full URL (https://example.com/) — strips protocol + trailing slash
 * Returns null if no mapping found in `sites` table.
 */
async function ga4ResolveProperty(siteUrl: string, ga4: any): Promise<string | null> {
  if (/^\d+$/.test(siteUrl)) return siteUrl;
  const map = await ga4.getGA4PropertyMap();
  const clean = siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return map[siteUrl] || map[clean] || null;
}

/**
 * Normalize a siteUrl to a bare registrable domain for GA4 hostName filtering.
 * org uses ONE GA4 property for all 3 domains; every per-domain report must
 * constrain results via dimensionFilter on hostName.
 *
 * Examples:
 *   "https://www.example-qa.com/" → "example-qa.com"
 *   "www.example.com"          → "example.com"
 *   "example-dev.com"        → "example-dev.com"
 *   "254053187"                → null  (numeric propertyId — no domain filter)
 */
function ga4NormalizeHostName(siteUrl: string): string | null {
  if (/^\d+$/.test(siteUrl)) return null;          // raw property ID — caller wants all domains
  const bare = siteUrl
    .replace(/^https?:\/\//, '')                   // strip scheme
    .replace(/^www\./, '')                          // strip leading www.
    .replace(/\/.*$/, '');                          // strip path / trailing slash
  return bare || null;
}

/** Flatten a GA4 report's rows into plain JS objects keyed by header name. */
function ga4ParseRows(report: any): Array<Record<string, string | number>> {
  const dimHeaders = report.dimensionHeaders || [];
  const metHeaders = report.metricHeaders || [];
  return (report.rows || []).map((r: any) => {
    const obj: Record<string, string | number> = {};
    dimHeaders.forEach((h: any, i: number) => { obj[h.name] = r.dimensionValues[i]?.value ?? ''; });
    metHeaders.forEach((h: any, i: number) => {
      const v = r.metricValues[i]?.value ?? '0';
      const n = Number(v);
      obj[h.name] = Number.isFinite(n) ? n : v;
    });
    return obj;
  });
}
