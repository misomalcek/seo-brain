/**
 * Agents CRUD routes — Sprint G (2026-05-22)
 *
 * GET    /agents           — list: base specialists + custom agents + extensions
 * POST   /agents           — create custom agent
 * PUT    /agents/:id       — update custom agent OR upsert specialist extension
 * DELETE /agents/:id       — soft-delete custom agent
 *
 * All routes require auth (mounted with requireAuth in index.ts).
 */

import { Router, Request, Response } from 'express';
import { agentRegistry } from '../agents/registry.js';
import {
  getCustomAgents,
  getAgentExtension,
  createCustomAgent,
  updateCustomAgent,
  deleteCustomAgent,
  upsertAgentExtension,
  deleteAgentExtension,
} from '../services/custom-agents.js';

export const agentsRouter = Router();

// ─── GET /agents ───────────────────────────────────────────────────────────────

agentsRouter.get('/', (_req: Request, res: Response) => {
  try {
    // 1. Base specialists from registry (with optional extension merged)
    const specialists = agentRegistry.getSpecialistCards().map(card => {
      const ext = getAgentExtension(card.id);
      return {
        ...card,
        source: 'base' as const,
        extension: ext ?? null,
        // Merge custom description if extension set
        descriptionLocalized: ext?.custom_description ?? card.descriptionLocalized,
      };
    });

    // 2. Custom agents from DB cache
    const custom = getCustomAgents().map(a => ({
      id: a.slug,
      name: a.name,
      nameLocalized: a.name,
      description: a.description,
      descriptionLocalized: a.description,
      icon: a.icon,
      color: a.color,
      model: a.model,
      type: 'custom' as const,
      toolCount: a.tools.length === 0 ? 'ALL' as const : a.tools.length,
      absorbs: [],
      source: 'custom' as const,
      extension: null,
      slug: a.slug,
      keywords: a.keywords,
      system_prompt: a.system_prompt,
      tools_list: a.tools,
      created_at: a.created_at,
    }));

    res.json({
      specialists,
      custom,
      total: specialists.length + custom.length,
    });
  } catch (err) {
    console.error('[agents] GET / error:', err);
    res.status(500).json({ success: false, error: 'Failed to load agents' });
  }
});

// ─── POST /agents ──────────────────────────────────────────────────────────────

agentsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'User not found' });

    const { slug, name, description, system_prompt, model, tools, keywords, color, icon } = req.body;

    if (!slug || !name || !system_prompt) {
      return res.status(400).json({
        success: false,
        error: 'Required: slug, name, system_prompt',
      });
    }

    const agent = await createCustomAgent(
      { slug, name, description, system_prompt, model, tools, keywords, color, icon },
      userId
    );

    res.status(201).json({ success: true, agent });
  } catch (err: any) {
    const msg = err?.message || 'Failed to create agent';
    const status = msg.includes('unique') || msg.includes('Slug') ? 400 : 500;
    res.status(status).json({ success: false, error: msg });
  }
});

// ─── PUT /agents/:id ───────────────────────────────────────────────────────────

agentsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'User not found' });

    const id = req.params.id as string;
    const isBaseSpecialist = agentRegistry.knows(id) && !agentRegistry.isCustom(id);

    if (isBaseSpecialist) {
      // Update extension for base specialist
      const { custom_description, extra_system_prompt, extra_keywords } = req.body;

      if (!custom_description && !extra_system_prompt && (!extra_keywords || extra_keywords.length === 0)) {
        // DELETE extension (reset to defaults)
        await deleteAgentExtension(id);
        return res.json({ success: true, message: 'Extension cleared' });
      }

      const ext = await upsertAgentExtension(
        id,
        { custom_description, extra_system_prompt, extra_keywords },
        userId
      );
      return res.json({ success: true, extension: ext });
    }

    // Update custom agent
    const { name, description, system_prompt, model, tools, keywords, color, icon, is_active } = req.body;
    const updated = await updateCustomAgent(id, {
      name, description, system_prompt, model, tools, keywords, color, icon, is_active,
    });
    res.json({ success: true, agent: updated });

  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update agent' });
  }
});

// ─── DELETE /agents/:id ────────────────────────────────────────────────────────

agentsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    if (agentRegistry.knows(id) && !agentRegistry.isCustom(id)) {
      return res.status(400).json({
        success: false,
        error: 'Base specialist agents cannot be deleted. Use PUT to add/clear extensions.',
      });
    }

    await deleteCustomAgent(id);
    res.json({ success: true, message: `Agent "${id}" deactivated` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete agent' });
  }
});

// ─── Harness mirror-usability (2026-05-26, order-3 polish) ────────────────────

/**
 * Hot-reload all agent prompt caches. Useful after editing agents/*.md
 * on disk — otherwise the existing in-memory cache keeps serving stale
 * text until process restart.
 *
 * POST /api/agents/prompts/reload
 *   body: { id?: 'auditor' | … }   — optional, omit to flush all
 */
agentsRouter.post('/prompts/reload', async (req: Request, res: Response) => {
  try {
    const id = typeof req.body?.id === 'string' ? req.body.id : undefined;
    agentRegistry.invalidateCache(id);
    res.json({
      success: true,
      message: id ? `cleared prompt cache for ${id}` : 'cleared all prompt caches',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

/**
 * Show the compiled effective prompt + tool list for an agent. Read-only,
 * useful for QA / debugging / "why did Auditor say that" investigations.
 *
 * GET /api/agents/:id/effective-prompt
 */
agentsRouter.get('/:id/effective-prompt', async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);
    const resolved = agentRegistry.resolveForChat(idParam);
    if (!resolved) {
      res.status(404).json({ success: false, error: `agent not found: ${idParam}` });
      return;
    }
    res.json({
      success: true,
      agent: {
        id: resolved.def.id,
        name: (resolved.def as any).nameLocalized ?? resolved.def.name,
        type: (resolved.def as any).type ?? 'specialist',
      },
      promptLength: resolved.prompt.length,
      promptPreview: resolved.prompt.slice(0, 500),
      promptFull: resolved.prompt,
      subAgentContextLength: resolved.subAgentContext?.length ?? 0,
      tools: {
        mode: resolved.toolIds === 'ALL' ? 'ALL' : 'filtered',
        count: resolved.filteredTools.length,
        names: resolved.filteredTools.map(t => t.name),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});
