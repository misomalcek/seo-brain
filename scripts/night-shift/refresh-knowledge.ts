/**
 * Night Shift: Knowledge Auto-Refresh
 * Schedule: Monthly, 1st day, 3:00 AM
 *
 * Reads active brain_memories with high use_count,
 * compares with existing knowledge files,
 * proposes updates via Haiku, saves as pending brain_memories for admin review.
 */

import { db, claude, postToBrainFeed, log, cleanup } from './runner';
import * as fs from 'fs';
import * as path from 'path';

const KNOWLEDGE_DIR = '/opt/team-brain/knowledge';

async function main() {
  log('refresh-knowledge', 'Starting monthly knowledge refresh...');

  try {
    // 1. Load current knowledge files
    const knowledgeFiles: Record<string, string> = {};
    if (fs.existsSync(KNOWLEDGE_DIR)) {
      for (const file of fs.readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith('.md'))) {
        knowledgeFiles[file] = fs.readFileSync(path.join(KNOWLEDGE_DIR, file), 'utf-8');
      }
    }

    log('refresh-knowledge', `Loaded ${Object.keys(knowledgeFiles).length} knowledge files`);

    // 2. Load high-value brain memories (active, used 3+ times)
    const memories = await db.query(`
      SELECT content, category, domains, use_count
      FROM brain_memories
      WHERE is_active = TRUE AND use_count >= 3
      ORDER BY use_count DESC
      LIMIT 30
    `);

    if (memories.rows.length === 0) {
      log('refresh-knowledge', 'No high-value memories found. Skipping.');
      await postToBrainFeed('📚 Knowledge refresh: žiadne vysoko používané pamäte na integráciu');
      await cleanup();
      return;
    }

    log('refresh-knowledge', `Found ${memories.rows.length} high-value memories`);

    // 3. Load last 30 days conversation summaries (just counts and topics)
    const convStats = await db.query(`
      SELECT COUNT(*) as total_conversations,
             COUNT(DISTINCT user_id) as unique_users
      FROM conversations
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);

    // 4. Use Haiku to propose updates
    const currentKnowledge = Object.entries(knowledgeFiles)
      .map(([file, content]) => `### ${file}\n${content.substring(0, 500)}...`)
      .join('\n\n');

    const memoriesList = memories.rows
      .map((m: any) => `- [${m.category}] (used ${m.use_count}x) ${m.content}`)
      .join('\n');

    const response = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Si Knowledge Manager pre Team Brain. Analyzuj a navrhni aktualizácie knowledge files.

AKTUÁLNE KNOWLEDGE FILES:
${currentKnowledge}

VYSOKO POUŽÍVANÉ BRAIN MEMORIES (use_count >= 3):
${memoriesList}

ŠTATISTIKY (posledných 30 dní):
- Konverzácie: ${convStats.rows[0]?.total_conversations || 0}
- Unikátni používatelia: ${convStats.rows[0]?.unique_users || 0}

ÚLOHA:
1. Identifikuj 0-3 informácie z memories ktoré by mali byť v knowledge files ale nie sú
2. Pre každú navrhni: do ktorého súboru patrí a presný text na pridanie
3. Ak je všetko aktuálne, povedz "Žiadne zmeny nie sú potrebné"

PRAVIDLÁ:
- Knowledge files sú strategické základy, nie detaily
- Nepridávaj duplikáty (skontroluj či info už nie je v súbore)
- Max 1-2 vety na novú informáciu
- Formát: JSON array [{file, addition, reason}]
- Ak žiadne zmeny: []

Odpovedz LEN JSON array, žiadny iný text.`
      }],
    });

    const responseText = response.content[0].type === 'text' ? response.content[0].text : '[]';

    // Parse response
    let proposals: Array<{ file: string; addition: string; reason: string }> = [];
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        proposals = JSON.parse(jsonMatch[0]);
      }
    } catch {
      log('refresh-knowledge', `Failed to parse Haiku response: ${responseText.substring(0, 200)}`);
    }

    if (proposals.length === 0) {
      log('refresh-knowledge', 'No updates proposed. Knowledge is up to date.');
      await postToBrainFeed('📚 Knowledge refresh: všetko aktuálne, žiadne zmeny');
      await cleanup();
      return;
    }

    // 5. Save proposals as pending brain_memories for admin review
    let savedCount = 0;
    for (const p of proposals) {
      if (!p.addition || !p.reason) continue;
      await db.query(`
        INSERT INTO brain_memories (content, category, source_type, source_quote, is_active)
        VALUES ($1, 'domain', 'system', $2, FALSE)
      `, [
        p.addition.substring(0, 300),
        `Knowledge refresh: ${p.file} — ${p.reason}`.substring(0, 500),
      ]);
      savedCount++;
    }

    const summary = proposals
      .map(p => `• ${p.file}: ${p.addition.substring(0, 80)}`)
      .join('\n');

    await postToBrainFeed(`📚 Knowledge refresh dokončený\n\n${savedCount} návrhy na aktualizáciu (pending):\n${summary}\n\nAdmin: schváľ cez Admin > Memory > Pending`);

    log('refresh-knowledge', `Done. ${savedCount} proposals saved as pending.`);
  } catch (err) {
    log('refresh-knowledge', `Error: ${(err as Error).message}`);
    await postToBrainFeed(`⚠️ Knowledge refresh zlyhalo: ${(err as Error).message}`);
  } finally {
    await cleanup();
  }
}

main();
