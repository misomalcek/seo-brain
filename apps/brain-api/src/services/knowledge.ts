import * as fs from 'fs';
import * as path from 'path';
import { AVAILABLE_TOOLS } from '../tools/definitions';
import { agentRegistry } from '../agents/registry.js';
import { resolveAbsorbed } from '../agents/definitions.js';

const TEAM_BRAIN_ROOT = '/opt/team-brain';
const AGENTS_DIR = path.join(TEAM_BRAIN_ROOT, 'agents');
const SKILLS_DIR = path.join(TEAM_BRAIN_ROOT, 'agents'); // v1.3.1: skills merged into agents/
const FRAMEWORKS_DIR = path.join(TEAM_BRAIN_ROOT, 'templates');

export type AgentType = 'master' | 'sub-agent' | 'framework' | 'utility';

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  tools: string[];
  model: string;
  filePath: string;
  visibility: 'all' | 'admin';
  type: AgentType;
  parent?: string;
  color?: string;
}

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  filePath: string;
  visibility: 'all' | 'admin';
}

export interface KnowledgeCatalog {
  agents: AgentInfo[];
  skills: SkillInfo[];
  stats: {
    totalAgents: number;
    totalSkills: number;
  };
}

/**
 * Convert a slug to a human-readable title.
 * "seo-auditor" → "Seo Auditor", "article-creator" → "Article Creator"
 * Used as fallback when a .md file has no frontmatter name field.
 */
function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Parse YAML frontmatter from a markdown file.
 * Returns the frontmatter key-value pairs and the body content.
 */
function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const meta: Record<string, string> = {};
  let body = content;

  if (content.startsWith('---')) {
    const endIndex = content.indexOf('---', 3);
    if (endIndex !== -1) {
      const frontmatter = content.substring(3, endIndex).trim();
      body = content.substring(endIndex + 3).trim();

      for (const line of frontmatter.split('\n')) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim();
          let value = line.substring(colonIndex + 1).trim();
          // Strip surrounding quotes
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          meta[key] = value;
        }
      }
    }
  }

  return { meta, body };
}

/**
 * Extract first non-heading, non-empty paragraph as fallback description.
 */
function extractFirstParagraph(content: string): string {
  const { body } = parseFrontmatter(content);
  const lines = body.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.startsWith('>'));
  return lines[0]?.slice(0, 200) || '';
}

/**
 * Load all agent definitions from the agents directory.
 * Handles both root .md files and directory-based agents.
 */
export function loadAgents(userRole?: string): AgentInfo[] {
  if (!fs.existsSync(AGENTS_DIR)) return [];

  const entries = fs.readdirSync(AGENTS_DIR, { withFileTypes: true });
  const agents: AgentInfo[] = [];

  for (const entry of entries) {
    try {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        // Root-level .md agent
        const filePath = path.join(AGENTS_DIR, entry.name);
        const content = fs.readFileSync(filePath, 'utf8');
        const { meta } = parseFrontmatter(content);
        const visibility = (meta.visibility === 'admin' ? 'admin' : 'all') as 'all' | 'admin';
        const id = entry.name.replace('.md', '');

        agents.push({
          id,
          name: meta.name || slugToTitle(id),
          description: meta.description || extractFirstParagraph(content),
          tools: meta.tools ? meta.tools.replace(/^\[|\]$/g, '').split(',').map(t => t.trim()).filter(Boolean) : [],
          model: meta.model || 'sonnet',
          filePath,
          visibility,
          type: (meta.type as AgentType) || 'sub-agent',
          parent: meta.parent || resolveAbsorbed(id)?.id,
          color: meta.color || undefined,
        });
      } else if (entry.isDirectory()) {
        // Skip archived agents
        if (entry.name === 'archived') continue;
        // Directory-based agent(s)
        const dirPath = path.join(AGENTS_DIR, entry.name);
        const subFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
        if (subFiles.length === 0) continue;

        for (const subFile of subFiles) {
          const filePath = path.join(dirPath, subFile);
          const content = fs.readFileSync(filePath, 'utf8');
          const { meta } = parseFrontmatter(content);
          const visibility = (meta.visibility === 'admin' ? 'admin' : 'all') as 'all' | 'admin';

          const id = subFile === 'AGENT.md'
            ? entry.name
            : subFile.replace('.md', '');

          agents.push({
            id,
            name: meta.name || slugToTitle(id),
            description: meta.description || extractFirstParagraph(content),
            tools: meta.tools ? meta.tools.replace(/^\[|\]$/g, '').split(',').map(t => t.trim()).filter(Boolean) : [],
            model: meta.model || 'sonnet',
            filePath,
            visibility,
            type: (meta.type as AgentType) || 'sub-agent',
            parent: meta.parent || resolveAbsorbed(id)?.id,
            color: meta.color || undefined,
          });
        }
      }
    } catch (error) {
      console.error(`Failed to parse agent ${entry.name}:`, error);
    }
  }

  // Augment with registry: replace metadata for canonical specialist + brain-core agents.
  // This ensures AgentBrowser + API consumers get correct tools/color/type from definitions.ts.
  const registryInfoMap = new Map(agentRegistry.getAllAsAgentInfo().map(a => [a.id, a]));
  const augmented = agents.map(agent => {
    const reg = registryInfoMap.get(agent.id);
    if (!reg) return agent;
    // Merge: registry wins on tools, model, color, type; keep filePath from disk
    return {
      ...agent,
      tools: reg.tools,
      model: reg.model,
      color: reg.color || agent.color,
      type: (reg.type as AgentType) || agent.type,
    };
  });

  // Add registry agents not yet present as .md files (e.g. new specialists)
  for (const [id, regInfo] of registryInfoMap) {
    if (!augmented.find(a => a.id === id)) {
      augmented.push({
        id: regInfo.id,
        name: regInfo.name,
        description: regInfo.description,
        tools: regInfo.tools,
        model: regInfo.model,
        filePath: regInfo.filePath,
        visibility: regInfo.visibility,
        type: regInfo.type as AgentType,
        color: regInfo.color,
      });
    }
  }

  let result = augmented.sort((a, b) => a.name.localeCompare(b.name));

  // Filter by visibility if userRole is provided and not admin
  if (userRole && userRole !== 'admin') {
    result = result.filter(a => a.visibility === 'all');
  }

  return result;
}

// Validate agent tool references at startup (run once)
//
// Run S 2026-05-26 (qa-brain-33 + qa-brain-32): the validator used to only
// emit `console.warn` for unknown tools — health endpoint reported OK even
// when agents pointed at non-existent tools (Claude Code's "Read"/"Write"/
// "WebSearch"/"Grep"/"Glob"/"*" leaked in from sub-agent YAML frontmatter).
// We now track the issue list + expose a getter so /api/admin/health can
// surface a DEGRADED flag, and set env BRAIN_VALIDATE_STRICT=1 to throw on
// CI / strict deploys.
let _validated = false;
let _validationIssues: { agent: string; tool: string }[] = [];

export function validateAgentTools(): void {
  if (_validated) return;
  _validated = true;
  _validationIssues = [];

  const validToolNames = new Set(AVAILABLE_TOOLS.map(t => t.name));
  // Special tools that don't live in AVAILABLE_TOOLS but are always present.
  validToolNames.add('web_search');

  // Wildcards Brain considers legitimate (master-planner, brief, ...)
  const allowedWildcards = new Set(['*', 'ALL']);

  const agents = loadAgents();
  for (const agent of agents) {
    for (const tool of agent.tools) {
      if (allowedWildcards.has(tool)) continue;
      if (!validToolNames.has(tool)) {
        _validationIssues.push({ agent: agent.id, tool });
        console.warn(`[Agent Validation] Agent "${agent.id}" references unknown tool: "${tool}"`);
      }
    }
  }
  console.log(`[Agent Validation] Checked ${agents.length} agents, ${validToolNames.size} valid tools, ${_validationIssues.length} issues`);

  // Optional strict mode for CI / production deploys.
  if (_validationIssues.length > 0 && process.env.BRAIN_VALIDATE_STRICT === '1') {
    const sample = _validationIssues.slice(0, 5).map(i => `${i.agent}→${i.tool}`).join(', ');
    throw new Error(`Agent validation FAILED in strict mode: ${_validationIssues.length} unknown tool refs (${sample}${_validationIssues.length > 5 ? ', …' : ''})`);
  }
}

/** Read-only accessor used by /api/admin/health to flag a DEGRADED status. */
export function getAgentValidationIssues(): { agent: string; tool: string }[] {
  return _validationIssues.slice();
}

/**
 * Load all skills from the skills directory (recursive).
 */
export function loadSkills(userRole?: string): SkillInfo[] {
  if (!fs.existsSync(SKILLS_DIR)) return [];

  const skills: SkillInfo[] = [];
  scanSkillsDir(SKILLS_DIR, '', skills);
  let result = skills.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  // Filter by visibility if userRole is provided and not admin
  if (userRole && userRole !== 'admin') {
    result = result.filter(s => s.visibility === 'all');
  }

  return result;
}

function scanSkillsDir(dir: string, category: string, skills: SkillInfo[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Recurse into subdirectories with category tracking
      scanSkillsDir(fullPath, category ? `${category}/${entry.name}` : entry.name, skills);
    } else if (entry.name.endsWith('.md')) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const { meta } = parseFrontmatter(content);

        // Determine category from directory structure
        const skillCategory = category || 'general';

        // Skip index files
        if (entry.name === 'SKILL-INDEX.md') continue;

        const id = entry.name === 'SKILL.md'
          ? path.basename(dir)
          : entry.name.replace('.md', '');

        const visibility = (meta.visibility === 'admin' ? 'admin' : 'all') as 'all' | 'admin';

        skills.push({
          id,
          name: meta.name || id,
          description: meta.description || '',
          category: skillCategory,
          filePath: fullPath,
          visibility,
        });
      } catch (error) {
        console.error(`Failed to parse skill ${fullPath}:`, error);
      }
    }
  }
}

/**
 * Get full content of a specific agent by ID.
 */
export function getAgentContent(agentId: string): { agent: AgentInfo; content: string } | null {
  // Registry-first: canonical specialists + legacy absorbed IDs
  const reg = agentRegistry.resolveForChat(agentId);
  if (reg) {
    const { def, prompt, subAgentContext } = reg;
    const regInfo = agentRegistry.toAgentInfo(def);
    let content = prompt;
    if (subAgentContext) content += `\n\n---\n${subAgentContext}`;
    // Cap at 8000 chars (same guard as legacy path)
    const MAX = 8000;
    const truncated = content.length > MAX
      ? content.slice(0, MAX) + '\n\n[Agent instructions truncated]'
      : content;
    return {
      agent: {
        id: regInfo.id,
        name: regInfo.name,
        description: regInfo.description,
        tools: regInfo.tools,
        model: regInfo.model,
        filePath: regInfo.filePath,
        visibility: regInfo.visibility as 'all' | 'admin',
        type: regInfo.type as AgentType,
        color: regInfo.color,
      },
      content: truncated,
    };
  }

  // Try root-level .md first
  let filePath = path.join(AGENTS_DIR, `${agentId}.md`);
  if (!fs.existsSync(filePath)) {
    // Try directory-based: agents/{id}/AGENT.md
    filePath = path.join(AGENTS_DIR, agentId, 'AGENT.md');
    if (!fs.existsSync(filePath)) return null;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const { meta, body } = parseFrontmatter(content);

  // Size guard: truncate agent body to prevent token overflow (max ~2000 tokens)
  const MAX_AGENT_CHARS = 8000;
  const truncatedBody = body.length > MAX_AGENT_CHARS
    ? body.slice(0, MAX_AGENT_CHARS) + '\n\n[Agent instructions truncated — full version in agent file]'
    : body;

  return {
    agent: {
      id: agentId,
      name: meta.name || agentId,
      description: meta.description || extractFirstParagraph(content),
      tools: meta.tools ? meta.tools.replace(/^\[|\]$/g, '').split(',').map(t => t.trim()).filter(Boolean) : [],
      model: meta.model || 'sonnet',
      filePath,
      visibility: (meta.visibility === 'admin' ? 'admin' : 'all') as 'all' | 'admin',
      type: (meta.type as AgentType) || 'sub-agent',
      parent: meta.parent || undefined,
      color: meta.color || undefined,
    },
    content: truncatedBody,
  };
}

/**
 * Get full content of a specific skill by its file path (relative to skills dir).
 */
export function getSkillContent(skillPath: string): { skill: SkillInfo; content: string } | null {
  // Sanitize path to prevent directory traversal
  const sanitized = skillPath.replace(/\.\./g, '').replace(/^\/+/, '');
  const fullPath = path.join(SKILLS_DIR, sanitized);

  if (!fullPath.startsWith(SKILLS_DIR) || !fs.existsSync(fullPath)) return null;

  const content = fs.readFileSync(fullPath, 'utf8');
  const { meta, body } = parseFrontmatter(content);

  const id = path.basename(fullPath, '.md');
  const category = path.dirname(sanitized);

  return {
    skill: {
      id,
      name: meta.name || id,
      description: meta.description || '',
      category: category === '.' ? 'general' : category,
      filePath: fullPath,
      visibility: (meta.visibility === 'admin' ? 'admin' : 'all') as 'all' | 'admin',
    },
    content: body,
  };
}

// --- Frameworks ---

export interface FrameworkInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  filePath: string;
}

/**
 * Load all content frameworks from the frameworks directory.
 */
export function loadFrameworks(): FrameworkInfo[] {
  if (!fs.existsSync(FRAMEWORKS_DIR)) return [];

  const frameworks: FrameworkInfo[] = [];
  scanFrameworksDir(FRAMEWORKS_DIR, '', frameworks);
  return frameworks.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

function scanFrameworksDir(dir: string, category: string, frameworks: FrameworkInfo[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      scanFrameworksDir(fullPath, category ? `${category}/${entry.name}` : entry.name, frameworks);
    } else if (entry.name.endsWith('.md')) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const { meta } = parseFrontmatter(content);

        frameworks.push({
          id: entry.name.replace('.md', ''),
          name: meta.name || entry.name.replace('.md', ''),
          description: meta.description || '',
          category: category || 'general',
          filePath: fullPath,
        });
      } catch (error) {
        console.error(`Failed to parse framework ${fullPath}:`, error);
      }
    }
  }
}

/**
 * Get full content of a specific framework by path.
 */
export function getFrameworkContent(frameworkPath: string): { framework: FrameworkInfo; content: string } | null {
  const sanitized = frameworkPath.replace(/\.\./g, '').replace(/^\/+/, '');
  const fullPath = path.join(FRAMEWORKS_DIR, sanitized);

  if (!fullPath.startsWith(FRAMEWORKS_DIR) || !fs.existsSync(fullPath)) return null;

  const content = fs.readFileSync(fullPath, 'utf8');
  const { meta, body } = parseFrontmatter(content);

  const id = path.basename(fullPath, '.md');
  const category = path.dirname(sanitized);

  return {
    framework: {
      id,
      name: meta.name || id,
      description: meta.description || '',
      category: category === '.' ? 'general' : category,
      filePath: fullPath,
    },
    content: body,
  };
}

// detectAgent() removed (Sprint F cleanup 2026-05-22).
// Keyword routing now handled by brain-router.ts routeByKeyword() — registry-driven.
// @mention detection is in action-resolver.ts matchMention() tier.

/**
 * Detect if a message requires complex multi-step orchestration.
 * Used to auto-trigger Master Planner when no specific agent matches.
 * @deprecated Use brain-router.ts routeByComplexity() for new code (Sprint D).
 */
export function detectComplexity(message: string): {
  isComplex: boolean;
  reasons: string[];
  estimatedTools: number;
} {
  const msg = message.toLowerCase();
  const reasons: string[] = [];
  let toolCount = 0;

  // Multi-domain (2+ domains mentioned)
  const domains = ['example-org', 'example-dev', 'example-qa']
    .filter(d => msg.includes(d));
  if (domains.length >= 2) {
    reasons.push('multi-domain');
    toolCount += domains.length * 2;
  }

  // Full audit / complete report patterns (expanded to catch "komplexný")
  if (/komplet.*report|komplet.*audit|komplex.*report|komplex.*audit|full.*audit|pln.*audit|hlbkov.*anal|celkov.*anal|komplet.*anal/i.test(msg)) {
    reasons.push('full-audit');
    toolCount += 4;
  }

  // Cross-source (GSC + Ahrefs)
  if (/gsc.*ahrefs|ahrefs.*gsc|cross.?check|porovnaj.*zdroj/i.test(msg)) {
    reasons.push('cross-source');
    toolCount += 3;
  }

  // Multiple file outputs (3+ files, XLSX+DOCX combo, numbered deliverables)
  const filePatterns = [
    /\d+.*s[úu]bor|\d+.*file/i,  // "3 súbory", "5 files"
    /xlsx.*docx|docx.*xlsx|xlsx.*csv|csv.*xlsx/i,  // multiple formats
    /exportuj.*a.*vytvor|vytvor.*a.*exportuj|save.*and.*generate/i,  // multi-action
  ];
  if (filePatterns.some(p => p.test(msg))) {
    reasons.push('multi-file-output');
    toolCount += 3;
  }

  // Structured multi-step (numbered lists 1. 2. 3. or lettered a) b) c))
  const hasNumberedSteps = /^[\s]*[1-9]\.|^[\s]*[a-z]\)/m.test(message);
  if (hasNumberedSteps) {
    const stepCount = (message.match(/^[\s]*[1-9]\.|^[\s]*[a-z]\)/gm) || []).length;
    if (stepCount >= 3) {
      reasons.push('structured-multi-step');
      toolCount += stepCount;
    }
  }

  // Content planning multi-step
  if (/content.*plan.*a.*vykon|plan.*obsah.*a.*brief|redak.*plan.*komplet/i.test(msg)) {
    reasons.push('content-planning');
    toolCount += 6;
  }

  // Explicit multi-step language
  if (/viac.*krok|multi.?step|krok.*za.*krok|postupn|orchestr/i.test(msg)) {
    reasons.push('multi-step');
    toolCount += 3;
  }

  // Analyze + Generate combo (research + creation)
  if (/analyz.*a.*vygeneru|analyz.*a.*vytvor|analyzuj.*vygeneru|analyzuj.*vytvor/i.test(msg)) {
    reasons.push('analyze-and-generate');
    toolCount += 2;
  }

  return {
    isComplex: reasons.length >= 2 || toolCount >= 4,  // Lowered from 5 to 4
    reasons,
    estimatedTools: toolCount,
  };
}

// --- Weaver: Model Routing ---

export interface WeaverDecision {
  model: 'haiku' | 'sonnet' | 'sonnet-high';
  temperature: number;
  reason: string;
}

/**
 * Weaver — intelligent model routing based on message complexity.
 * Returns optimal model for the query. User manual override takes precedence.
 *
 * Routing rules (conservative — Haiku only for truly simple):
 * - Haiku (cheap, fast): greetings, thanks, date/time, yes/no, <15 words, NO tool keywords
 * - Sonnet (default): everything else
 * - Sonnet-high (temp 0.8): complex multi-step tasks, deliberation
 */
export function weave(message: string, hasAgent: boolean, isMaster: boolean = false): WeaverDecision {
  const msg = message.toLowerCase().trim();
  const wordCount = msg.split(/\s+/).length;

  // Haiku tier: truly simple, no-tool queries
  const GREETING_PATTERNS = /^(ahoj|cau|hej|hi|hello|dobr[yý]|zdravim|hey|ciao|servus|nazdar)\b/;
  const SIMPLE_PATTERNS = /^(dakujem|dík|ok|dobre|jasne|super|thanks|thx|ano|nie|yes|no|sure|fajn)\b/;
  const DATE_PATTERNS = /^(ak[yý] je d[aá]tum|dnes|quin|what date|what time|kolko je hodin)/;

  const TOOL_INDICATORS = [
    'seo', 'ahrefs', 'gsc', 'keyword', 'backlink', 'domain', 'audit',
    'report', 'analyz', 'content', 'dashboard', 'export', 'vytvor',
    'vygeneruj', 'najdi', 'porovnaj', 'ukaz', 'web_', 'fetch',
    'brief', 'článok', 'clanok', 'strateg', 'plan'
  ];

  const hasToolKeyword = TOOL_INDICATORS.some(kw => msg.includes(kw));

  if (!hasToolKeyword && !hasAgent && wordCount < 15) {
    if (GREETING_PATTERNS.test(msg) || SIMPLE_PATTERNS.test(msg) || DATE_PATTERNS.test(msg)) {
      return { model: 'haiku', temperature: 0.3, reason: 'simple-greeting' };
    }
    // Very short messages without tool keywords
    if (wordCount <= 5) {
      return { model: 'haiku', temperature: 0.3, reason: 'ultra-short' };
    }
  }

  // Sonnet-high tier: complex orchestration (legacy master flag or detected complexity)
  if (isMaster) {
    return { model: 'sonnet-high', temperature: 0.8, reason: 'complex-orchestration' };
  }

  const complexity = detectComplexity(message);
  if (complexity.isComplex) {
    return { model: 'sonnet-high', temperature: 0.8, reason: `complex: ${complexity.reasons.join(',')}` };
  }

  // Default: Sonnet
  return { model: 'sonnet', temperature: 0.7, reason: 'default' };
}

/**
 * Get the full knowledge catalog.
 */
export function getKnowledgeCatalog(userRole?: string): KnowledgeCatalog {
  const agents = loadAgents(userRole);
  const skills = loadSkills(userRole);

  return {
    agents,
    skills,
    stats: {
      totalAgents: agents.length,
      totalSkills: skills.length,
    },
  };
}

/**
 * Get all mentionable entities for MentionsPalette (@trigger).
 * Groups agents by category prefix + adds personas as separate category.
 */
export interface MentionItem {
  id: string;
  name: string;
  description: string;
  color?: string;
  type: string; // 'master' | 'sub-agent' | 'persona'
}

export interface MentionCategory {
  id: string;
  label: string;
  icon: string;
  items: MentionItem[];
}

// Cached at module level (agents don't change at runtime)
let _mentionsCache: MentionCategory[] | null = null;

export function getMentionsForPalette(): MentionCategory[] {
  if (_mentionsCache) return _mentionsCache;

  const agents = loadAgents();

  // Category config (prefix → label + icon)
  // Category config — flat, no master category (masters absorbed into Brain)
  const CATEGORY_CONFIG: Record<string, { label: string; icon: string }> = {
    content: { label: 'Content', icon: '📝' },
    seo: { label: 'SEO', icon: '🔍' },
    ahrefs: { label: 'Ahrefs', icon: '📊' },
    gsc: { label: 'GSC', icon: '📈' },
    site: { label: 'Site', icon: '🏢' },
    brain: { label: 'Brain', icon: '🧠' },
    aeo: { label: 'AEO', icon: '🤖' },
  };

  // Group agents by category (prefix-based, no special master treatment)
  const groups = new Map<string, MentionItem[]>();

  for (const agent of agents) {
    if (agent.visibility === 'admin') continue;
    if (agent.type === 'master') continue; // Skip master agents — absorbed into Brain

    let categoryId: string;
    {
      const prefix = agent.id.split('-')[0];
      categoryId = CATEGORY_CONFIG[prefix] ? prefix : 'brain';
    }

    if (!groups.has(categoryId)) groups.set(categoryId, []);
    groups.get(categoryId)!.push({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      color: agent.color,
      type: agent.type,
    });
  }

  // Build categories in defined order
  const categories: MentionCategory[] = [];

  for (const [catId, config] of Object.entries(CATEGORY_CONFIG)) {
    const items = groups.get(catId);
    if (items && items.length > 0) {
      categories.push({ id: catId, ...config, items });
    }
  }

  // Add personas as last category
  try {
    const { getAllPersonas } = require('../personas/definitions');
    const personas = getAllPersonas();
    if (personas.length > 0) {
      categories.push({
        id: 'personas',
        label: 'Persóny',
        icon: '🎭',
        items: personas.map((p: any) => ({
          id: p.id,
          name: `${p.icon} ${p.name}`,
          description: p.description,
          color: p.color,
          type: 'persona',
        })),
      });
    }
  } catch { /* personas module optional */ }

  _mentionsCache = categories;
  return categories;
}
