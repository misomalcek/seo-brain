import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { adminSettingsView, saveSettings, testConnection } from '../services/settings';
import { resetAnthropicClient } from '../services/claude';

export const settingsRouter = Router();

function brainAdmin(req: Request, res: Response): boolean {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ success: false, error: 'Brain admin only' });
    return false;
  }
  return true;
}

settingsRouter.use(requireAuth);

settingsRouter.get('/', (req, res) => {
  if (!brainAdmin(req, res)) return;
  res.json(adminSettingsView());
});

settingsRouter.put('/', async (req, res) => {
  if (!brainAdmin(req, res)) return;
  try {
    await saveSettings(req.body || {});
    resetAnthropicClient();
    res.json({ success: true, settings: adminSettingsView() });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

settingsRouter.post('/test', async (req, res) => {
  if (!brainAdmin(req, res)) return;
  try {
    const result = await testConnection(String(req.body?.target || ''));
    res.json(result);
  } catch (err) {
    res.status(502).json({ ok: false, detail: err instanceof Error ? err.message : String(err) });
  }
});
