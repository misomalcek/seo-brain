import { Router, Request, Response } from 'express';
import { isAnyAdmin } from '../middleware/auth';
import {
  listConversations,
  getConversation,
  getConversationMessages,
  createConversation,
  updateConversation,
  deleteConversation,
  saveConversation,
  exportConversation
} from '../services/history';

export const historyRouter = Router();

// Get authenticated user ID from JWT (set by requireAuth middleware)
function getUserId(req: Request): string {
  return req.user!.userId;
}

// List conversations
historyRouter.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const limit = parseInt(String(req.query.limit || '50'), 10);
    const offset = parseInt(String(req.query.offset || '0'), 10);

    const result = await listConversations(userId, limit, offset);
    res.json({
      success: true,
      data: result.conversations,
      total: result.total,
      offset,
      limit
    });
  } catch (error) {
    console.error('Error listing conversations:', error);
    res.status(500).json({ success: false, error: 'Failed to list conversations' });
  }
});

// Get conversation with messages
historyRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const conversation = await getConversation(String(req.params.id));
    if (!conversation) {
      res.status(404).json({ success: false, error: 'Conversation not found' });
      return;
    }
    // Ownership check — admin can access all
    if (conversation.user_id !== userId && !isAnyAdmin(req.user?.role)) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const messages = await getConversationMessages(String(req.params.id));
    res.json({
      success: true,
      data: { conversation, messages }
    });
  } catch (error) {
    console.error('Error getting conversation:', error);
    res.status(500).json({ success: false, error: 'Failed to get conversation' });
  }
});

// Create / save conversation
historyRouter.post('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { messages, title, conversationId, personaId } = req.body;

    if (messages && Array.isArray(messages)) {
      // Save full conversation with messages
      const result = await saveConversation(userId, messages, {
        conversationId,
        title,
        personaId
      });
      res.json({ success: true, data: result });
    } else {
      // Create empty conversation
      const conv = await createConversation(userId, title, personaId);
      res.json({ success: true, data: conv });
    }
  } catch (error) {
    console.error('Error saving conversation:', error);
    res.status(500).json({ success: false, error: 'Failed to save conversation' });
  }
});

// Update conversation
historyRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const conversation = await getConversation(String(req.params.id));
    if (!conversation) {
      res.status(404).json({ success: false, error: 'Conversation not found' });
      return;
    }
    if (conversation.user_id !== userId && !isAnyAdmin(req.user?.role)) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }
    const { title, metadata } = req.body;
    const updated = await updateConversation(String(req.params.id), { title, metadata });
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating conversation:', error);
    res.status(500).json({ success: false, error: 'Failed to update conversation' });
  }
});

// Delete conversation
historyRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const conversation = await getConversation(String(req.params.id));
    if (!conversation) {
      res.status(404).json({ success: false, error: 'Conversation not found' });
      return;
    }
    if (conversation.user_id !== userId && !isAnyAdmin(req.user?.role)) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }
    await deleteConversation(String(req.params.id));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ success: false, error: 'Failed to delete conversation' });
  }
});

// Export conversation
historyRouter.get('/:id/export', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const conversation = await getConversation(String(req.params.id));
    if (!conversation) {
      res.status(404).json({ success: false, error: 'Conversation not found' });
      return;
    }
    if (conversation.user_id !== userId && !isAnyAdmin(req.user?.role)) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }
    const format = String(req.query.format || 'json') === 'markdown' ? 'markdown' : 'json';
    const exported = await exportConversation(String(req.params.id), format);

    if (format === 'markdown') {
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="conversation-${String(req.params.id)}.md"`);
    } else {
      res.setHeader('Content-Type', 'application/json');
    }

    res.send(exported);
  } catch (error) {
    console.error('Error exporting conversation:', error);
    res.status(500).json({ success: false, error: 'Failed to export conversation' });
  }
});
