/**
 * Night Shift Runner — shared utilities for autonomous agents
 * Used by: auto-activate, memory-decay, health-check, consolidation, etc.
 */

import { Pool } from 'pg';
import Anthropic from '@anthropic-ai/sdk';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load env from brain-api
config({ path: resolve(__dirname, '../../apps/brain-api/.env') });

// Database pool
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Claude API client
export const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// #general channel ID + Brain Admin user (for BrainFeed posts)
const BRAINFEED_CHANNEL_ID = '42e8650d-781b-4ba0-9448-71cf36d9fc0a';
const BRAIN_ADMIN_USER_ID = '0064bc3a-3ee7-4f3b-aa55-edfa42602369';

/**
 * Post a message to the #general BrainFeed channel
 * Uses Brain Admin user_id (chat_messages.user_id is NOT NULL)
 */
export async function postToBrainFeed(message: string): Promise<void> {
  try {
    await db.query(
      `INSERT INTO chat_messages (channel_id, user_id, content, mentions_brain, attachments, created_at)
       VALUES ($1, $2, $3, FALSE, '[]'::jsonb, NOW())`,
      [BRAINFEED_CHANNEL_ID, BRAIN_ADMIN_USER_ID, message]
    );
    log('brainfeed', `Posted: ${message.substring(0, 80)}...`);
  } catch (err) {
    log('brainfeed', `Failed to post: ${(err as Error).message}`);
  }
}

/**
 * Log with timestamp and agent name
 */
export function log(agent: string, message: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${agent}] ${message}`);
}

/**
 * Cleanup — close DB pool (call at end of script)
 */
export async function cleanup(): Promise<void> {
  await db.end();
}
