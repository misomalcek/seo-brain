import { brainPath } from '../paths';
// ============================================================
// file-reader.ts — read_user_file tool backend
// Lets Brain read its own exports (CSV primarily, also JSON/MD/TXT/XLSX)
// with filter, sort, limit, column selection.
//
// Security: ONLY accesses files registered in user_files table,
// scoped to the invoking user. Never accepts raw filesystem paths
// from AI. Storage path is always read from DB, not AI input.
// ============================================================

import * as fs from 'fs/promises';
import * as path from 'path';
import { queryOne } from '../db/connection';

// ---------- Types ----------

export interface ReadUserFileParams {
  filename: string;              // matches user_files.original_name OR .id (UUID)
  limit?: number;                // default 500, max 5000
  offset?: number;               // default 0
  columns?: string[];            // filter output columns (CSV/XLSX only)
  filter?: string;               // simple expression, see parseFilter
  sort?: { column: string; direction?: 'asc' | 'desc' };
  userId: string;                // injected by executor, never from AI
}

export interface ReadUserFileResult {
  filename: string;
  format: 'csv' | 'json' | 'md' | 'txt' | 'html' | 'xlsx' | 'binary';
  total_rows: number;            // total BEFORE filter/limit
  matched_rows: number;          // after filter, before limit
  returned_rows: number;         // what's in data
  columns?: string[];            // for tabular formats
  data: any[] | string;          // rows for tabular, raw text for text formats
  applied_params: Record<string, any>;
  notes?: string[];              // warnings, truncation notes
}

// ---------- Simple CSV parser (handles quoted fields with commas) ----------

export function simpleCsvParse(text: string): { columns: string[]; rows: Record<string, string | number>[] } {
  const lines = text.split(/\r?\n/).filter(line => line.length > 0);
  if (lines.length === 0) return { columns: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += c;
      }
    }
    fields.push(current);
    return fields;
  };

  const columns = parseLine(lines[0]).map(c => c.trim());
  const rows = lines.slice(1).map(line => {
    const values = parseLine(line);
    const row: Record<string, string | number> = {};
    for (let i = 0; i < columns.length; i++) {
      const raw = (values[i] ?? '').trim();
      // Coerce numeric-looking strings to numbers
      const asNum = raw !== '' && !isNaN(Number(raw)) ? Number(raw) : raw;
      row[columns[i]] = asNum;
    }
    return row;
  });

  return { columns, rows };
}

// ---------- Filter expression parser ----------
// Grammar (simple left-to-right, no precedence):
//   expr    := clause (('AND'|'OR') clause)*
//   clause  := column OP value
//   OP      := '=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'notContains' | 'startsWith' | 'endsWith'
//   value   := number | "string" | 'string' | bareword

type FilterClause = {
  column: string;
  op: string;
  value: string | number;
};
type FilterCondition = {
  clauses: FilterClause[];
  connectors: ('AND' | 'OR')[];
};

export function parseFilter(expr: string): FilterCondition {
  const tokens = tokenizeFilter(expr);
  const clauses: FilterClause[] = [];
  const connectors: ('AND' | 'OR')[] = [];

  let i = 0;
  while (i < tokens.length) {
    // Parse clause: column OP value
    if (i + 2 >= tokens.length) throw new Error(`Incomplete filter clause at token ${i}: ${tokens.slice(i).join(' ')}`);
    const column = tokens[i];
    const op = tokens[i + 1];
    const valueToken = tokens[i + 2];
    const validOps = ['=', '!=', '>', '<', '>=', '<=', 'contains', 'notContains', 'startsWith', 'endsWith'];
    if (!validOps.includes(op)) throw new Error(`Unknown operator: ${op}`);
    // Value coercion: quoted or bare
    let value: string | number;
    if ((valueToken.startsWith('"') && valueToken.endsWith('"')) || (valueToken.startsWith("'") && valueToken.endsWith("'"))) {
      value = valueToken.slice(1, -1);
    } else if (!isNaN(Number(valueToken))) {
      value = Number(valueToken);
    } else {
      value = valueToken;
    }
    clauses.push({ column, op, value });
    i += 3;
    if (i < tokens.length) {
      const conn = tokens[i].toUpperCase();
      if (conn !== 'AND' && conn !== 'OR') throw new Error(`Expected AND/OR between clauses, got: ${tokens[i]}`);
      connectors.push(conn as 'AND' | 'OR');
      i++;
    }
  }

  return { clauses, connectors };
}

function tokenizeFilter(expr: string): string[] {
  // Simple tokenizer: handles quoted strings (preserving inner spaces)
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      while (j < expr.length && expr[j] !== quote) j++;
      tokens.push(expr.slice(i, j + 1));
      i = j + 1;
    } else {
      // Read word or operator
      let j = i;
      while (j < expr.length && expr[j] !== ' ' && expr[j] !== '\t') j++;
      tokens.push(expr.slice(i, j));
      i = j;
    }
  }
  return tokens;
}

export function evaluateFilter(row: Record<string, any>, condition: FilterCondition): boolean {
  if (condition.clauses.length === 0) return true;
  let result = evaluateClause(row, condition.clauses[0]);
  for (let i = 0; i < condition.connectors.length; i++) {
    const next = evaluateClause(row, condition.clauses[i + 1]);
    if (condition.connectors[i] === 'AND') result = result && next;
    else result = result || next;
  }
  return result;
}

function evaluateClause(row: Record<string, any>, clause: FilterClause): boolean {
  const cellValue = row[clause.column];
  if (cellValue === undefined) return false;
  const v = clause.value;
  switch (clause.op) {
    case '=':       return cellValue == v; // loose equality for number/string interop
    case '!=':      return cellValue != v;
    case '>':       return Number(cellValue) > Number(v);
    case '<':       return Number(cellValue) < Number(v);
    case '>=':      return Number(cellValue) >= Number(v);
    case '<=':      return Number(cellValue) <= Number(v);
    case 'contains':    return String(cellValue).toLowerCase().includes(String(v).toLowerCase());
    case 'notContains': return !String(cellValue).toLowerCase().includes(String(v).toLowerCase());
    case 'startsWith':  return String(cellValue).toLowerCase().startsWith(String(v).toLowerCase());
    case 'endsWith':    return String(cellValue).toLowerCase().endsWith(String(v).toLowerCase());
    default: return false;
  }
}

// ---------- Main: readUserFile ----------

const ALLOWED_ROOT = brainPath('uploads');

async function resolveFileRecord(filename: string, userId: string): Promise<{
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
} | null> {
  // Allow lookup by UUID or by original_name (scoped to user)
  // Try UUID first (if filename looks like one)
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(filename)) {
    const row = await queryOne<any>(
      `SELECT storage_path, original_name, mime_type, size_bytes FROM user_files
       WHERE id = $1 AND (user_id = $2 OR is_shared = TRUE)`,
      [filename, userId]
    );
    if (row) return row;
  }

  // Try by original_name or filename, most recent match
  const row = await queryOne<any>(
    `SELECT storage_path, original_name, mime_type, size_bytes FROM user_files
     WHERE (original_name = $1 OR filename = $1) AND (user_id = $2 OR is_shared = TRUE)
     ORDER BY created_at DESC
     LIMIT 1`,
    [filename, userId]
  );
  return row;
}

function detectFormat(filename: string, mimeType: string): ReadUserFileResult['format'] {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.csv' || mimeType.includes('csv')) return 'csv';
  if (ext === '.json' || mimeType.includes('json')) return 'json';
  if (ext === '.xlsx' || mimeType.includes('spreadsheetml')) return 'xlsx';
  if (ext === '.md') return 'md';
  if (ext === '.html') return 'html';
  if (ext === '.txt') return 'txt';
  return 'binary';
}

export async function readUserFile(params: ReadUserFileParams): Promise<ReadUserFileResult> {
  const limit = Math.min(params.limit ?? 500, 5000);
  const offset = params.offset ?? 0;

  // 1. Resolve file from DB (security: scoped to user, never raw path from AI)
  const record = await resolveFileRecord(params.filename, params.userId);
  if (!record) {
    throw new Error(`File not found or not accessible: ${params.filename}`);
  }

  // 2. Security: ensure resolved path is inside allowed root
  const resolvedPath = path.resolve(record.storage_path);
  if (!resolvedPath.startsWith(ALLOWED_ROOT + path.sep) && resolvedPath !== ALLOWED_ROOT) {
    throw new Error(`Security: file storage path outside allowed root`);
  }

  const format = detectFormat(record.original_name, record.mime_type);
  const notes: string[] = [];

  // 3. Handle by format
  if (format === 'md' || format === 'txt' || format === 'html') {
    const text = await fs.readFile(resolvedPath, 'utf8');
    const truncated = text.length > 100_000;
    if (truncated) notes.push(`Text content truncated to 100KB (original ${text.length} chars)`);
    return {
      filename: record.original_name,
      format,
      total_rows: 1,
      matched_rows: 1,
      returned_rows: 1,
      data: truncated ? text.slice(0, 100_000) : text,
      applied_params: {},
      notes,
    };
  }

  if (format === 'json') {
    const text = await fs.readFile(resolvedPath, 'utf8');
    let parsed: any;
    try { parsed = JSON.parse(text); }
    catch { throw new Error(`JSON parse failed in ${record.original_name}`); }

    // If array, apply limit/offset; if object, return as-is
    if (Array.isArray(parsed)) {
      const sliced = parsed.slice(offset, offset + limit);
      return {
        filename: record.original_name,
        format,
        total_rows: parsed.length,
        matched_rows: parsed.length,
        returned_rows: sliced.length,
        data: sliced,
        applied_params: { limit, offset },
        notes,
      };
    } else {
      return {
        filename: record.original_name,
        format,
        total_rows: 1,
        matched_rows: 1,
        returned_rows: 1,
        data: [parsed],
        applied_params: {},
        notes,
      };
    }
  }

  if (format === 'csv') {
    const text = await fs.readFile(resolvedPath, 'utf8');
    const { columns, rows } = simpleCsvParse(text);
    let filtered = rows;

    // Apply filter
    if (params.filter) {
      try {
        const cond = parseFilter(params.filter);
        filtered = rows.filter(r => evaluateFilter(r, cond));
      } catch (err) {
        notes.push(`Filter parse error, returning unfiltered: ${(err as Error).message}`);
      }
    }

    // Apply sort
    if (params.sort) {
      const col = params.sort.column;
      const dir = params.sort.direction === 'desc' ? -1 : 1;
      filtered = [...filtered].sort((a, b) => {
        const av = a[col], bv = b[col];
        if (av === bv) return 0;
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    }

    const matched_rows = filtered.length;

    // Apply limit/offset
    let sliced = filtered.slice(offset, offset + limit);

    // Apply column filter (if any)
    let outputColumns = columns;
    if (params.columns && params.columns.length > 0) {
      const requestedCols = params.columns.filter(c => columns.includes(c));
      if (requestedCols.length === 0) {
        notes.push(`None of requested columns found. Available: ${columns.join(', ')}`);
      } else {
        sliced = sliced.map(row => {
          const r: Record<string, any> = {};
          for (const c of requestedCols) r[c] = row[c];
          return r;
        });
        outputColumns = requestedCols;
      }
    }

    return {
      filename: record.original_name,
      format,
      total_rows: rows.length,
      matched_rows,
      returned_rows: sliced.length,
      columns: outputColumns,
      data: sliced,
      applied_params: { limit, offset, filter: params.filter, sort: params.sort, columns: params.columns },
      notes,
    };
  }

  if (format === 'xlsx') {
    // XLSX support via exceljs (already dep)
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.default.Workbook();
    await workbook.xlsx.readFile(resolvedPath);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error(`XLSX has no sheets`);

    const columns: string[] = [];
    const rows: Record<string, any>[] = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) {
        row.eachCell(cell => columns.push(String(cell.value ?? '')));
      } else {
        const r: Record<string, any> = {};
        row.eachCell((cell, colNum) => {
          r[columns[colNum - 1]] = cell.value;
        });
        rows.push(r);
      }
    });

    // Same filter/sort/limit logic as CSV
    let filtered = rows;
    if (params.filter) {
      try {
        const cond = parseFilter(params.filter);
        filtered = rows.filter(r => evaluateFilter(r, cond));
      } catch (err) {
        notes.push(`Filter parse error: ${(err as Error).message}`);
      }
    }
    if (params.sort) {
      const col = params.sort.column;
      const dir = params.sort.direction === 'desc' ? -1 : 1;
      filtered = [...filtered].sort((a, b) => {
        const av = a[col], bv = b[col];
        if (av === bv) return 0;
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    }

    const sliced = filtered.slice(offset, offset + limit);
    return {
      filename: record.original_name,
      format,
      total_rows: rows.length,
      matched_rows: filtered.length,
      returned_rows: sliced.length,
      columns,
      data: sliced,
      applied_params: { limit, offset, filter: params.filter, sort: params.sort, sheet: sheet.name },
      notes: [...notes, `Read from first sheet "${sheet.name}" of ${workbook.worksheets.length} sheet(s)`],
    };
  }

  // Binary / unsupported
  return {
    filename: record.original_name,
    format: 'binary',
    total_rows: 0,
    matched_rows: 0,
    returned_rows: 0,
    data: [],
    applied_params: {},
    notes: [`Binary file (${record.mime_type}), content not readable as text. Download instead.`],
  };
}
