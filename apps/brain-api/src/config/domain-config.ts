/**
 * Domain Config Service — centralized domain management
 *
 * Single source of truth for all domain-related configuration.
 * Replaces 80+ hardcoded domain references across the codebase.
 *
 * Data comes from `sites` table (managed via Admin > System).
 */

import { query } from '../db/connection';

export interface DomainConfig {
  id: string;
  domain: string;
  name: string;
  description: string | null;
  gscProperty: string | null;
  sitemapUrl: string | null;
  ahrefsProjectId: string | null;
  isTracked: boolean;
  isPrimary: boolean;
  primaryLanguage: string;
}

// Cache: reload every 5 minutes
let cache: DomainConfig[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function loadDomains(): Promise<DomainConfig[]> {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL) return cache;

  const rows = await query<any>(
    `SELECT id, domain, name, description, gsc_property, sitemap_url,
            ahrefs_project_id, is_tracked, is_primary, primary_language
     FROM sites WHERE is_tracked = TRUE ORDER BY is_primary DESC, domain`
  );

  cache = rows.map(r => ({
    id: r.id,
    domain: r.domain,
    name: r.name,
    description: r.description,
    gscProperty: r.gsc_property,
    sitemapUrl: r.sitemap_url,
    ahrefsProjectId: r.ahrefs_project_id,
    isTracked: r.is_tracked,
    isPrimary: r.is_primary,
    primaryLanguage: r.primary_language || 'sk',
  }));
  cacheTime = now;
  return cache;
}

/** Get all tracked domains */
export async function getTrackedDomains(): Promise<DomainConfig[]> {
  return loadDomains();
}

/** Get domain names only (string array) */
export async function getDomainNames(): Promise<string[]> {
  const domains = await loadDomains();
  return domains.map(d => d.domain);
}

/** Get a specific domain config by domain name */
export async function getDomainByName(domain: string): Promise<DomainConfig | null> {
  const domains = await loadDomains();
  return domains.find(d => d.domain === domain) || null;
}

/** Get domain-to-GSC property mapping */
export async function getGSCPropertyMap(): Promise<Record<string, string>> {
  const domains = await loadDomains();
  const map: Record<string, string> = {};
  for (const d of domains) {
    if (d.gscProperty) map[d.gscProperty] = d.domain;
  }
  return map;
}

/** Get domain-to-Ahrefs project ID mapping */
export async function getAhrefsProjectMap(): Promise<Record<string, string>> {
  const domains = await loadDomains();
  const map: Record<string, string> = {};
  for (const d of domains) {
    if (d.ahrefsProjectId) map[d.domain] = d.ahrefsProjectId;
  }
  return map;
}

/** Get scrape configs (domain + sitemap URL pairs) */
export async function getScrapeConfigs(): Promise<Array<{ domain: string; sitemapUrl: string; primaryLanguage: string }>> {
  const domains = await loadDomains();
  return domains
    .filter(d => d.sitemapUrl)
    .map(d => ({ domain: d.domain, sitemapUrl: d.sitemapUrl!, primaryLanguage: d.primaryLanguage }));
}

/** Invalidate cache (call after admin updates sites) */
export function invalidateDomainCache(): void {
  cache = null;
  cacheTime = 0;
}
