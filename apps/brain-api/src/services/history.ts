import { query, queryOne, withTransaction } from '../db/connection';

export interface ConversationRow {
  id: string;
  user_id: string;
  title: string | null;
  persona_id: string | null;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
  message_count?: number;
}

export interface MessageRow {
  id: number;
  conversation_id: string;
  role: string;
  content: string;
  persona_id: string | null;
  tool_calls: any;
  tokens_used: number | null;
  created_at: string;
}

// --- Conversations ---

export async function listConversations(
  userId: string,
  limit = 50,
  offset = 0
): Promise<{ conversations: ConversationRow[]; total: number }> {
  const [conversations, countResult] = await Promise.all([
    query<ConversationRow>(
      `SELECT c.*, COUNT(m.id)::int AS message_count
       FROM conversations c
       LEFT JOIN messages m ON m.conversation_id = c.id
       WHERE c.user_id = $1
       GROUP BY c.id
       ORDER BY c.updated_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    ),
    queryOne<{ count: string }>('SELECT COUNT(*) FROM conversations WHERE user_id = $1', [userId])
  ]);

  return {
    conversations,
    total: parseInt(countResult?.count || '0', 10)
  };
}

export async function getConversation(conversationId: string): Promise<ConversationRow | null> {
  return queryOne<ConversationRow>(
    'SELECT * FROM conversations WHERE id = $1',
    [conversationId]
  );
}

export async function getConversationMessages(conversationId: string): Promise<MessageRow[]> {
  return query<MessageRow>(
    'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
    [conversationId]
  );
}

export async function createConversation(
  userId: string,
  title?: string,
  personaId?: string,
  metadata?: Record<string, unknown>
): Promise<ConversationRow> {
  const row = await queryOne<ConversationRow>(
    `INSERT INTO conversations (user_id, title, persona_id, metadata)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, title || null, personaId || null, JSON.stringify(metadata || {})]
  );
  return row!;
}

export async function updateConversation(
  conversationId: string,
  updates: { title?: string; metadata?: Record<string, unknown> }
): Promise<ConversationRow | null> {
  const sets: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (updates.title !== undefined) {
    sets.push(`title = $${idx++}`);
    values.push(updates.title);
  }
  if (updates.metadata !== undefined) {
    sets.push(`metadata = $${idx++}`);
    values.push(JSON.stringify(updates.metadata));
  }
  sets.push(`updated_at = NOW()`);
  values.push(conversationId);

  return queryOne<ConversationRow>(
    `UPDATE conversations SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
}

export async function deleteConversation(conversationId: string): Promise<boolean> {
  const result = await query(
    'DELETE FROM conversations WHERE id = $1',
    [conversationId]
  );
  return true;
}

// --- Messages ---

export async function addMessage(
  conversationId: string,
  role: string,
  content: string,
  options?: { personaId?: string; toolCalls?: any; tokensUsed?: number }
): Promise<MessageRow> {
  const row = await queryOne<MessageRow>(
    `INSERT INTO messages (conversation_id, role, content, persona_id, tool_calls, tokens_used)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      conversationId,
      role,
      content,
      options?.personaId || null,
      options?.toolCalls ? JSON.stringify(options.toolCalls) : null,
      options?.tokensUsed || null
    ]
  );

  // Update conversation timestamp
  await query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);

  return row!;
}

// --- Save Full Conversation ---

export async function saveConversation(
  userId: string,
  messages: Array<{ role: string; content: string; toolCalls?: any }>,
  options?: { conversationId?: string; title?: string; personaId?: string }
): Promise<{ conversationId: string; messageCount: number }> {
  return withTransaction(async (client) => {
    let conversationId = options?.conversationId;

    if (!conversationId) {
      // Create new conversation with auto-generated title
      const title = options?.title || generateTitle(messages);
      const result = await client.query(
        `INSERT INTO conversations (user_id, title, persona_id)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [userId, title, options?.personaId || null]
      );
      conversationId = result.rows[0].id;
    } else {
      // Existing conversation — autoSave sends full message array each cycle.
      // Wipe rows first so the DB state matches what the FE sent (idempotent).
      // Without this we got exponential duplication on long chats.
      await client.query('DELETE FROM messages WHERE conversation_id = $1', [conversationId]);
      await client.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);
    }

    // Insert messages
    let insertCount = 0;
    for (const msg of messages) {
      await client.query(
        `INSERT INTO messages (conversation_id, role, content, tool_calls)
         VALUES ($1, $2, $3, $4)`,
        [conversationId, msg.role, msg.content, msg.toolCalls ? JSON.stringify(msg.toolCalls) : null]
      );
      insertCount++;
    }

    return { conversationId: conversationId!, messageCount: insertCount };
  });
}

function generateTitle(messages: Array<{ role: string; content: string }>): string {
  const firstUserMessage = messages.find(m => m.role === 'user');
  if (!firstUserMessage) return 'Nová konverzácia';

  const text = firstUserMessage.content;
  if (text.length <= 80) return text;
  return text.substring(0, 77) + '...';
}

// --- Export ---

export async function exportConversation(
  conversationId: string,
  format: 'json' | 'markdown' = 'json'
): Promise<string> {
  const conv = await getConversation(conversationId);
  if (!conv) throw new Error('Conversation not found');

  const messages = await getConversationMessages(conversationId);

  if (format === 'json') {
    return JSON.stringify({ conversation: conv, messages }, null, 2);
  }

  // Markdown format
  let md = `# ${conv.title || 'Konverzácia'}\n`;
  md += `*${new Date(conv.created_at).toLocaleString('sk-SK')}*\n\n---\n\n`;

  for (const msg of messages) {
    const label = msg.role === 'user' ? '**Ty:**' : '**Brain:**';
    md += `${label}\n\n${msg.content}\n\n---\n\n`;
  }

  return md;
}
