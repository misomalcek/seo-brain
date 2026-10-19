/**
 * Night Shift: Memory Decay
 * Schedule: Monthly, 1st day, 4:00 AM
 *
 * Deactivates old, unused memories based on 3 rules:
 * 1. Unpinned, 0 uses, >90 days → deactivate
 * 2. Unpinned, ≤1 use, >60 days → deactivate
 * 3. Active count >50 → deactivate lowest use_count
 *
 * Posts summary to BrainFeed.
 */

import { db, postToBrainFeed, log, cleanup } from './runner';

async function main() {
  log('memory-decay', 'Starting monthly decay...');

  try {
    let totalDeactivated = 0;

    // Rule 1: 0 uses, >90 days
    const r1 = await db.query(`
      UPDATE brain_memories
      SET is_active = FALSE, updated_at = NOW()
      WHERE is_active = TRUE AND is_pinned = FALSE
        AND use_count = 0
        AND created_at < NOW() - INTERVAL '90 days'
    `);
    totalDeactivated += r1.rowCount ?? 0;

    // Rule 2: ≤1 use, >60 days
    const r2 = await db.query(`
      UPDATE brain_memories
      SET is_active = FALSE, updated_at = NOW()
      WHERE is_active = TRUE AND is_pinned = FALSE
        AND use_count <= 1
        AND COALESCE(last_used_at, created_at) < NOW() - INTERVAL '60 days'
    `);
    totalDeactivated += r2.rowCount ?? 0;

    // Rule 3: if >50 active, deactivate lowest
    const countResult = await db.query(`
      SELECT COUNT(*) as cnt FROM brain_memories WHERE is_active = TRUE
    `);
    const activeCount = parseInt(countResult.rows[0].cnt, 10);

    if (activeCount > 50) {
      const excess = activeCount - 50;
      const r3 = await db.query(`
        UPDATE brain_memories
        SET is_active = FALSE, updated_at = NOW()
        WHERE id IN (
          SELECT id FROM brain_memories
          WHERE is_active = TRUE AND is_pinned = FALSE
          ORDER BY use_count ASC, created_at ASC
          LIMIT $1
        )
      `, [excess]);
      totalDeactivated += r3.rowCount ?? 0;
    }

    // Get final stats
    const stats = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE is_active = TRUE) as active,
        COUNT(*) FILTER (WHERE is_active = FALSE) as inactive,
        COUNT(*) FILTER (WHERE is_pinned = TRUE) as pinned
      FROM brain_memories
    `);
    const s = stats.rows[0];

    await postToBrainFeed(
      `🧹 Memory decay (mesačný): ${totalDeactivated} deaktivovaných\n` +
      `📊 Stav: ${s.active} aktívnych, ${s.inactive} neaktívnych, ${s.pinned} pinned`
    );

    log('memory-decay', `Done. Deactivated: ${totalDeactivated}. Active: ${s.active}`);
  } catch (err) {
    log('memory-decay', `Error: ${(err as Error).message}`);
    await postToBrainFeed(`⚠️ Memory decay: zlyhalo — ${(err as Error).message}`);
  } finally {
    await cleanup();
  }
}

main();
