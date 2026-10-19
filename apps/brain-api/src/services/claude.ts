import Anthropic from '@anthropic-ai/sdk';
import { AVAILABLE_TOOLS, WEB_SEARCH_TOOL, SELF_MGMT_TOOL_NAMES } from '../tools/definitions';
import { isAnyAdmin } from '../middleware/auth';
import { executeTool } from '../tools/executor';
import { getSystemPrompt } from './persona';
import { query } from '../db/connection';
import { filterTools } from '../agents/registry.js';
import type { BrainMode } from './mode-controller.js';

// Lazy initialization - client created on first use after dotenv loads
let anthropic: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    console.log(`Creating Anthropic client, API key present: ${!!apiKey}`);
    anthropic = new Anthropic({
      apiKey: apiKey,
    });
  }
  return anthropic;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export type ModelOverride = 'default' | 'auto' | 'opus-4.5' | 'opus-4.6' | 'sonnet-4.5' | 'sonnet-4.6' | 'haiku-4.5';

const MODEL_MAP: Record<string, string> = {
  'opus-4.5': 'claude-opus-4-5-20251101',
  'opus-4.6': 'claude-opus-4-6',
  'sonnet-4.5': 'claude-sonnet-4-5-20250929',
  'sonnet-4.6': 'claude-sonnet-4-6',
  'haiku-4.5': 'claude-haiku-4-5-20251001',
  'sonnet': 'claude-sonnet-4-6',
  'sonnet-high': 'claude-sonnet-4-5-20250929', // Extended thinking capable; maps to 4.5 by design
  'opus': 'claude-opus-4-6',
  'haiku': 'claude-haiku-4-5-20251001',
};

/** Models that reliably support extended thinking (Anthropic API `thinking` param). */
const THINKING_CAPABLE_MODELS = new Set([
  'claude-sonnet-4-5-20250929',
  'claude-opus-4-5-20251101',
  'claude-3-7-sonnet-20250219',
]);

export function resolveModel(override?: ModelOverride, agentModel?: string): string {
  // Explicit model selection
  if (override && override !== 'default' && override !== 'auto') {
    return MODEL_MAP[override] || MODEL_MAP['sonnet-4.5'];
  }
  // Auto: use agent's preferred model
  if (override === 'auto' && agentModel) {
    return MODEL_MAP[agentModel] || MODEL_MAP['sonnet-4.5'];
  }
  // Default: env var or sonnet
  return process.env.CLAUDE_MODEL || MODEL_MAP['sonnet-4.5'];
}

// BrainMode imported from mode-controller.ts (Sprint C) — removed duplicate definition
export type { BrainMode };

export interface ChatRequest {
  messages: Message[];
  enableTools?: boolean;
  personaId?: string;
  brandContext?: string;
  memoryContext?: string;
  userId?: string;
  userRole?: string; // 'admin' | 'team_admin' | 'member' — gates self-management tools
  maxIterations?: number; // Override default 10 (e.g. 25 for master-planner)
  modelOverride?: ModelOverride;
  mode?: BrainMode; // Brain Pt. II Sprint 1: orthogonal 4-mode system (default/extended/fast/confirm)
  agentModel?: string; // Agent's preferred model (from frontmatter)
  agentId?: string; // Detected agent ID for metrics
  /**
   * Tool IDs this agent is allowed to use.
   * 'ALL' or undefined → full tool set (no filtering).
   * string[] → only these tools sent to Claude API.
   */
  agentToolIds?: string[] | 'ALL';
  temperature?: number; // Weaver-set temperature (0.3-0.8)
  conversationId?: string; // For Bronze tool_calls_log observability
  requestId?: string; // For Bronze tool_calls_log observability (one per chat request)
  /**
   * Enable extended thinking (Anthropic `thinking` param).
   * Auto-set for master-planner and brief agents when model is thinking-capable.
   * When enabled: temperature forced to 1, thinking blocks streamed as {type:'thinking_delta'}.
   */
  enableThinking?: boolean;
  /** Token budget for thinking (default 10000). Actual max_tokens will be budget + 8000 minimum. */
  thinkingBudget?: number;
}

// Metrics emitted at end of each request
export interface RequestMetrics {
  type: 'metrics';
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  tools_loaded: number;
  tool_calls: string[];
  agent_id: string;
  model: string;
  iterations: number;
  estimated_context_tokens: number;
  duration_ms: number;
}

// Token estimation: ~3.5 chars per token for mixed SK/EN content
function estimateTokens(messages: Anthropic.MessageParam[], system: string): number {
  let charCount = system.length;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      charCount += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if ('text' in block) charCount += (block as any).text.length;
        if ('content' in block) charCount += JSON.stringify((block as any).content).length;
      }
    }
  }
  return Math.ceil(charCount / 3.5);
}

// Compact old messages to prevent token overflow
// Keeps head (first 2 messages for context) + tail (last 4 for recency)
function compactMessages(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  if (messages.length <= 6) return messages;
  const head = messages.slice(0, 2);
  const tail = messages.slice(-4);
  const middleCount = messages.length - 6;
  const summaryMsg: Anthropic.MessageParam = {
    role: 'user',
    content: `[SYSTEM: ${middleCount} predchádzajúcich správ skompaktovaných kvôli token limitu. Kľúčové výsledky zachované v posledných správach.]`
  };
  return [...head, summaryMsg, ...tail];
}

// Token thresholds
const TOKEN_SAFE = 120000;
const TOKEN_WARNING = 150000;
const TOKEN_COMPACT = 150000;
const TOKEN_DANGER = 180000;

// Stream chat with tool use support
export async function* streamChatWithTools(request: ChatRequest): AsyncGenerator<string | { type: 'tool_use'; name: string; input: any } | RequestMetrics> {
  const startTime = Date.now();
  console.log('streamChatWithTools called, enableTools:', request.enableTools);

  const client = getClient();
  const messages: Anthropic.MessageParam[] = request.messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  let continueLoop = true;
  const maxIterations = request.maxIterations || 10;
  let iteration = 0;
  // Role-gated self-management toolset (computed once — agentToolIds + role are stable per
  // request). Admins get manage_agent/manage_persona appended even when routed to a restricted
  // specialist; non-admins get them stripped (closes a leak where 'ALL'-tool agents like Brief
  // exposed manage_agent to any user). Read-only get/list still pass — the executor gates writes.
  const isAdmin = isAnyAdmin(request.userRole);
  const SELF_MGMT: readonly string[] = SELF_MGMT_TOOL_NAMES;
  let baseTools = request.agentToolIds ? filterTools(request.agentToolIds) : AVAILABLE_TOOLS;
  if (isAdmin) {
    const have = new Set(baseTools.map(t => t.name));
    baseTools = [...baseTools, ...AVAILABLE_TOOLS.filter(t => SELF_MGMT.includes(t.name) && !have.has(t.name))];
  } else {
    baseTools = baseTools.filter(t => !SELF_MGMT.includes(t.name));
  }

  // Live-capability line — printed every turn so the model can never hallucinate that a tool
  // it has "doesn't exist" or that a real past tool call "was theater".
  const selfMgmtAvailable = baseTools.filter(t => SELF_MGMT.includes(t.name)).map(t => t.name);
  const capabilityLine = request.enableTools === false ? '' : `

## Live capability state (this turn)
Active agent: ${request.agentId ?? 'base Claude'}. Tools available NOW: ${baseTools.map(t => t.name).join(', ')}.
Self-management: ${selfMgmtAvailable.length ? `ENABLED via ${selfMgmtAvailable.join(', ')}` : (isAdmin ? 'no self-management tools loaded this turn' : 'disabled for this user')}.
Past tool results in this conversation are REAL — never claim a tool call you already made "did not happen" or "was theater".`;

  const systemPrompt = getSystemPrompt(request.personaId, request.brandContext, request.memoryContext, request.mode) + capabilityLine;

  // Metrics tracking
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;
  const toolCallNames: string[] = [];

  while (continueLoop && iteration < maxIterations) {
    iteration++;

    // Token safety check before each API call
    const estimatedTokens = estimateTokens(messages, systemPrompt);
    if (estimatedTokens > TOKEN_DANGER) {
      console.warn(`[Token Safety] DANGER: ~${estimatedTokens} tokens. Stopping tool loop.`);
      yield '\n\n⚠️ *Token limit approaching (~' + Math.round(estimatedTokens / 1000) + 'K). Sumarizujem výsledky.*';
      break;
    }
    if (estimatedTokens > TOKEN_COMPACT) {
      console.warn(`[Token Safety] COMPACT: ~${estimatedTokens} tokens. Compacting messages.`);
      const before = messages.length;
      const compacted = compactMessages(messages);
      messages.length = 0;
      messages.push(...compacted);
      console.log(`[Token Safety] Compacted ${before} → ${messages.length} messages`);
    } else if (estimatedTokens > TOKEN_WARNING) {
      console.warn(`[Token Safety] WARNING: ~${estimatedTokens} tokens`);
    }

    console.log(`Tool loop iteration ${iteration}/${maxIterations} (~${estimatedTokens} tokens)`);

    // Create message with or without tools
    const resolvedModel = resolveModel(request.modelOverride, request.agentModel);

    // Extended thinking: only engage on thinking-capable models; never on tool-result iterations
    const thinkingEnabled = request.enableThinking && THINKING_CAPABLE_MODELS.has(resolvedModel) && iteration === 1;
    const thinkingBudget = request.thinkingBudget || 10000;
    const configuredMaxTokens = parseInt(process.env.CLAUDE_MAX_TOKENS || '64000');
    // When thinking, max_tokens must exceed budget (Anthropic requirement)
    const effectiveMaxTokens = thinkingEnabled
      ? Math.max(configuredMaxTokens, thinkingBudget + 8000)
      : configuredMaxTokens;

    // OPT-1: Prompt caching — system prompt + tools schema cached (ephemeral 5min).
    // First request: cache_creation (25% cost). Subsequent: cache_read (90% off + NOT counted
    // toward tokens/min rate limit). Massive win for tool-loop chains on Tier 1.
    // Anthropic max 4 cache_control breakpoints — we use 2 (system + last tool).
    const cachedSystem: Anthropic.TextBlockParam[] = [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } } as any,
    ];

    const createParams: Anthropic.MessageCreateParams = {
      model: resolvedModel,
      max_tokens: effectiveMaxTokens,
      system: cachedSystem as any,
      messages: messages,
      // Thinking forces temperature=1; otherwise use Weaver temperature
      ...(thinkingEnabled
        ? { temperature: 1 }
        : request.temperature !== undefined && { temperature: request.temperature }),
    };

    // Extended thinking param
    if (thinkingEnabled) {
      (createParams as any).thinking = { type: 'enabled', budget_tokens: thinkingBudget };
      console.log(`[Thinking] Enabled for ${request.agentId}, budget=${thinkingBudget}, model=${resolvedModel}`);
    }

    // Only include tools if enabled; baseTools (role-gated) was computed once above.
    if (request.enableTools !== false) {
      const allTools = [...baseTools, WEB_SEARCH_TOOL as any];
      // OPT-1 cont.: cache_control on LAST tool — Anthropic caches up to and including this block
      if (allTools.length > 0) {
        const lastIdx = allTools.length - 1;
        allTools[lastIdx] = { ...allTools[lastIdx], cache_control: { type: 'ephemeral' } } as any;
      }
      createParams.tools = allTools;
    }

    // OPT-3: Retry-on-429 with exponential backoff + Retry-After respect.
    // Tier 1 has 30k input tokens/min — long tool chains can spike past it momentarily.
    // We retry up to 3 times, total max ~80s wait.
    let stream: any;
    let retryAttempt = 0;
    const maxRetries = 3;
    while (true) {
      try {
        stream = await client.messages.stream(createParams);
        break;
      } catch (err: any) {
        const status = err?.status ?? err?.response?.status;
        const isRateLimit = status === 429 || err?.error?.type === 'rate_limit_error';
        if (isRateLimit && retryAttempt < maxRetries) {
          retryAttempt++;
          // Honour Retry-After header if present, else exponential backoff (5s, 15s, 30s)
          const retryAfterSec = parseInt(err?.headers?.['retry-after'] ?? '0', 10);
          const waitMs = retryAfterSec > 0
            ? Math.min(retryAfterSec * 1000, 60_000)
            : Math.min(5000 * Math.pow(3, retryAttempt - 1), 30_000);
          console.warn(`[Rate Limit] 429 hit, retry ${retryAttempt}/${maxRetries} after ${waitMs}ms`);
          yield `\n\n⏳ *Rate limit, čakám ${Math.round(waitMs/1000)}s a skúšam znova (${retryAttempt}/${maxRetries})…*\n\n`;
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        // Billing / credit exhaustion — detect ONLY a real API billing error
        // (never an estimate). Anthropic returns 400/403 with a message mentioning
        // credit/billing/balance. Degrade gracefully: clean SK message, no crash.
        const msg = String(err?.error?.message ?? err?.message ?? '');
        const isBilling = (status === 400 || status === 403) && /credit|billing|balance/i.test(msg);
        if (isBilling) {
          console.error('[BILLING] Anthropic credit/billing error — chat cannot complete:', msg);
          yield '\n\n⚠️ *Brain dočasne nemôže odpovedať — vyčerpaný API kredit. Prosím kontaktujte administrátora.*\n\n';
          return;
        }
        throw err;
      }
    }

    let hasToolUse = false;
    const toolUses: Array<{ id: string; name: string; input: any }> = [];
    let textContent = '';
    let thinkingText = '';
    let inThinkingBlock = false;

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        const block = event.content_block as any;
        if (block.type === 'thinking') {
          inThinkingBlock = true;
          yield { type: 'thinking_start' } as any;
        } else if (block.type === 'tool_use') {
          inThinkingBlock = false;
          hasToolUse = true;
          console.log(`Tool use started: ${block.name}`);
          yield { type: 'tool_use', name: block.name, input: {} };
        }
      } else if (event.type === 'content_block_delta') {
        const delta = event.delta as any;
        if (delta.type === 'thinking_delta') {
          thinkingText += delta.thinking || '';
          // Yield thinking chunks so frontend can optionally display a "thinking..." indicator
          yield { type: 'thinking_delta', text: delta.thinking || '' } as any;
        } else if (delta.type === 'text_delta') {
          textContent += delta.text;
          yield delta.text;
        }
      } else if (event.type === 'content_block_stop') {
        if (inThinkingBlock) {
          inThinkingBlock = false;
          console.log(`[Thinking] Block complete: ${thinkingText.length} chars`);
          yield { type: 'thinking_end', chars: thinkingText.length } as any;
        }
      } else if (event.type === 'message_delta') {
        if ((event.delta as any).stop_reason === 'tool_use') {
          console.log('Message stopped for tool use');
        }
      }
    }

    // Get the final message to extract tool uses
    const finalMessage = await stream.finalMessage();

    // Track token usage from API response
    if (finalMessage.usage) {
      totalInputTokens += finalMessage.usage.input_tokens || 0;
      totalOutputTokens += finalMessage.usage.output_tokens || 0;
      cacheCreationTokens += (finalMessage.usage as any).cache_creation_input_tokens || 0;
      cacheReadTokens += (finalMessage.usage as any).cache_read_input_tokens || 0;
    }

    // Check for tool uses in final message
    for (const block of finalMessage.content) {
      if (block.type === 'tool_use') {
        toolUses.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, any>
        });
      }
    }

    // If there are tool uses, execute them and continue
    if (toolUses.length > 0) {
      console.log(`Executing ${toolUses.length} tools`);

      // Add assistant message with tool uses
      messages.push({
        role: 'assistant',
        content: finalMessage.content
      });

      // OPT-2: Parallel tool execution.
      // When Claude returns N tool_use blocks in one assistant response (it does this when
      // tools are independent), running them in parallel cuts wall-clock time by ~N× and
      // keeps the rate-limit window short. Sequential `for` was waiting on each in series.
      // Yield status BEFORE Promise.all so UI shows all spinners up front.
      for (const t of toolUses) {
        yield `\n\n🔧 *Executing ${t.name}...*\n\n`;
        toolCallNames.push(t.name);
      }
      console.log(`Executing ${toolUses.length} tools in parallel`);

      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUses.map(async (toolUse) => {
          try {
            console.log(`→ tool: ${toolUse.name}`, toolUse.input);
            const result = await executeTool(toolUse.name, toolUse.input, request.userId, {
              agentId: request.agentId,
              conversationId: request.conversationId,
              requestId: request.requestId,
              model: resolvedModel,
              role: request.userRole,
            });
            result.tool_use_id = toolUse.id;
            console.log(`✓ tool ${toolUse.name} completed`);
            return result;
          } catch (e: any) {
            // Don't crash the whole loop on a single tool failure — return error as tool result
            console.error(`✗ tool ${toolUse.name} failed: ${e?.message}`);
            return {
              type: 'tool_result' as const,
              tool_use_id: toolUse.id,
              content: `Tool ${toolUse.name} failed: ${e?.message || String(e)}`,
              is_error: true,
            };
          }
        })
      );

      // Add tool results as user message
      messages.push({
        role: 'user',
        content: toolResults
      });

      // Continue loop to get Claude's response to tool results
      continueLoop = true;
    } else {
      // No tool uses, we're done
      continueLoop = false;
    }
  }

  if (iteration >= maxIterations) {
    yield '\n\n⚠️ *Reached maximum tool iterations*';
  }

  // Emit metrics
  const resolvedModel = resolveModel(request.modelOverride, request.agentModel);
  const toolsLoaded = request.enableTools !== false ? AVAILABLE_TOOLS.length + 1 : 0; // +1 for WEB_SEARCH_TOOL
  const estimatedContext = estimateTokens(messages, systemPrompt);
  const durationMs = Date.now() - startTime;

  const metrics: RequestMetrics = {
    type: 'metrics',
    input_tokens: totalInputTokens,
    output_tokens: totalOutputTokens,
    cache_creation_input_tokens: cacheCreationTokens,
    cache_read_input_tokens: cacheReadTokens,
    tools_loaded: toolsLoaded,
    tool_calls: toolCallNames,
    agent_id: request.agentId || '',
    model: resolvedModel,
    iterations: iteration,
    estimated_context_tokens: estimatedContext,
    duration_ms: durationMs,
  };

  // Bronze observability — fire-and-forget INSERT into agent_runs hypertable (migration 034)
  // Per-request roll-up complement to per-tool-call tool_calls_log
  void (async () => {
    try {
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const userIdSafe = request.userId && uuidRe.test(request.userId) ? request.userId : null;
      const convIdSafe = request.conversationId && uuidRe.test(request.conversationId) ? request.conversationId : null;
      const reqIdSafe = request.requestId && uuidRe.test(request.requestId) ? request.requestId : null;
      await query(
        `INSERT INTO agent_runs
          (request_id, conversation_id, user_id, agent_id, model_used, mode, persona_id,
           tools_loaded, tool_calls_count, iterations,
           input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens,
           estimated_context_tokens, total_duration_ms, success)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          reqIdSafe, convIdSafe, userIdSafe,
          request.agentId || null, resolvedModel,
          request.mode || null, request.personaId || null,
          toolsLoaded, toolCallNames.length, iteration,
          totalInputTokens, totalOutputTokens, cacheCreationTokens, cacheReadTokens,
          estimatedContext, durationMs, true,
        ]
      );
    } catch (err) {
      console.warn(`[agent_runs] insert failed: ${String(err).slice(0, 200)}`);
    }
  })();

  // Structured log for observability
  const contextPct = Math.round((totalInputTokens / 200000) * 100);
  console.log(`[Metrics] ${JSON.stringify({
    agent: request.agentId || 'none',
    model: resolvedModel,
    input_tokens: totalInputTokens,
    output_tokens: totalOutputTokens,
    cache_create: cacheCreationTokens,
    cache_read: cacheReadTokens,
    tools_loaded: toolsLoaded,
    tool_calls: toolCallNames.length,
    tools: toolCallNames,
    iterations: iteration,
    context_pct: contextPct,
    duration_ms: durationMs,
  })}`);

  if (contextPct > 80) {
    console.warn(`[Token Safety] ⚠️ Context usage ${contextPct}% (${totalInputTokens} tokens) — approaching limit`);
  }

  yield metrics;
}

// Simple stream without tools (backwards compatible)
export async function* streamChat(request: ChatRequest): AsyncGenerator<string> {
  for await (const chunk of streamChatWithTools({ ...request, enableTools: false })) {
    if (typeof chunk === 'string') {
      yield chunk;
    }
  }
}

// Non-streaming chat (for completeness)
export async function chat(request: ChatRequest): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of streamChatWithTools(request)) {
    if (typeof chunk === 'string') {
      chunks.push(chunk);
    }
  }
  return chunks.join('');
}

// Get system prompt breakdown for admin visibility
export function getSystemPromptBreakdown(personaId?: string, brandContext?: string): Record<string, number> {
  const base = getSystemPrompt(personaId, brandContext);
  const baseTokens = Math.ceil(base.length / 3.5);
  return {
    system_prompt_chars: base.length,
    system_prompt_tokens_est: baseTokens,
    context_window: 200000,
    system_pct: Math.round((baseTokens / 200000) * 100),
  };
}
