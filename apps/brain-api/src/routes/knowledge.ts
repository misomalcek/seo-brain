import { Router, Request, Response } from 'express';
import { isAnyAdmin } from '../middleware/auth';
import {
  loadAgents,
  loadSkills,
  getAgentContent,
  getSkillContent,
  getKnowledgeCatalog,
  loadFrameworks,
  getFrameworkContent,
} from '../services/knowledge';
import { agentRegistry } from '../agents/registry.js';
import fs from 'fs';
import path from 'path';

export const knowledgeRouter = Router();

// GET /knowledge - Full knowledge catalog (agents + skills + stats)
knowledgeRouter.get('/', (req: Request, res: Response) => {
  const catalog = getKnowledgeCatalog(req.user?.role);
  res.json(catalog);
});

// GET /knowledge/agents - List all agents
knowledgeRouter.get('/agents', (req: Request, res: Response) => {
  const agents = loadAgents(req.user?.role);
  res.json({ agents, total: agents.length });
});

// GET /knowledge/agents/specialists - 6 specialist agent cards from registry (Sprint E)
// Must be registered BEFORE /agents/:id to avoid "specialists" matching as ID param.
knowledgeRouter.get('/agents/specialists', (_req: Request, res: Response) => {
  const specialists = agentRegistry.getSpecialistCards();
  const brainCore = agentRegistry.getBrainCoreCards();
  res.json({
    specialists,
    brainCore,
    total: specialists.length + brainCore.length,
  });
});

// GET /knowledge/agents/:id - Get specific agent with full content
knowledgeRouter.get('/agents/:id', (req: Request, res: Response) => {
  const result = getAgentContent(String(req.params.id));
  if (!result) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }
  res.json(result);
});

// GET /knowledge/skills - Redirects to agents (skills merged into agents in v1.4)
knowledgeRouter.get('/skills', (req: Request, res: Response) => {
  const agents = loadAgents(req.user?.role);
  const skills = agents.map(a => ({ ...a, category: 'agents' }));
  res.json({ skills, grouped: { agents: skills }, total: skills.length });
});

// GET /knowledge/skills/by-path?path=seo/schema-and-meta.md - Get specific skill content
knowledgeRouter.get('/skills/by-path', (req: Request, res: Response) => {
  const skillPath = String(req.query.path || '');

  if (!skillPath) {
    res.status(400).json({ error: 'path query parameter is required' });
    return;
  }

  // Try with and without .md extension
  let result = getSkillContent(skillPath);
  if (!result && !skillPath.endsWith('.md')) {
    result = getSkillContent(`${skillPath}.md`);
  }

  if (!result) {
    res.status(404).json({ error: 'Skill not found' });
    return;
  }
  res.json(result);
});

// GET /knowledge/frameworks - List all content frameworks
knowledgeRouter.get('/frameworks', (_req: Request, res: Response) => {
  const frameworks = loadFrameworks();

  // Group by category
  const grouped: Record<string, typeof frameworks> = {};
  for (const fw of frameworks) {
    if (!grouped[fw.category]) {
      grouped[fw.category] = [];
    }
    grouped[fw.category].push(fw);
  }

  res.json({ frameworks, grouped, total: frameworks.length });
});

// GET /knowledge/frameworks/by-path?path=article-structures/seo-article.md
knowledgeRouter.get('/frameworks/by-path', (req: Request, res: Response) => {
  const fwPath = String(req.query.path || '');

  if (!fwPath) {
    res.status(400).json({ error: 'path query parameter is required' });
    return;
  }

  let result = getFrameworkContent(fwPath);
  if (!result && !fwPath.endsWith('.md')) {
    result = getFrameworkContent(`${fwPath}.md`);
  }

  if (!result) {
    res.status(404).json({ error: 'Framework not found' });
    return;
  }
  res.json(result);
});

// --- Documents ---

const BASE_DIR = '/opt/team-brain';
const ALLOWED_DOC_DIRS = [
  { dir: '.', files: ['CLAUDE.md'], label: 'Projekt' },
  { dir: 'knowledge/guardian', files: null, label: 'Guardian (Codex)' },
  { dir: 'knowledge/guardian/reports', files: null, label: 'Quinn Reports' },
];

function listDocFiles(): Array<{ path: string; name: string; category: string; size: number; modifiedAt: string }> {
  const docs: Array<{ path: string; name: string; category: string; size: number; modifiedAt: string }> = [];

  for (const entry of ALLOWED_DOC_DIRS) {
    const dirPath = path.join(BASE_DIR, entry.dir);
    if (!fs.existsSync(dirPath)) continue;

    if (entry.files) {
      // Specific files only
      for (const f of entry.files) {
        const fp = path.join(dirPath, f);
        if (fs.existsSync(fp)) {
          const stat = fs.statSync(fp);
          docs.push({
            path: path.join(entry.dir, f),
            name: f,
            category: entry.label,
            size: stat.size,
            modifiedAt: stat.mtime.toISOString(),
          });
        }
      }
    } else {
      // All .md files in directory
      const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md')).sort();
      for (const f of files) {
        const fp = path.join(dirPath, f);
        const stat = fs.statSync(fp);
        docs.push({
          path: path.join(entry.dir, f),
          name: f,
          category: entry.label,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        });
      }
    }
  }

  return docs;
}

// GET /knowledge/documents - List internal project documents
knowledgeRouter.get('/documents', (req: Request, res: Response) => {
  if (!isAnyAdmin(req.user?.role)) {
    res.status(403).json({ error: 'Admin only' });
    return;
  }
  res.json({ documents: listDocFiles() });
});

// GET /knowledge/documents/by-path?path=CLAUDE.md
knowledgeRouter.get('/documents/by-path', (req: Request, res: Response) => {
  if (!isAnyAdmin(req.user?.role)) {
    res.status(403).json({ error: 'Admin only' });
    return;
  }

  const docPath = String(req.query.path || '');
  if (!docPath) {
    res.status(400).json({ error: 'path is required' });
    return;
  }

  // Validate path is within allowed dirs
  const allDocs = listDocFiles();
  const found = allDocs.find(d => d.path === docPath);
  if (!found) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  const fullPath = path.join(BASE_DIR, docPath);
  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'File missing' });
    return;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  res.json({ path: docPath, name: found.name, category: found.category, content });
});

// GET /knowledge/help - Auto-generated help from agents + skills + features
knowledgeRouter.get('/help', (req: Request, res: Response) => {
  const agents = loadAgents(req.user?.role);
  const skills = loadSkills(req.user?.role);
  const frameworks = loadFrameworks();

  const features = [
    { name: 'Ahrefs nastroje', description: 'Domain overview, keywords, backlinks, konkurencia, top pages', icon: '📊' },
    { name: 'GSC nastroje', description: 'Search queries, pages, sitemapy, indexovanie', icon: '🔍' },
    { name: 'Deliberacia', description: 'Viacero person analyzuje otazku z roznych uhlov', icon: '🎭' },
    { name: 'Smart Save', description: 'Uloz odpoved ako DOCX, XLSX, PPTX, HTML, MD, CSV, JSON', icon: '💾' },
    { name: 'Content Calendar', description: 'Planovanie a sledovanie obsahu cez statusy', icon: '📅' },
    { name: 'HTML Reporty', description: 'Generuj profesionalne HTML reporty z dat', icon: '📄' },
    { name: 'Team Chat', description: 'Timova komunikacia s @Brain zminkami', icon: '💬' },
    { name: 'File References', description: 'Pripoj subory ako kontext pre AI', icon: '📎' },
    { name: 'Brand Assets', description: 'Brand voice a style guide per web', icon: '🎨' },
    { name: 'Workspace', description: 'Zdielanie suborov a reportov v time', icon: '👥' },
    { name: 'Feedback', description: 'Like/dislike, bug reporty, feature requesty', icon: '📣' },
  ];

  const shortcuts = [
    { keys: '/', description: 'Otvor paletu prikazov' },
    { keys: 'Enter', description: 'Odoslat spravu' },
    { keys: 'Shift+Enter', description: 'Novy riadok' },
    { keys: '@agent', description: 'Vyvolaj agenta' },
    { keys: 'Ctrl+K', description: 'Globalne hladanie' },
  ];

  res.json({
    agents: agents.map(a => ({ id: a.id, name: a.name, description: a.description })),
    skills: [], // Deprecated: skills merged into agents in v1.4
    frameworks: frameworks.map(f => ({ id: f.id, name: f.name, description: f.description, category: f.category })),
    features,
    shortcuts,
  });
});
