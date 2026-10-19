import { Router, Request, Response } from 'express';
import {
  getMemories,
  createMemory,
  updateMemory,
  deleteMemory,
  toggleActive,
  togglePin,
  getMemoryStats,
  autoActivatePending,
  runDecay,
  MemoryCategory,
} from '../services/brain-memory';

export const brainMemoryRouter = Router();

// GET /brain-memory — list all (filterable)
brainMemoryRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { category, active, search, sort, limit, mine } = req.query;

    const memories = await getMemories({
      category: category as MemoryCategory | undefined,
      active: active === 'true' ? true : active === 'false' ? false : undefined,
      search: search as string | undefined,
      sort: sort as 'use_count' | 'created_at' | 'updated_at' | undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      // #5 (2026-04-29): mine=true → filter to memories created by the current user
      createdBy: mine === 'true' ? req.user!.userId : undefined,
    });

    res.json({ memories });
  } catch (err) {
    console.error('[brain-memory] GET / error:', err);
    res.status(500).json({ error: 'Failed to fetch memories' });
  }
});

// GET /brain-memory/stats — counts, budget, extraction monitoring
brainMemoryRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getMemoryStats();
    res.json(stats);
  } catch (err) {
    console.error('[brain-memory] GET /stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// POST /brain-memory — manual create (is_active = TRUE by default)
brainMemoryRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { content, category, domains, source_type } = req.body;
    const userId = req.user?.userId;

    if (!content || !category) {
      res.status(400).json({ error: 'content and category are required' });
      return;
    }

    const memory = await createMemory({
      content,
      category,
      domains: domains || [],
      source_type: source_type || 'admin',
      created_by_user_id: userId,
      is_active: true,
    });

    res.status(201).json({ memory });
  } catch (err: any) {
    console.error('[brain-memory] POST / error:', err);
    res.status(400).json({ error: err.message || 'Failed to create memory' });
  }
});

// PUT /brain-memory/:id — update
brainMemoryRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const memory = await updateMemory(id, req.body);
    res.json({ memory });
  } catch (err: any) {
    console.error('[brain-memory] PUT /:id error:', err);
    res.status(400).json({ error: err.message || 'Failed to update memory' });
  }
});

// DELETE /brain-memory/:id — hard delete
brainMemoryRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await deleteMemory(id);
    res.json({ success: true });
  } catch (err) {
    console.error('[brain-memory] DELETE /:id error:', err);
    res.status(500).json({ error: 'Failed to delete memory' });
  }
});

// PATCH /brain-memory/:id/toggle — toggle is_active
brainMemoryRouter.patch('/:id/toggle', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const memory = await toggleActive(id);
    res.json({ memory });
  } catch (err: any) {
    console.error('[brain-memory] PATCH /:id/toggle error:', err);
    res.status(400).json({ error: err.message || 'Failed to toggle memory' });
  }
});

// PATCH /brain-memory/:id/pin — toggle is_pinned
brainMemoryRouter.patch('/:id/pin', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const memory = await togglePin(id);
    res.json({ memory });
  } catch (err: any) {
    console.error('[brain-memory] PATCH /:id/pin error:', err);
    res.status(400).json({ error: err.message || 'Failed to toggle pin' });
  }
});

// POST /brain-memory/auto-activate — trigger auto-activation of old pending memories
brainMemoryRouter.post('/auto-activate', async (_req: Request, res: Response) => {
  try {
    const count = await autoActivatePending();
    res.json({ activated: count });
  } catch (err) {
    console.error('[brain-memory] POST /auto-activate error:', err);
    res.status(500).json({ error: 'Failed to auto-activate' });
  }
});

// POST /brain-memory/decay — trigger decay cleanup
brainMemoryRouter.post('/decay', async (_req: Request, res: Response) => {
  try {
    const result = await runDecay();
    res.json(result);
  } catch (err) {
    console.error('[brain-memory] POST /decay error:', err);
    res.status(500).json({ error: 'Failed to run decay' });
  }
});
