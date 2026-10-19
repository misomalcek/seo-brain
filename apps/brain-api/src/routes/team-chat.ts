import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/connection';
import { sseManager } from '../services/sse-manager';
import Anthropic from '@anthropic-ai/sdk';

export const teamChatRouter = Router();

const anthropic = new Anthropic();

// GET /team-chat/channels - User's channels with last message + unread
teamChatRouter.get('/channels', async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const channels = await query(
    `SELECT c.id, c.name, c.type,
      (SELECT content FROM chat_messages WHERE channel_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT created_at FROM chat_messages WHERE channel_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
      (SELECT u2.name FROM chat_messages cm2 JOIN users u2 ON cm2.user_id = u2.id WHERE cm2.channel_id = c.id ORDER BY cm2.created_at DESC LIMIT 1) as last_message_by,
      (SELECT COUNT(*) FROM chat_messages cm3 WHERE cm3.channel_id = c.id AND cm3.created_at > COALESCE(ccm.last_read_at, '1970-01-01'))::int as unread_count
     FROM chat_channels c
     JOIN chat_channel_members ccm ON c.id = ccm.channel_id AND ccm.user_id = $1
     ORDER BY c.type, c.name`,
    [userId]
  );

  res.json({
    channels: channels.map((c: any) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      lastMessage: c.last_message,
      lastMessageAt: c.last_message_at,
      lastMessageBy: c.last_message_by,
      unreadCount: c.unread_count || 0,
    })),
  });
});

// GET /team-chat/channels/:id/messages - Paginated messages
teamChatRouter.get('/channels/:id/messages', async (req: Request, res: Response) => {
  const channelId = req.params.id;
  const userId = req.user!.userId;
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const before = req.query.before ? Number(req.query.before) : null;

  // Update last_read_at
  await query(
    'UPDATE chat_channel_members SET last_read_at = NOW() WHERE channel_id = $1 AND user_id = $2',
    [channelId, userId]
  );

  let whereClause = 'WHERE cm.channel_id = $1';
  const params: any[] = [channelId];

  if (before) {
    params.push(before);
    whereClause += ` AND cm.id < $${params.length}`;
  }

  const messages = await query(
    `SELECT cm.id, cm.channel_id, cm.user_id, u.name as user_name, cm.content,
      cm.mentions_brain, cm.brain_response, cm.attachments, cm.created_at
     FROM chat_messages cm
     JOIN users u ON cm.user_id = u.id
     ${whereClause}
     ORDER BY cm.created_at DESC
     LIMIT $${params.length + 1}`,
    [...params, limit]
  );

  res.json({
    messages: messages.reverse().map((m: any) => ({
      id: m.id,
      channelId: m.channel_id,
      userId: m.user_id,
      userName: m.user_name,
      content: m.content,
      mentionsBrain: m.mentions_brain,
      brainResponse: m.brain_response,
      attachments: m.attachments || [],
      createdAt: m.created_at,
    })),
  });
});

// POST /team-chat/channels/:id/messages - Send message (with optional attachments)
teamChatRouter.post('/channels/:id/messages', async (req: Request, res: Response) => {
  const channelId = req.params.id;
  const userId = req.user!.userId;
  const { content, attachments } = req.body;

  if (!content?.trim() && (!attachments || attachments.length === 0)) {
    res.status(400).json({ error: 'Content or attachments required' });
    return;
  }

  const mentionsBrain = /@brain/i.test(content || '');
  const validAttachments = Array.isArray(attachments) ? attachments : [];

  const row = await queryOne<{ id: string; created_at: string }>(
    `INSERT INTO chat_messages (channel_id, user_id, content, mentions_brain, attachments)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
    [channelId, userId, (content || '').trim(), mentionsBrain, JSON.stringify(validAttachments)]
  );

  const user = await queryOne<{ name: string }>('SELECT name FROM users WHERE id = $1', [userId]);

  // Auto-share referenced conversations with channel members
  for (const att of validAttachments) {
    if (att.type === 'conversation' && att.id) {
      try {
        await query(
          `INSERT INTO shared_conversations (conversation_id, channel_id, shared_by)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [att.id, channelId, userId]
        );
      } catch {
        // conversation may not exist, skip
      }
    }
  }

  const message = {
    id: Number(row!.id),
    channelId,
    userId,
    userName: user!.name,
    content: (content || '').trim(),
    mentionsBrain,
    brainResponse: null,
    attachments: validAttachments,
    createdAt: row!.created_at,
  };

  // Get channel members for SSE broadcast
  const members = await query(
    'SELECT user_id FROM chat_channel_members WHERE channel_id = $1',
    [channelId]
  );
  const memberIds = members.map((m: any) => m.user_id);

  // Broadcast to channel members
  sseManager.broadcastToUsers(memberIds, 'chat_message', message);

  res.json({ message });

  // Async: Handle @Brain mention
  if (mentionsBrain) {
    handleBrainMention(message, memberIds).catch(err =>
      console.error('Brain mention handling failed:', err)
    );
  }
});

// Handle @Brain mention asynchronously
async function handleBrainMention(message: { id: number; content: string; userName: string }, memberIds: string[]) {
  try {
    const response = await anthropic.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `You are Brain, an AI assistant for a small SEO/Content team. Someone mentioned you in team chat. Keep your response concise (1-3 sentences). Be helpful and friendly.\n\n${message.userName} says: ${message.content}`,
      }],
    });

    const brainResponse = response.content[0].type === 'text' ? response.content[0].text : '';

    // Update DB
    await query(
      'UPDATE chat_messages SET brain_response = $1 WHERE id = $2',
      [brainResponse, message.id]
    );

    // Push SSE event
    sseManager.broadcastToUsers(memberIds, 'brain_response', {
      messageId: message.id,
      response: brainResponse,
    });
  } catch (err) {
    console.error('Brain response failed:', err);

    const errorText = '[Error: Brain could not respond]';
    await query(
      'UPDATE chat_messages SET brain_response = $1 WHERE id = $2',
      [errorText, message.id]
    ).catch(() => {});

    sseManager.broadcastToUsers(memberIds, 'brain_error', {
      messageId: message.id,
      error: errorText,
    });
  }
}

// POST /team-chat/dm/:userId - Get or create DM channel
teamChatRouter.post('/dm/:userId', async (req: Request, res: Response) => {
  const myId = req.user!.userId;
  const otherUserId = req.params.userId;

  if (myId === otherUserId) {
    res.status(400).json({ error: 'Cannot DM yourself' });
    return;
  }

  // Check if DM channel exists between these two users
  const existing = await queryOne<{ id: string; name: string }>(
    `SELECT c.id, c.name FROM chat_channels c
     WHERE c.type = 'direct'
     AND EXISTS (SELECT 1 FROM chat_channel_members WHERE channel_id = c.id AND user_id = $1)
     AND EXISTS (SELECT 1 FROM chat_channel_members WHERE channel_id = c.id AND user_id = $2)`,
    [myId, otherUserId]
  );

  if (existing) {
    res.json({ channel: { id: existing.id, name: existing.name, type: 'direct', unreadCount: 0 } });
    return;
  }

  // Create new DM channel
  const otherUser = await queryOne<{ name: string }>('SELECT name FROM users WHERE id = $1', [otherUserId]);
  const myUser = await queryOne<{ name: string }>('SELECT name FROM users WHERE id = $1', [myId]);
  if (!otherUser || !myUser) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const channel = await queryOne<{ id: string }>(
    `INSERT INTO chat_channels (name, type, created_by) VALUES ($1, 'direct', $2) RETURNING id`,
    [`${myUser.name} & ${otherUser.name}`, myId]
  );

  await query(
    'INSERT INTO chat_channel_members (channel_id, user_id) VALUES ($1, $2), ($1, $3)',
    [channel!.id, myId, otherUserId]
  );

  res.json({ channel: { id: channel!.id, name: otherUser.name, type: 'direct', unreadCount: 0 } });
});

// GET /team-chat/presence - All users with status
teamChatRouter.get('/presence', async (_req: Request, res: Response) => {
  const users = await query(
    `SELECT u.id, u.name, u.email, u.role, p.status, p.last_seen_at
     FROM users u
     LEFT JOIN user_presence p ON u.id = p.user_id
     ORDER BY p.status = 'online' DESC, u.name`
  );

  res.json({
    users: users.map((u: any) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status || 'offline',
      lastSeenAt: u.last_seen_at,
    })),
  });
});

// POST /team-chat/presence/heartbeat - Update online status
teamChatRouter.post('/presence/heartbeat', async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  await query(
    `INSERT INTO user_presence (user_id, status, last_seen_at)
     VALUES ($1, 'online', NOW())
     ON CONFLICT (user_id) DO UPDATE SET status = 'online', last_seen_at = NOW()`,
    [userId]
  );

  // Broadcast presence update
  sseManager.broadcast('presence', { userId, status: 'online' }, userId);

  res.json({ ok: true });
});

// GET /team-chat/shared-conversations/:channelId - Get shared conversations for a channel
teamChatRouter.get('/shared-conversations/:channelId', async (req: Request, res: Response) => {
  const channelId = req.params.channelId;
  const userId = req.user!.userId;

  // Verify user is member of channel
  const membership = await queryOne(
    'SELECT 1 FROM chat_channel_members WHERE channel_id = $1 AND user_id = $2',
    [channelId, userId]
  );
  if (!membership) {
    res.status(403).json({ error: 'Not a channel member' });
    return;
  }

  const shared = await query(
    `SELECT sc.conversation_id, c.title, u.name as shared_by_name, sc.shared_at
     FROM shared_conversations sc
     JOIN conversations c ON sc.conversation_id = c.id
     JOIN users u ON sc.shared_by = u.id
     WHERE sc.channel_id = $1
     ORDER BY sc.shared_at DESC`,
    [channelId]
  );

  res.json({ conversations: shared.map((s: any) => ({
    conversationId: s.conversation_id,
    title: s.title,
    sharedBy: s.shared_by_name,
    sharedAt: s.shared_at,
  }))});
});

// GET /team-chat/sse - SSE endpoint for real-time updates
teamChatRouter.get('/sse', (req: Request, res: Response) => {
  const userId = req.user!.userId;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // nginx SSE support
  });

  // Send initial ping
  res.write(`event: connected\ndata: ${JSON.stringify({ userId })}\n\n`);

  const accepted = sseManager.addClient(userId, res);
  if (!accepted) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'Too many connections' })}\n\n`);
    res.end();
    return;
  }

  req.on('close', () => {
    sseManager.removeClient(userId, res);
    // Mark offline after disconnect
    query(
      `UPDATE user_presence SET status = 'offline', last_seen_at = NOW() WHERE user_id = $1`,
      [userId]
    ).catch(() => {});
    sseManager.broadcast('presence', { userId, status: 'offline' });
  });
});
