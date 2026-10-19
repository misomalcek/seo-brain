import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import crypto from 'crypto';
import { query as dbQuery, queryOne } from '../db/connection';

const REPORTS_DIR = '/opt/team-brain/reports/mcp';
const SNAPSHOT_DIR = '/opt/team-brain/ahrefs';
const MCP_SCRIPT = '/opt/team-brain/apps/brain-api/scripts/mcp-execute.sh';

// Cache TTL per tool type (in hours)
// Stable data (DR, competitors, backlinks) changes at most weekly — cache aggressively
const CACHE_TTL: Record<string, number> = {
  ahrefs_domain_rating: 168,      // 7 days — DR changes very slowly
  ahrefs_organic_keywords: 24,    // 1 day
  ahrefs_backlinks: 72,           // 3 days
  ahrefs_top_pages: 24,           // 1 day
  ahrefs_competitors: 168,        // 7 days — competitor set is stable
  ahrefs_keyword_overview: 48,    // 2 days
  ahrefs_serp_overview: 12,       // 12h — SERP changes more often
  ahrefs_broken_backlinks: 168,   // 7 days — rarely changes overnight
  ahrefs_referring_domains: 72,   // 3 days
  ahrefs_batch_analysis: 48,      // 2 days
  ahrefs_keyword_ideas: 48,       // 2 days
  ahrefs_site_audit_projects: 168, // 7 days — project list rarely changes
  ahrefs_site_audit_issues: 72,    // 3 days
  ahrefs_site_audit_page_explorer: 72, // 3 days
  ahrefs_related_terms: 48,        // 2 days
  ahrefs_search_suggestions: 48,   // 2 days
  ahrefs_volume_by_country: 168,   // 7 days — volume rarely changes
  ahrefs_anchors: 72,              // 3 days
  ahrefs_pages_by_backlinks: 72,   // 3 days
  ahrefs_pages_by_internal_links: 72, // 3 days
  ahrefs_linked_anchors_internal: 72, // 3 days
  ahrefs_pages_by_traffic: 24,     // 1 day — traffic shifts often
  ahrefs_linked_domains: 72,       // 3 days
  ahrefs_budget: 2,                // 2h — usage counter changes as queries happen, fresh-sensitive
};

// Snapshot TTL per tool type (in hours) — file-based persistent cache
const SNAPSHOT_TTL: Record<string, number> = {
  ahrefs_organic_keywords: 48,
  ahrefs_backlinks: 168,          // 7 days
  ahrefs_top_pages: 48,
  ahrefs_competitors: 168,        // 7 days
  ahrefs_broken_backlinks: 168,   // 7 days
  ahrefs_referring_domains: 72,
  ahrefs_keyword_ideas: 72,
  ahrefs_anchors: 168,               // 7 days
  ahrefs_pages_by_backlinks: 168,    // 7 days
  ahrefs_pages_by_internal_links: 168, // 7 days
  ahrefs_pages_by_traffic: 48,       // 2 days
};

// Build a stable filename key from tool + primary params (no limit — snapshots contain full data)
function buildSnapshotFilename(tool: string, params: Record<string, any>): string {
  const primary = (params.target || params.keyword || 'unknown').replace(/[^a-zA-Z0-9.-]/g, '_');
  const secondary = params.country ? `_${params.country}` : '';
  const toolShort = tool.replace('ahrefs_', '');
  return `${toolShort}_${primary}${secondary}.json`;
}

async function loadSnapshot(tool: string, params: Record<string, any>): Promise<any | null> {
  const ttlHours = SNAPSHOT_TTL[tool];
  if (!ttlHours) return null;
  const filePath = path.join(SNAPSHOT_DIR, buildSnapshotFilename(tool, params));
  try {
    const stat = await fs.stat(filePath);
    const ageHours = (Date.now() - stat.mtimeMs) / 3600000;
    if (ageHours > ttlHours) return null;
    const content = await fs.readFile(filePath, 'utf-8');
    const snap = JSON.parse(content);
    console.log(`[MCP Bridge] Snapshot HIT for ${tool} (${ageHours.toFixed(1)}h old) → ${path.basename(filePath)}`);
    return snap.data;
  } catch {
    return null;
  }
}

async function saveSnapshot(tool: string, params: Record<string, any>, data: any): Promise<void> {
  if (!SNAPSHOT_TTL[tool]) return;
  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
  const filePath = path.join(SNAPSHOT_DIR, buildSnapshotFilename(tool, params));
  await fs.writeFile(filePath, JSON.stringify({ tool, params, savedAt: new Date().toISOString(), data }, null, 2));
  console.log(`[MCP Bridge] Snapshot saved → ${path.basename(filePath)}`);
}

function buildCacheKey(tool: string, params: Record<string, any>): string {
  const sorted = JSON.stringify(params, Object.keys(params).sort());
  return crypto.createHash('sha256').update(`${tool}:${sorted}`).digest('hex');
}

async function getCachedResult(cacheKey: string): Promise<{ data: any; reportFilename?: string; cachedAt?: Date; expiresAt?: Date } | null> {
  const row = await queryOne<{ result: any; report_filename: string | null; created_at: Date; expires_at: Date }>(
    'SELECT result, report_filename, created_at, expires_at FROM mcp_cache WHERE cache_key = $1 AND expires_at > NOW()',
    [cacheKey]
  );
  if (row) {
    return {
      data: row.result,
      reportFilename: row.report_filename || undefined,
      cachedAt: row.created_at,
      expiresAt: row.expires_at,
    };
  }
  return null;
}

async function setCachedResult(cacheKey: string, tool: string, params: Record<string, any>, result: any, reportFilename?: string): Promise<void> {
  const ttlHours = CACHE_TTL[tool] || 6;
  await queryOne(
    `INSERT INTO mcp_cache (cache_key, tool_name, params, result, report_filename, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + $6::interval)
     ON CONFLICT (cache_key) DO UPDATE SET result = $4, report_filename = $5, expires_at = NOW() + $6::interval`,
    [cacheKey, tool, JSON.stringify(params), JSON.stringify(result), reportFilename || null, `${ttlHours} hours`]
  );
}

// Clean expired cache entries (called periodically)
export async function cleanExpiredCache(): Promise<number> {
  const result = await dbQuery<{ count: string }>('DELETE FROM mcp_cache WHERE expires_at < NOW()');
  return result.length;
}

// Ensure reports directory exists
async function ensureReportsDir() {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
}

export interface MCPRequest {
  tool: string;
  params: Record<string, any>;
  outputFormat?: 'json' | 'markdown';
}

export interface MCPResult {
  success: boolean;
  data?: any;
  error?: string;
  reportPath?: string;
  executionTime?: number;
  reportFilename?: string;
}

// Generate a unique report filename
function generateReportPath(tool: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(REPORTS_DIR, `${tool}-${timestamp}.json`);
}

// Get today's date in YYYY-MM-DD format
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

// Get latest date with available GSC data (2-day delay)
function getGSCEndDate(): string {
  const date = new Date();
  date.setDate(date.getDate() - 2);
  return date.toISOString().split('T')[0];
}

// Get date N days ago in YYYY-MM-DD format (default 28 for GSC)
function getDaysAgo(days: number = 28): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

// Validate and clamp GSC start date (max 16 months history)
function clampGSCStartDate(startDate: string): string {
  const maxHistory = new Date();
  maxHistory.setMonth(maxHistory.getMonth() - 16);
  const requested = new Date(startDate);
  if (requested < maxHistory) {
    return maxHistory.toISOString().split('T')[0];
  }
  return startDate;
}

// Build the prompt for Claude Code to execute MCP tool
function buildMCPPrompt(request: MCPRequest): string {
  const { tool, params } = request;
  const today = getToday();

  const toolPrompts: Record<string, (p: any) => string> = {
    'ahrefs_domain_rating': (p) =>
      `Use the mcp__ahrefs__site-explorer-domain-rating tool to get domain rating for target="${p.target}" with date="${today}". Return ONLY the JSON result, no explanation.`,

    'ahrefs_organic_keywords': (p) =>
      `Use the mcp__ahrefs__site-explorer-organic-keywords tool to get organic keywords for target="${p.target}", country="${p.country || 'sk'}", date="${today}", mode="subdomains", limit=${p.limit || 1000}. Select: keyword, position, volume, traffic, url, keyword_difficulty. Return ONLY the JSON result, no explanation.`,

    'ahrefs_backlinks': (p) =>
      `Use the mcp__ahrefs__site-explorer-all-backlinks tool to get backlinks for target="${p.target}", mode="subdomains", limit=${p.limit || 25}. Select: url_from, domain_rating_source, anchor, url_to, dofollow. Return ONLY the JSON result, no explanation.`,

    'ahrefs_top_pages': (p) =>
      `Use the mcp__ahrefs__site-explorer-top-pages tool to get top pages for target="${p.target}", date="${today}", mode="subdomains", limit=${p.limit || 25}. Select: url, traffic, keywords, top_keyword, value. Return ONLY the JSON result, no explanation.`,

    'ahrefs_competitors': (p) =>
      `Use the mcp__ahrefs__site-explorer-organic-competitors tool to find competitors for target="${p.target}", country="${p.country || 'sk'}", date="${today}", mode="subdomains", limit=${p.limit || 20}. Select: domain, common_keywords, traffic, domain_rating. Return ONLY the JSON result, no explanation.`,

    'ahrefs_keyword_overview': (p) =>
      `Use the mcp__ahrefs__keywords-explorer-overview tool to get keyword overview for keywords="${p.keyword}", country="${p.country || 'sk'}". Select: keyword, volume, difficulty, cpc, clicks, global_volume. Return ONLY the JSON result, no explanation.`,

    'ahrefs_serp_overview': (p) =>
      `Use the mcp__ahrefs__serp-overview tool to get SERP overview for keyword="${p.keyword}", country="${p.country || 'sk'}". Return top 10 results including SERP features (featured snippet, people also ask, etc.) as JSON only, no explanation.`,

    // ==================== NEW AHREFS TOOLS ====================

    'ahrefs_broken_backlinks': (p) =>
      `Use the mcp__ahrefs__site-explorer-broken-backlinks tool to find broken backlinks for target="${p.target}", mode="subdomains", limit=${p.limit || 50}. Select: url_to, url_from, domain_rating_source, anchor. Sort by domain_rating_source descending. Return ONLY the JSON result, no explanation.`,

    'ahrefs_keyword_ideas': (p) =>
      `Use the mcp__ahrefs__keywords-explorer-matching-terms tool to find keyword ideas for keyword="${p.keyword}", country="${p.country || 'sk'}", limit=${p.limit || 50}. Select: keyword, volume, difficulty, cpc, traffic_potential. Return ONLY the JSON result, no explanation.`,

    'ahrefs_referring_domains': (p) =>
      `Use the mcp__ahrefs__site-explorer-referring-domains tool with these EXACT parameters: target="${p.target}", mode="subdomains", limit=${p.limit || 50}, select="domain,domain_rating,links_to_target,dofollow_links,traffic_domain". Return ONLY the JSON result, no explanation.`,

    'ahrefs_batch_analysis': (p) =>
      `Use the mcp__ahrefs__batch-analysis tool to analyze multiple domains. targets=${JSON.stringify(p.targets)}, date="${today}". Return domain, domain_rating, organic_traffic, organic_keywords for each domain as JSON only, no explanation.`,

    // ==================== SITE AUDIT TOOLS ====================

    'ahrefs_site_audit_projects': (_p: any) =>
      `Use the mcp__ahrefs__site-audit-projects tool to list all site audit projects. Return ONLY the JSON result, no explanation.`,

    'ahrefs_site_audit_issues': (p) =>
      `Use the mcp__ahrefs__site-audit-issues tool with these EXACT parameters: project_id=${p.project_id} (integer, not string). Return ONLY the JSON result, no explanation.`,

    'ahrefs_site_audit_page_explorer': (p) =>
      `Use the mcp__ahrefs__site-audit-page-explorer tool with these EXACT parameters: project_id=${p.project_id} (integer, not string), limit=${p.limit || 50}. Return ONLY the JSON result, no explanation.`,

    // ==================== KEYWORDS EXPLORER TOOLS ====================

    'ahrefs_related_terms': (p) =>
      `Use the mcp__ahrefs__keywords-explorer-related-terms tool to find related terms for keyword="${p.keyword}", country="${p.country || 'sk'}", limit=${p.limit || 30}. Select: keyword, volume, difficulty, traffic_potential. Return ONLY the JSON result, no explanation.`,

    'ahrefs_search_suggestions': (p) =>
      `Use the mcp__ahrefs__keywords-explorer-search-suggestions tool to get suggestions for keyword="${p.keyword}", country="${p.country || 'sk'}", limit=${p.limit || 30}. Select: keyword, volume, difficulty. Return ONLY the JSON result, no explanation.`,

    'ahrefs_volume_by_country': (p) =>
      `Use the mcp__ahrefs__keywords-explorer-volume-by-country tool to get volume by country for keyword="${p.keyword}". Return ONLY the JSON result, no explanation.`,

    // ==================== LINK ANALYSIS TOOLS ====================

    'ahrefs_anchors': (p) =>
      `Use the mcp__ahrefs__site-explorer-anchors tool to get anchor text for target="${p.target}", mode="subdomains", limit=${p.limit || 50}. Select: anchor, dofollow, referring_domains, referring_pages. Return ONLY the JSON result, no explanation.`,

    'ahrefs_pages_by_backlinks': (p) =>
      `Use the mcp__ahrefs__site-explorer-pages-by-backlinks tool to get pages by backlinks for target="${p.target}", mode="subdomains", limit=${p.limit || 50}. Select: url, dofollow, referring_domains, referring_pages. Return ONLY the JSON result, no explanation.`,

    'ahrefs_pages_by_internal_links': (p) =>
      `Use the mcp__ahrefs__site-explorer-pages-by-internal-links tool to get internal link distribution for target="${p.target}", limit=${p.limit || 50}. Return ONLY the JSON result, no explanation.`,

    'ahrefs_linked_anchors_internal': (p) =>
      `Use the mcp__ahrefs__site-explorer-linked-anchors-internal tool to get internal anchor text for target="${p.target}", limit=${p.limit || 50}. Return ONLY the JSON result, no explanation.`,

    'ahrefs_pages_by_traffic': (p) =>
      `Use the mcp__ahrefs__site-explorer-pages-by-traffic tool to get pages by traffic for target="${p.target}", country="${p.country || 'sk'}", mode="subdomains", limit=${p.limit || 50}. Select: url, traffic, keywords, value. Return ONLY the JSON result, no explanation.`,

    'ahrefs_linked_domains': (p) =>
      `Use the mcp__ahrefs__site-explorer-linked-domains tool to get outbound linked domains for target="${p.target}", mode="subdomains", limit=${p.limit || 50}. Select: domain, links_to_target, dofollow, nofollow. Return ONLY the JSON result, no explanation.`,

    'ahrefs_budget': (_p: any) =>
      `Use the mcp__ahrefs__subscription-info-limits-and-usage tool to retrieve Ahrefs account subscription info, unit limits, and current usage. Return ONLY the JSON result, no explanation.`,

  };

  const promptBuilder = toolPrompts[tool];
  if (!promptBuilder) {
    return `Use the Ahrefs MCP tools to: ${tool} with params: ${JSON.stringify(params)}. Date: ${today}. Return results as JSON only.`;
  }

  return promptBuilder(params);
}

// Save report metadata to database for user tracking
async function trackReport(userId: string, filename: string, toolName: string, sizeBytes: number): Promise<void> {
  try {
    const toolType = toolName.startsWith('ahrefs') ? 'ahrefs' : toolName.startsWith('gsc') ? 'gsc' : 'other';
    await queryOne(
      `INSERT INTO user_reports (user_id, filename, tool_name, tool_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, filename, toolName, toolType, sizeBytes]
    );
  } catch (error) {
    console.error('[MCP Bridge] Failed to track report:', error);
  }
}

// Execute Claude Code with MCP tools (with cache)
export async function executeMCPTool(request: MCPRequest, userId?: string): Promise<MCPResult> {
  await ensureReportsDir();

  // Check file snapshot first (persistent cross-session cache)
  try {
    const snapshotData = await loadSnapshot(request.tool, request.params);
    if (snapshotData !== null) {
      const dataWithFreshness = (snapshotData && typeof snapshotData === 'object' && !Array.isArray(snapshotData))
        ? { ...snapshotData, _freshness: { source: 'file_snapshot' } }
        : snapshotData;
      return { success: true, data: dataWithFreshness, executionTime: 0 };
    }
  } catch { /* ignore snapshot errors */ }

  // Check DB cache
  const cacheKey = buildCacheKey(request.tool, request.params);
  try {
    const cached = await getCachedResult(cacheKey);
    if (cached) {
      console.log(`[MCP Bridge] Cache HIT for ${request.tool}`);
      // Inject freshness metadata so Claude can see how old the data is
      const ageHours = cached.cachedAt
        ? Math.round((Date.now() - new Date(cached.cachedAt).getTime()) / 360000) / 10
        : null;
      const dataWithFreshness = (cached.data && typeof cached.data === 'object' && !Array.isArray(cached.data))
        ? { ...cached.data, _freshness: { source: 'mcp_cache', cachedAt: cached.cachedAt, expiresAt: cached.expiresAt, ageHours } }
        : cached.data;
      return {
        success: true,
        data: dataWithFreshness,
        reportFilename: cached.reportFilename,
        executionTime: 0,
      };
    }
  } catch (err) {
    console.log(`[MCP Bridge] Cache check failed, proceeding without cache`);
  }

  console.log(`[MCP Bridge] Cache MISS for ${request.tool}`);

  const startTime = Date.now();
  const reportPath = generateReportPath(request.tool);
  const prompt = buildMCPPrompt(request);

  console.log(`[MCP Bridge] Executing tool: ${request.tool}`);
  console.log(`[MCP Bridge] Prompt: ${prompt.substring(0, 100)}...`);

  return new Promise((resolve) => {
    const chunks: string[] = [];
    const errorChunks: string[] = [];

    // Spawn the MCP script with the prompt
    // The script uses 'script' command to provide a pseudo-TTY
    const proc = spawn(MCP_SCRIPT, [prompt], {
      cwd: '/opt/team-brain',
      env: {
        HOME: '/home/brain-admin',
        USER: 'brain-admin',
        PATH: '/home/brain-admin/.local/bin:/home/brain-admin/.nvm/versions/node/v22.13.1/bin:/usr/local/bin:/usr/bin:/bin',
        TERM: 'xterm-256color',
        LANG: 'en_US.UTF-8'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Set a timeout for the entire operation (180s — audit tools can be slow on large sites)
    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      resolve({
        success: false,
        error: 'Operation timed out after 180 seconds',
        executionTime: Date.now() - startTime
      });
    }, 180000);

    proc.stdout.on('data', (data) => {
      chunks.push(data.toString());
    });

    proc.stderr.on('data', (data) => {
      const str = data.toString();
      errorChunks.push(str);
      // Only log if it's not a benign message
      if (!str.includes('npm warn') && !str.includes('dotenv') && !str.includes('Script')) {
        console.log(`[MCP Bridge] stderr: ${str}`);
      }
    });

    proc.on('close', async (code) => {
      clearTimeout(timeout);
      const executionTime = Date.now() - startTime;
      const output = chunks.join('');

      console.log(`[MCP Bridge] Execution time: ${executionTime}ms`);
      console.log(`[MCP Bridge] Exit code: ${code}`);
      console.log(`[MCP Bridge] Output length: ${output.length}`);

      if (code !== 0 && output.length === 0) {
        resolve({
          success: false,
          error: `Claude Code exited with code ${code}. stderr: ${errorChunks.join('')}`,
          executionTime
        });
        return;
      }

      // Try to parse JSON from output
      try {
        let jsonStr = output;

        // Try to extract JSON from code blocks
        const jsonMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1].trim();
        } else {
          // Try to find raw JSON (array or object)
          const rawJsonMatch = output.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
          if (rawJsonMatch) {
            jsonStr = rawJsonMatch[1];
          }
        }

        const data = JSON.parse(jsonStr);

        // Save report to file
        const reportContent = JSON.stringify({
          tool: request.tool,
          params: request.params,
          timestamp: new Date().toISOString(),
          executionTime,
          data
        }, null, 2);
        await fs.writeFile(reportPath, reportContent);

        const reportFilename = path.basename(reportPath);

        // Track report in database
        if (userId) {
          await trackReport(userId, reportFilename, request.tool, Buffer.byteLength(reportContent));
        }

        // Cache the result
        try {
          await setCachedResult(cacheKey, request.tool, request.params, data, reportFilename);
        } catch (cacheErr) {
          console.log(`[MCP Bridge] Cache store failed:`, cacheErr);
        }

        // Save file snapshot for persistent cross-session reuse
        try {
          await saveSnapshot(request.tool, request.params, data);
        } catch { /* non-critical */ }

        resolve({
          success: true,
          data,
          reportPath,
          reportFilename,
          executionTime
        });
      } catch (parseError) {
        // If JSON parsing fails, return raw output
        console.log(`[MCP Bridge] JSON parse failed, returning raw output`);

        // Save raw output to file anyway
        const rawContent = JSON.stringify({
          tool: request.tool,
          params: request.params,
          timestamp: new Date().toISOString(),
          executionTime,
          raw: output
        }, null, 2);
        await fs.writeFile(reportPath, rawContent);

        const rawFilename = path.basename(reportPath);

        // Track report in database
        if (userId) {
          await trackReport(userId, rawFilename, request.tool, Buffer.byteLength(rawContent));
        }

        resolve({
          success: true,
          data: { raw: output },
          reportPath,
          reportFilename: rawFilename,
          executionTime
        });
      }
    });

    proc.on('error', (error) => {
      clearTimeout(timeout);
      console.log(`[MCP Bridge] Spawn error: ${error.message}`);
      resolve({
        success: false,
        error: `Failed to spawn Claude Code: ${error.message}`,
        executionTime: Date.now() - startTime
      });
    });
  });
}

// List available MCP tools
export function getAvailableMCPTools() {
  return [
    // Ahrefs Tools
    {
      name: 'ahrefs_domain_rating',
      description: 'Get domain rating, Ahrefs rank, and backlink metrics',
      params: { target: 'required - domain or URL' }
    },
    {
      name: 'ahrefs_organic_keywords',
      description: 'Get organic keywords the domain ranks for',
      params: { target: 'required', country: 'optional (default: sk)', limit: 'optional (default: 20)' }
    },
    {
      name: 'ahrefs_backlinks',
      description: 'Get backlinks pointing to the domain',
      params: { target: 'required', limit: 'optional (default: 20)' }
    },
    {
      name: 'ahrefs_top_pages',
      description: 'Get top pages by organic traffic',
      params: { target: 'required', limit: 'optional (default: 20)' }
    },
    {
      name: 'ahrefs_competitors',
      description: 'Find organic search competitors',
      params: { target: 'required', country: 'optional (default: sk)', limit: 'optional (default: 10)' }
    },
    {
      name: 'ahrefs_keyword_overview',
      description: 'Get keyword metrics (volume, difficulty, CPC)',
      params: { keyword: 'required', country: 'optional (default: sk)' }
    },
    {
      name: 'ahrefs_serp_overview',
      description: 'Get SERP results for a keyword',
      params: { keyword: 'required', country: 'optional (default: sk)' }
    },
  ];
}
