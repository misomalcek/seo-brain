import Anthropic from '@anthropic-ai/sdk';
import { AVAILABLE_TOOLS, WEB_SEARCH_TOOL } from '../tools/definitions.js';
import { executeTool } from '../tools/executor.js';
import { getSystemPrompt, getBrandContext } from './persona.js';
import { routeByKeyword } from './brain-router.js';
import { agentRegistry } from '../agents/registry.js';
import { query as dbQuery, queryOne } from '../db/connection.js';

const MAX_CONCURRENT = 2;
const JOB_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes (heavy tool-use workloads)

// Track running jobs in memory (AbortController per jobId)
const runningJobs = new Map<string, AbortController>();

export function getRunningJobCount(): number {
  return runningJobs.size;
}

interface BackgroundJobRow {
  id: string;
  user_id: string;
  conversation_id: string | null;
  title: string;
  request_payload: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    contextItems?: Array<{ type: string; label: string; content: string }>;
    personaId?: string;
    siteId?: string;
  };
}

async function runChatWithTools(
  request: BackgroundJobRow['request_payload'],
  userId: string,
  signal: AbortSignal
): Promise<{ content: string; toolsUsed: string[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const client = new Anthropic({ apiKey });
  const toolsUsed: string[] = [];

  // Build context (same logic as chat.ts)
  let systemPrompt = getSystemPrompt(request.personaId);
  let brandContext = '';

  if (request.siteId) {
    try {
      brandContext = await getBrandContext(request.siteId);
    } catch { /* non-critical */ }
  }

  // Inject context items into last user message (same as chat.ts)
  const msgs = request.messages.map(m => ({ ...m }));
  if (request.contextItems && request.contextItems.length > 0) {
    const ctxText = request.contextItems
      .map(c => `### ${c.label} (${c.type})\n${c.content.slice(0, 100000)}`)
      .join('\n\n---\n\n');
    const lastIdx = msgs.length - 1;
    if (lastIdx >= 0 && msgs[lastIdx].role === 'user') {
      msgs[lastIdx] = {
        ...msgs[lastIdx],
        content: `Pouzivatel prilozil nasledujuce dokumenty/subory do kontextu:\n\n${ctxText}\n\n---\n\n${msgs[lastIdx].content}`,
      };
    }
  }

  // Agent detection — brain-router primary (Sprint D), legacy fallback
  const lastUserMsg = msgs.filter(m => m.role === 'user').pop()?.content || '';
  const routeResult = routeByKeyword(lastUserMsg);
  if (routeResult) {
    const reg = agentRegistry.resolveForChat(routeResult.agentId);
    if (reg) {
      systemPrompt += `\n\n## Active Agent: ${reg.def.nameLocalized}\n${reg.prompt}`;
      if (reg.subAgentContext) systemPrompt += `\n\n---\n${reg.subAgentContext}`;
    }
  }
  if (brandContext) {
    systemPrompt += `\n\n## Brand Context\n${brandContext}`;
  }

  const messages: Anthropic.MessageParam[] = msgs.map(m => ({
    role: m.role,
    content: m.content,
  }));

  let textBuffer = '';
  let continueLoop = true;
  const maxIterations = 10;
  let iteration = 0;

  while (continueLoop && iteration < maxIterations) {
    if (signal.aborted) throw new Error('Job cancelled');
    iteration++;

    const stream = client.messages.stream({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
      max_tokens: parseInt(process.env.CLAUDE_MAX_TOKENS || '64000'),
      system: systemPrompt,
      messages,
      tools: [...AVAILABLE_TOOLS, WEB_SEARCH_TOOL as any],
    }, { signal } as { signal: AbortSignal });

    const response = await stream.finalMessage();

    // Collect text content
    for (const block of response.content) {
      if (block.type === 'text') {
        textBuffer += block.text;
      }
    }

    // Check for tool uses
    const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

    if (toolUseBlocks.length > 0 && response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        if (signal.aborted) throw new Error('Job cancelled');
        toolsUsed.push(toolUse.name);
        textBuffer += `\n\n🔧 *Executing ${toolUse.name}...*\n\n`;
        const result = await executeTool(toolUse.name, toolUse.input as Record<string, any>, userId);
        result.tool_use_id = toolUse.id;
        toolResults.push(result);
      }

      messages.push({ role: 'user', content: toolResults });
      continueLoop = true;
    } else {
      continueLoop = false;
    }
  }

  if (iteration >= maxIterations) {
    textBuffer += '\n\n⚠️ *Reached maximum tool iterations*';
  }

  return { content: textBuffer, toolsUsed };
}

export async function runBackgroundJob(jobId: string): Promise<void> {
  // Load job from DB
  const job = await queryOne<BackgroundJobRow>(
    'SELECT id, user_id, conversation_id, title, request_payload FROM background_jobs WHERE id = $1',
    [jobId]
  );
  if (!job) {
    console.error(`[BG Runner] Job ${jobId} not found`);
    return;
  }

  // Check if job was cancelled before we started
  const status = await queryOne<{ status: string }>('SELECT status FROM background_jobs WHERE id = $1', [jobId]);
  if (status?.status !== 'pending') return;

  // Mark as running
  await dbQuery('UPDATE background_jobs SET status = $1, started_at = NOW() WHERE id = $2', ['running', jobId]);

  const controller = new AbortController();
  runningJobs.set(jobId, controller);

  // Set 5-minute hard timeout
  const timeoutHandle = setTimeout(async () => {
    if (runningJobs.has(jobId)) {
      controller.abort();
      await dbQuery(
        'UPDATE background_jobs SET status = $1, error_message = $2, completed_at = NOW() WHERE id = $3',
        ['error', 'Job timed out after 15 minutes', jobId]
      );
      runningJobs.delete(jobId);
      console.log(`[BG Runner] Job ${jobId} timed out`);
    }
  }, JOB_TIMEOUT_MS);

  try {
    console.log(`[BG Runner] Starting job ${jobId}: "${job.title}"`);
    const { content, toolsUsed } = await runChatWithTools(
      job.request_payload,
      job.user_id,
      controller.signal
    );

    clearTimeout(timeoutHandle);
    if (controller.signal.aborted) return;

    // Save result to DB
    await dbQuery(
      `UPDATE background_jobs
       SET status = 'completed', result_content = $1, tools_used = $2, completed_at = NOW()
       WHERE id = $3`,
      [content, JSON.stringify(toolsUsed), jobId]
    );

    // If linked to a conversation, save the assistant message
    if (job.conversation_id) {
      await dbQuery(
        `INSERT INTO messages (conversation_id, role, content)
         VALUES ($1, 'assistant', $2)`,
        [job.conversation_id, content]
      );
      await dbQuery(
        'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
        [job.conversation_id]
      );
    }

    console.log(`[BG Runner] Job ${jobId} completed (${toolsUsed.length} tools used)`);
  } catch (err: any) {
    clearTimeout(timeoutHandle);
    const isCancelled = err?.message === 'Job cancelled' || controller.signal.aborted;

    if (!isCancelled) {
      await dbQuery(
        'UPDATE background_jobs SET status = $1, error_message = $2, completed_at = NOW() WHERE id = $3',
        ['error', err?.message || 'Unknown error', jobId]
      );
      console.error(`[BG Runner] Job ${jobId} failed:`, err?.message);
    } else {
      await dbQuery(
        'UPDATE background_jobs SET status = $1, completed_at = NOW() WHERE id = $2',
        ['cancelled', jobId]
      );
      console.log(`[BG Runner] Job ${jobId} cancelled`);
    }
  } finally {
    runningJobs.delete(jobId);
  }
}

export function cancelJob(jobId: string): boolean {
  const controller = runningJobs.get(jobId);
  if (controller) {
    controller.abort();
    runningJobs.delete(jobId);
    return true;
  }
  return false;
}

export { MAX_CONCURRENT };
