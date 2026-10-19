/**
 * Custom Agents Service — Sprint G (2026-05-22)
 *
 * Manages two DB tables:
 *   custom_agents    — team-shared agents created by users
 *   agent_extensions — per-specialist overrides (extra prompt + keywords)
 *
 * In-memory cache keeps routing fast (no DB hit per request).
 * Cache is invalidated + reloaded on every CRUD operation.
 */

import { query, queryOne } from '../db/connection.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CustomAgentRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  system_prompt: string;
  model: 'haiku' | 'sonnet' | 'sonnet-high';
  tools: string[];
  keywords: string[];
  color: string;
  icon: string;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentExtensionRow {
  id: string;
  agent_id: string;
  custom_description: string | null;
  extra_system_prompt: string | null;
  extra_keywords: string[];
  updated_by: string | null;
  updated_at: string;
}

export interface CreateCustomAgentInput {
  slug: string;
  name: string;
  description?: string;
  system_prompt: string;
  model?: 'haiku' | 'sonnet' | 'sonnet-high';
  tools?: string[];
  keywords?: string[];
  color?: string;
  icon?: string;
}

export interface UpdateCustomAgentInput {
  name?: string;
  description?: string;
  system_prompt?: string;
  model?: 'haiku' | 'sonnet' | 'sonnet-high';
  tools?: string[];
  keywords?: string[];
  color?: string;
  icon?: string;
  is_active?: boolean;
}

export interface UpsertExtensionInput {
  custom_description?: string;
  extra_system_prompt?: string;
  extra_keywords?: string[];
}

// ─── In-memory cache ──────────────────────────────────────────────────────────

/** slug → row */
const _customCache = new Map<string, CustomAgentRow>();

/** agentId → row */
const _extensionCache = new Map<string, AgentExtensionRow>();

let _initialized = false;

export async function loadCustomAgentsIntoCache(): Promise<void> {
  try {
    const agents = await query<CustomAgentRow>(
      `SELECT * FROM custom_agents WHERE is_active = TRUE ORDER BY created_at ASC`
    );
    _customCache.clear();
    for (const a of agents) _customCache.set(a.slug, a);

    const extensions = await query<AgentExtensionRow>(
      `SELECT * FROM agent_extensions`
    );
    _extensionCache.clear();
    for (const e of extensions) _extensionCache.set(e.agent_id, e);

    _initialized = true;
  } catch (err) {
    // Non-fatal: table may not exist yet (before migration runs)
    console.warn('[custom-agents] cache load skipped (migration pending?):', (err as Error).message);
    _initialized = true; // mark so we don't loop
  }
}

/** Reload cache after any CRUD mutation */
async function _invalidate(): Promise<void> {
  await loadCustomAgentsIntoCache();
  // Bust brain-router keyword index so new keywords take effect immediately
  const { invalidateRouterIndex } = await import('./brain-router.js');
  invalidateRouterIndex();
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export function getCustomAgents(): CustomAgentRow[] {
  return Array.from(_customCache.values());
}

export function getCustomAgent(slug: string): CustomAgentRow | undefined {
  return _customCache.get(slug);
}

export function getAgentExtension(agentId: string): AgentExtensionRow | undefined {
  return _extensionCache.get(agentId);
}

export function isInitialized(): boolean {
  return _initialized;
}

// ─── CRUD — custom agents ─────────────────────────────────────────────────────

export async function createCustomAgent(
  input: CreateCustomAgentInput,
  userId: string
): Promise<CustomAgentRow> {
  // Validate slug: lowercase, alphanumeric + hyphens, no spaces
  if (!/^[a-z0-9-]+$/.test(input.slug)) {
    throw new Error('Slug must be lowercase alphanumeric with hyphens only (e.g. "hr-writer")');
  }

  const row = await queryOne<CustomAgentRow>(
    `INSERT INTO custom_agents
       (slug, name, description, system_prompt, model, tools, keywords, color, icon, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      input.slug,
      input.name,
      input.description ?? '',
      input.system_prompt,
      input.model ?? 'sonnet',
      input.tools ?? [],
      input.keywords ?? [],
      input.color ?? '#6B7280',
      input.icon ?? '🤖',
      userId,
    ]
  );
  if (!row) throw new Error('Insert returned no row');
  await _invalidate();
  return row;
}

export async function updateCustomAgent(
  slug: string,
  input: UpdateCustomAgentInput,
): Promise<CustomAgentRow> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (input.name !== undefined)         { fields.push(`name = $${i++}`);          values.push(input.name); }
  if (input.description !== undefined)  { fields.push(`description = $${i++}`);   values.push(input.description); }
  if (input.system_prompt !== undefined){ fields.push(`system_prompt = $${i++}`); values.push(input.system_prompt); }
  if (input.model !== undefined)        { fields.push(`model = $${i++}`);          values.push(input.model); }
  if (input.tools !== undefined)        { fields.push(`tools = $${i++}`);          values.push(input.tools); }
  if (input.keywords !== undefined)     { fields.push(`keywords = $${i++}`);       values.push(input.keywords); }
  if (input.color !== undefined)        { fields.push(`color = $${i++}`);          values.push(input.color); }
  if (input.icon !== undefined)         { fields.push(`icon = $${i++}`);           values.push(input.icon); }
  if (input.is_active !== undefined)    { fields.push(`is_active = $${i++}`);      values.push(input.is_active); }

  if (fields.length === 0) throw new Error('No fields to update');
  fields.push(`updated_at = NOW()`);
  values.push(slug);

  const row = await queryOne<CustomAgentRow>(
    `UPDATE custom_agents SET ${fields.join(', ')} WHERE slug = $${i} AND is_active = TRUE RETURNING *`,
    values
  );
  if (!row) throw new Error(`Agent "${slug}" not found`);
  await _invalidate();
  return row;
}

export async function deleteCustomAgent(slug: string): Promise<void> {
  await query(
    `UPDATE custom_agents SET is_active = FALSE, updated_at = NOW() WHERE slug = $1`,
    [slug]
  );
  await _invalidate();
}

// ─── CRUD — agent extensions (specialist overrides) ───────────────────────────

export async function upsertAgentExtension(
  agentId: string,
  input: UpsertExtensionInput,
  userId: string
): Promise<AgentExtensionRow> {
  const row = await queryOne<AgentExtensionRow>(
    `INSERT INTO agent_extensions (agent_id, custom_description, extra_system_prompt, extra_keywords, updated_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (agent_id) DO UPDATE
       SET custom_description   = EXCLUDED.custom_description,
           extra_system_prompt  = EXCLUDED.extra_system_prompt,
           extra_keywords       = EXCLUDED.extra_keywords,
           updated_by           = EXCLUDED.updated_by,
           updated_at           = NOW()
     RETURNING *`,
    [
      agentId,
      input.custom_description ?? null,
      input.extra_system_prompt ?? null,
      input.extra_keywords ?? [],
      userId,
    ]
  );
  if (!row) throw new Error('Upsert returned no row');
  await _invalidate();
  return row;
}

export async function deleteAgentExtension(agentId: string): Promise<void> {
  await query(`DELETE FROM agent_extensions WHERE agent_id = $1`, [agentId]);
  await _invalidate();
}
