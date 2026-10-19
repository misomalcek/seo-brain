// Ahrefs Export Utilities
// URL generator for manual exports + UTF-16 CSV parser

import { readFile } from 'fs/promises';

/**
 * Generate Ahrefs export URL for manual CSV download
 * @param section - Ahrefs section (organic_keywords, referring_domains, etc.)
 * @param target - Domain or URL to analyze
 * @param options - Additional parameters (mode, country, competitors)
 * @returns Full Ahrefs export URL
 */
export function generateAhrefsUrl(
  section: string,
  target: string,
  options: {
    mode?: 'subdomains' | 'exact' | 'prefix';
    country?: string;
    competitors?: string[];
  } = {}
): string {
  const base = 'https://app.ahrefs.com';
  const mode = options.mode || 'subdomains';
  const params = new URLSearchParams();
  params.set('target', target);
  params.set('mode', mode);
  if (options.country) params.set('country', options.country);

  const sections: Record<string, string> = {
    organic_keywords: '/site-explorer/organic-keywords',
    referring_domains: '/site-explorer/refdomains',
    anchors: '/site-explorer/anchors',
    internal_anchors: '/site-explorer/internal-anchors',
    backlinks: '/site-explorer/backlinks',
    content_gap: '/content-gap',
    referring_ips: '/site-explorer/refips',
    top_pages: '/site-explorer/top-pages',
    competitors: '/site-explorer/organic-competitors',
    broken_backlinks: '/site-explorer/broken-backlinks',
  };

  let url = `${base}${sections[section] || '/site-explorer/overview'}`;

  // Content gap requires different param structure
  if (section === 'content_gap' && options.competitors) {
    params.delete('mode');
    options.competitors.forEach((c, i) => params.set(`competitor${i}`, c));
  }

  return `${url}?${params.toString()}`;
}

/**
 * Parse Ahrefs CSV export file (UTF-16 LE encoded, tab-separated)
 * @param filePath - Path to CSV file
 * @returns Parsed data with headers and rows
 */
export async function parseAhrefsExport(filePath: string): Promise<{
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
  encoding: string;
}> {
  const buffer = await readFile(filePath);

  // Ahrefs exports are UTF-16 LE encoded
  let content = buffer.toString('utf16le');

  // Remove BOM if present
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.substring(1);
  }

  // Split into lines and filter empty
  const lines = content.split(/\r?\n/).filter(l => l.trim());

  if (lines.length === 0) {
    throw new Error('Empty CSV file');
  }

  // Parse header (tab-separated, may have quotes)
  const headers = lines[0]
    .split('\t')
    .map(h => h.trim().replace(/^"|"$/g, ''));

  // Parse data rows
  const rows = lines.slice(1).map(line => {
    const values = line.split('\t').map(v => v.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(
      headers.map((h, i) => [h, values[i] || ''])
    );
  });

  return {
    headers,
    rows,
    rowCount: rows.length,
    encoding: 'utf16le',
  };
}

/**
 * Detect Ahrefs export type from headers
 * @param headers - CSV headers
 * @returns Export type or 'unknown'
 */
export function detectAhrefsExportType(headers: string[]): string {
  const headerSet = new Set(headers.map(h => h.toLowerCase()));

  if (headerSet.has('keyword') && headerSet.has('position') && headerSet.has('volume')) {
    if (headers.length > 25) return 'keyword_list_overview'; // Has trend data
    return 'organic_keywords';
  }

  if (headerSet.has('domain') && headerSet.has('dr') && headerSet.has('dofollow ref. domains')) {
    return 'referring_domains';
  }

  if (headerSet.has('anchor') && headerSet.has('ref. domains')) {
    if (headerSet.has('linked pages')) return 'internal_anchors';
    return 'external_anchors';
  }

  if (headerSet.has('subnet') && headerSet.has('ips in subnet')) {
    return 'referring_ips';
  }

  // Content gap has many position columns
  if (headers.filter(h => h.toLowerCase().includes('position')).length > 5) {
    return 'content_gap';
  }

  return 'unknown';
}

/**
 * Generate export suggestion message for agents
 * @param exportType - Type of export needed
 * @param target - Domain to analyze
 * @param options - Additional options (competitors, etc.)
 * @returns Formatted suggestion message in Slovak
 */
export function generateExportSuggestion(
  exportType: string,
  target: string,
  options: { competitors?: string[]; estimatedRows?: number; estimatedUnits?: number } = {}
): string {
  const url = generateAhrefsUrl(exportType, target, {
    mode: 'subdomains',
    country: 'sk',
    competitors: options.competitors,
  });

  const exportNames: Record<string, string> = {
    organic_keywords: 'Organic Keywords',
    referring_domains: 'Referring Domains',
    anchors: 'Anchor Text (External)',
    internal_anchors: 'Anchor Text (Internal)',
    backlinks: 'All Backlinks',
    content_gap: 'Content Gap',
    referring_ips: 'Referring IPs',
  };

  const name = exportNames[exportType] || exportType;
  const rowInfo = options.estimatedRows ? ` (~${options.estimatedRows}+ riadkov)` : '';
  const unitInfo = options.estimatedUnits ? ` spotrebuje ~${options.estimatedUnits} API units, zatiaľ čo` : '';

  return `## Odporúčanie: Manuálny export z Ahrefs

Pre túto analýzu${unitInfo} odporúčam manuálny export${rowInfo}, ktorý spotrebuje **0 API units**:

🔗 **[${name} export pre ${target}](${url})**

**Postup:**
1. Kliknite na odkaz vyššie (otvorí Ahrefs Site Explorer)
2. Kliknite "Export" → CSV (UTF-16)
3. Nahrajte exportovaný súbor sem do chatu

Exportovaný súbor bude obsahovať **kompletné dáta** (nie obmedzené API limitmi) a je zadarmo.`;
}
