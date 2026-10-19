/**
 * Night Shift: Auto-Activate Pending Memories
 * Schedule: Daily 1:30 AM
 *
 * Activates brain_memories that have been pending for >7 days.
 * Posts summary to BrainFeed.
 */

import { db, postToBrainFeed, log, cleanup } from './runner';

async function main() {
  log('auto-activate', 'Starting...');

  try {
    // Activate memories pending for >7 days
    const result = await db.query(`
      UPDATE brain_memories
      SET is_active = TRUE, updated_at = NOW()
      WHERE is_active = FALSE
        AND created_at < NOW() - INTERVAL '7 days'
      RETURNING id, content
    `);

    const count = result.rowCount ?? 0;

    if (count > 0) {
      const preview = result.rows
        .slice(0, 3)
        .map((r: { content: string }) => `• ${r.content.substring(0, 60)}...`)
        .join('\n');

      await postToBrainFeed(
        `🧠 Auto-activate: ${count} ${count === 1 ? 'pamäť aktivovaná' : 'pamätí aktivovaných'} (7+ dní pending)\n${preview}`
      );
    }

    log('auto-activate', `Done. Activated: ${count}`);
  } catch (err) {
    log('auto-activate', `Error: ${(err as Error).message}`);
    await postToBrainFeed(`⚠️ Auto-activate: zlyhalo — ${(err as Error).message}`);
  } finally {
    await cleanup();
  }
}

main();
