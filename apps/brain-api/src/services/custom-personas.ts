/**
 * Custom Personas Service (2026-06-10)
 *
 * Manages the `custom_personas` DB table.
 * DB rows either:
 *   - Override a built-in persona (same slug) — patched fields win, rest from built-in
 *   - Introduce a new custom persona (slug not in PERSONAS)
 *   - Hide a built-in (same slug, is_active = FALSE — "soft delete" of built-in)
 *
 * In-memory cache keeps lookups synchronous so getPersona() stays sync.
 * Cache is invalidated + reloaded on every CRUD mutation.
 */

import { query, queryOne } from '../db/connection.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CustomPersonaRow {
  id: string;
  slug: string;
  name: string;
  name_localized: string;
  description: string;
  icon: string;
  color: string;
  system_prompt: string;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomPersonaInput {
  slug: string;
  name: string;
  name_localized?: string;
  description?: string;
  icon?: string;
  color?: string;
  system_prompt: string;
}

export interface UpdateCustomPersonaInput {
  name?: string;
  name_localized?: string;
  description?: string;
  icon?: string;
  color?: string;
  system_prompt?: string;
  is_active?: boolean;
}

// ─── In-memory cache ──────────────────────────────────────────────────────────

/** slug → row (includes inactive rows so the merge layer can hide built-ins) */
const _cache = new Map<string, CustomPersonaRow>();

let _initialized = false;

export async function loadCustomPersonasIntoCache(): Promise<void> {
  try {
    // Load ALL rows (active + inactive) — merge layer uses is_active to decide visibility
    const rows = await query<CustomPersonaRow>(
      `SELECT * FROM custom_personas ORDER BY created_at ASC`
    );
    _cache.clear();
    for (const r of rows) _cache.set(r.slug, r);
    _initialized = true;
  } catch (err) {
    // Non-fatal: table may not exist yet (before migration 041 runs)
    console.warn('[custom-personas] cache load skipped (migration pending?):', (err as Error).message);
    _initialized = true; // mark so we don't loop
  }
}

/** Reload cache after any CRUD mutation */
async function _invalidate(): Promise<void> {
  await loadCustomPersonasIntoCache();
}

// ─── Reads (synchronous — read from cache) ───────────────────────────────────

export function getCustomPersonas(): CustomPersonaRow[] {
  return Array.from(_cache.values());
}

export function getCustomPersona(slug: string): CustomPersonaRow | undefined {
  return _cache.get(slug);
}

export function isInitialized(): boolean {
  return _initialized;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createCustomPersona(
  input: CreateCustomPersonaInput,
  userId: string
): Promise<CustomPersonaRow> {
  // Validate slug: lowercase, alphanumeric + hyphens
  if (!/^[a-z0-9-]+$/.test(input.slug)) {
    throw new Error('Slug must be lowercase alphanumeric with hyphens only (e.g. "automation-engineer")');
  }

  const row = await queryOne<CustomPersonaRow>(
    `INSERT INTO custom_personas
       (slug, name, name_localized, description, icon, color, system_prompt, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      input.slug,
      input.name,
      input.name_localized ?? '',
      input.description ?? '',
      input.icon ?? '🎭',
      input.color ?? '#6B7280',
      input.system_prompt,
      userId,
    ]
  );
  if (!row) throw new Error('Insert returned no row');
  await _invalidate();
  return row;
}

export async function updateCustomPersona(
  slug: string,
  input: UpdateCustomPersonaInput,
): Promise<CustomPersonaRow> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (input.name !== undefined)           { fields.push(`name = $${i++}`);           values.push(input.name); }
  if (input.name_localized !== undefined) { fields.push(`name_localized = $${i++}`); values.push(input.name_localized); }
  if (input.description !== undefined)    { fields.push(`description = $${i++}`);    values.push(input.description); }
  if (input.icon !== undefined)           { fields.push(`icon = $${i++}`);            values.push(input.icon); }
  if (input.color !== undefined)          { fields.push(`color = $${i++}`);           values.push(input.color); }
  if (input.system_prompt !== undefined)  { fields.push(`system_prompt = $${i++}`);  values.push(input.system_prompt); }
  if (input.is_active !== undefined)      { fields.push(`is_active = $${i++}`);       values.push(input.is_active); }

  if (fields.length === 0) throw new Error('No fields to update');
  fields.push(`updated_at = NOW()`);
  values.push(slug);

  const row = await queryOne<CustomPersonaRow>(
    `UPDATE custom_personas SET ${fields.join(', ')} WHERE slug = $${i} RETURNING *`,
    values
  );
  if (!row) throw new Error(`Persona "${slug}" not found in custom_personas`);
  await _invalidate();
  return row;
}

/** Soft delete — sets is_active = FALSE. If slug matched a built-in, this hides the built-in. */
export async function deleteCustomPersona(slug: string): Promise<void> {
  await query(
    `UPDATE custom_personas SET is_active = FALSE, updated_at = NOW() WHERE slug = $1`,
    [slug]
  );
  await _invalidate();
}
