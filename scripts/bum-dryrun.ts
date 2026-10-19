/**
 * BUM v1 Dry-Run — Test Haiku memory extraction on 20 real conversations.
 * Run: cd apps/brain-api && npx tsx ../../scripts/bum-dryrun.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '../apps/brain-api/.env') });
import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EXTRACTION_PROMPT = `You are a memory extraction assistant. Review this conversation between a user and Brain (AI assistant for example-org Slovakia team).

Extract 0-2 facts worth remembering for future conversations across the whole team.

Rules:
- Max 300 characters per memory
- Only genuinely new, non-obvious information
- NOT: conversation-specific details, temporary state, things derivable from tools
- NOT: anything Brain asserted — only facts from user input or tool results
- NOT: facts already stated in the knowledge base (domain strategies, site descriptions)
- YES: user corrections, project decisions, effective tool patterns, formatting preferences
- If nothing worth remembering, return empty array.

Conversation:
{CONVERSATION}

Return ONLY valid JSON: [{"content": "...", "category": "domain|preference|pattern", "domains": ["example.com"] or []}]`;

const CONV_IDS = [
  '2ca3a7f2-1c9a-41c2-87df-ddb6d7f376ab',
  '9ffff972-a010-4fb9-ad7a-249776cdb944',
  'f4c928de-c7fd-4f2a-86c6-f62e7ea5f796',
  '7b7ec5cc-a53c-4fc9-92ff-e31b104e9fa7',
  '4f1c60cb-7a37-49e0-953b-aa34d73f78e3',
  '1d096f2d-febd-4609-bc6c-b44872d82974',
  '510757d9-9ebd-4d78-a9e5-05b837d7b611',
  '654e7fca-18f7-4907-9028-bf57c0f0ea20',
  '8f3c827e-71cc-4a45-9ba1-19edfb0dce1b',
  'dca34adc-d00a-4ccf-826a-77ec76455cfb',
  '04673be9-5f1a-4d71-890e-1b13990adcf4',
  'ec028287-9df8-4e70-9f6b-746a0bce676f',
  '623d2e02-e678-4f75-8e14-d525e865d2dc',
  '54e34d76-4bd5-43dd-aa6f-09bbcdc0eb0f',
  '38f10d75-0bdf-444b-8485-c8a60b246e55',
  '9a22813f-b8ff-40b2-b15c-dc81a8641b93',
  '4a4de0cd-cd06-4cc9-902b-013b0eeead95',
  '5c868ccc-8324-4792-b014-6557eeb6b9b8',
  '5c23d6d3-bf4e-4d15-a4d4-9aaa3b1a6b7e',
  '591741b2-da7d-4ed7-b14e-2128a6d10b5f',
];

interface Memory {
  content: string;
  category: string;
  domains: string[];
}

interface Result {
  convId: string;
  title: string;
  msgCount: number;
  memories: Memory[];
  parseError: boolean;
  error?: string;
}

async function getLastMessages(convId: string, pairCount: number = 4): Promise<{ title: string; messages: string; count: number }> {
  const titleRow = await pool.query('SELECT title FROM conversations WHERE id = $1', [convId]);
  const title = titleRow.rows[0]?.title || 'Untitled';

  // Get last N*2 messages (N pairs)
  const result = await pool.query(
    `SELECT role, content FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [convId, pairCount * 2]
  );

  const msgs = result.rows.reverse();
  const formatted = msgs
    .map((m: any) => {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      // Truncate very long messages
      const truncated = content.length > 2000 ? content.slice(0, 2000) + '...[truncated]' : content;
      return `${m.role.toUpperCase()}: ${truncated}`;
    })
    .join('\n\n');

  return { title, messages: formatted, count: msgs.length };
}

async function extractMemories(conversation: string): Promise<{ memories: Memory[]; parseError: boolean }> {
  const prompt = EXTRACTION_PROMPT.replace('{CONVERSATION}', conversation);

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  try {
    // Extract JSON from response (may have markdown wrapping)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return { memories: [], parseError: text.trim() !== '[]' };
    }
    const memories = JSON.parse(jsonMatch[0]) as Memory[];
    return { memories, parseError: false };
  } catch {
    return { memories: [], parseError: true };
  }
}

async function main() {
  console.log('=== BUM v1 DRY-RUN: Testing Haiku extraction on 20 conversations ===\n');

  const results: Result[] = [];
  let totalMemories = 0;
  let parseErrors = 0;
  let apiErrors = 0;

  for (let i = 0; i < CONV_IDS.length; i++) {
    const convId = CONV_IDS[i];
    process.stdout.write(`[${i + 1}/20] ${convId.slice(0, 8)}... `);

    try {
      const { title, messages, count } = await getLastMessages(convId);
      const { memories, parseError } = await extractMemories(messages);

      if (parseError) parseErrors++;
      totalMemories += memories.length;

      results.push({ convId, title: title.slice(0, 60), msgCount: count, memories, parseError });
      console.log(`${memories.length} memories${parseError ? ' (PARSE ERROR)' : ''}`);
    } catch (err: any) {
      apiErrors++;
      results.push({ convId, title: '?', msgCount: 0, memories: [], parseError: false, error: err.message });
      console.log(`ERROR: ${err.message?.slice(0, 80)}`);
    }

    // Rate limit: small delay between calls
    await new Promise(r => setTimeout(r, 500));
  }

  // === RESULTS ===
  console.log('\n\n=== RESULTS ===\n');

  for (const r of results) {
    console.log(`--- ${r.title} (${r.msgCount} msgs) ---`);
    if (r.error) {
      console.log(`  ERROR: ${r.error}`);
    } else if (r.memories.length === 0) {
      console.log(`  (nothing extracted)${r.parseError ? ' [PARSE ERROR]' : ''}`);
    } else {
      for (const m of r.memories) {
        const charCount = m.content.length;
        const domains = m.domains.length === 0 ? 'global' : m.domains.join(',');
        console.log(`  [${m.category}] [${domains}] (${charCount} chars): ${m.content}`);
      }
    }
  }

  // === METRICS ===
  const total = results.length;
  const withMemories = results.filter(r => r.memories.length > 0).length;
  const emptyValid = results.filter(r => r.memories.length === 0 && !r.parseError && !r.error).length;
  const allMemories = results.flatMap(r => r.memories);
  const over300 = allMemories.filter(m => m.content.length > 300).length;
  const validCategories = allMemories.filter(m => ['domain', 'preference', 'pattern'].includes(m.category)).length;

  console.log('\n\n=== METRICS ===\n');
  console.log(`Conversations tested: ${total}`);
  console.log(`With memories extracted: ${withMemories} (${((withMemories / total) * 100).toFixed(0)}%)`);
  console.log(`Empty (nothing to extract): ${emptyValid}`);
  console.log(`Total memories: ${totalMemories}`);
  console.log(`Parse errors: ${parseErrors} (${((parseErrors / total) * 100).toFixed(0)}%)`);
  console.log(`API errors: ${apiErrors}`);
  console.log(`Over 300 chars: ${over300}`);
  console.log(`Valid categories: ${validCategories}/${allMemories.length}`);
  console.log(`Avg chars per memory: ${allMemories.length > 0 ? (allMemories.reduce((s, m) => s + m.content.length, 0) / allMemories.length).toFixed(0) : 'N/A'}`);

  // Pass/fail criteria from BUM v1 plan
  console.log('\n=== PASS/FAIL CRITERIA ===\n');
  const usefulRate = withMemories / total;
  // We can't auto-judge "useful" vs "hallucinated" — that requires human review
  // But we can check parse failures and char limits
  console.log(`Parse failures: ${parseErrors === 0 ? 'PASS (0%)' : `FAIL (${parseErrors}/${total})`}`);
  console.log(`Over 300 chars: ${over300 === 0 ? 'PASS (0)' : `WARNING (${over300} memories exceed limit)`}`);
  console.log(`Extraction rate: ${((withMemories / total) * 100).toFixed(0)}% of conversations yielded memories`);
  console.log(`\n>>> Human review needed: check each memory above for usefulness vs hallucination <<<`);

  await pool.end();
}

main().catch(console.error);
