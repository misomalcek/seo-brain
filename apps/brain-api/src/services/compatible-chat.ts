import { executeTool } from '../tools/executor';
import type { ChatRequest, RequestMetrics } from './claude';
import { normalizeEndpointBase } from './settings';

type ToolDef = { name: string; description?: string; input_schema?: unknown };

type OaiMessage = {
  role: string;
  content?: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

function headers(): Record<string, string> {
  const out: Record<string, string> = {
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://aisvet.sk',
    'X-Title': 'SEO Brain',
  };
  const key = process.env.SEO_BRAIN_ENDPOINT_API_KEY || '';
  if (key) out.Authorization = `Bearer ${key}`;
  return out;
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(part => {
    if (typeof part === 'string') return part;
    if (part && typeof part === 'object' && 'text' in part) return String((part as { text?: unknown }).text || '');
    return '';
  }).join('');
}

async function postCompletion(url: string, body: string): Promise<{ status: number; retryAfter: number; json: any; raw: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body,
    signal: AbortSignal.timeout(240000),
  });
  const raw = await res.text();
  let json: any = null;
  try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }
  return { status: res.status, retryAfter: Number(res.headers.get('retry-after') || '0'), json, raw };
}

export async function* streamCompatibleChat(
  request: ChatRequest,
  baseTools: ToolDef[],
  systemPrompt: string,
  startTime: number,
): AsyncGenerator<string | { type: 'tool_use'; name: string; input: any } | RequestMetrics> {
  const base = normalizeEndpointBase(process.env.SEO_BRAIN_ENDPOINT_BASE_URL || '');
  let model = (process.env.SEO_BRAIN_ENDPOINT_MODEL || '').trim();
  if (!base) {
    yield 'The compatible endpoint is selected, but the base URL is empty.';
    return;
  }
  const root = base.endsWith('/v1') ? base : `${base}/v1`;
  if (!model) {
    const listed = await fetch(`${root}/models`, { headers: headers(), signal: AbortSignal.timeout(5000) }).then(r => r.json()).catch(() => null) as { data?: Array<{ id?: string }> } | null;
    model = listed?.data?.[0]?.id || '';
  }
  if (!model) {
    yield 'The compatible endpoint is selected, but no model name is set and the endpoint did not list one.';
    return;
  }
  const url = `${root}/chat/completions`;
  const messages: OaiMessage[] = [
    { role: 'system', content: systemPrompt },
    ...request.messages.map(m => ({ role: m.role, content: m.content })),
  ];
  let toolsOn = request.enableTools !== false && baseTools.length > 0;
  const tools = baseTools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description || t.name,
      parameters: t.input_schema || { type: 'object', properties: {} },
    },
  }));
  const toolNames: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  const maxIterations = Math.min(request.maxIterations || 6, 6);

  for (let i = 0; i < maxIterations; i++) {
    const payload: Record<string, unknown> = { model, messages, max_tokens: 1024 };
    if (toolsOn) payload.tools = tools;
    let result = await postCompletion(url, JSON.stringify(payload));
    if (result.status === 429) {
      const wait = Math.min(result.retryAfter > 0 ? result.retryAfter : 2, 8);
      yield `The endpoint is rate-limiting. Waiting ${wait}s, then one retry.\n\n`;
      await new Promise(r => setTimeout(r, wait * 1000));
      result = await postCompletion(url, JSON.stringify(payload));
    }
    if (!result.json && result.status >= 400) {
      yield `Endpoint returned ${result.status}: ${result.raw.slice(0, 240)}`;
      return;
    }
    if (result.status === 400 && toolsOn && /tool|function/i.test(result.raw)) {
      toolsOn = false;
      yield 'This model does not accept tools. Continuing with a plain reply.\n\n';
      i -= 1;
      continue;
    }
    if (result.status >= 400) {
      const message = result.json?.error?.message || result.raw.slice(0, 240);
      yield `Endpoint returned ${result.status}: ${message}`;
      return;
    }
    const choice = result.json?.choices?.[0];
    const message = choice?.message || {};
    inputTokens += Number(result.json?.usage?.prompt_tokens || 0);
    outputTokens += Number(result.json?.usage?.completion_tokens || 0);
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    const reply = textOf(message.content).trim() || (typeof message.reasoning === 'string' ? message.reasoning.trim() : '');
    if (!calls.length) {
      yield reply || 'The model returned an empty reply.';
      break;
    }
    if (reply) yield reply;
    messages.push({ role: 'assistant', content: message.content || '', tool_calls: calls });
    for (const call of calls) {
      const name = call.function?.name || '';
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.function?.arguments || '{}'); } catch { args = {}; }
      toolNames.push(name);
      yield { type: 'tool_use', name, input: args };
      const toolResult = await executeTool(name, args, request.userId, { role: request.userRole });
      messages.push({ role: 'tool', tool_call_id: call.id, content: String(toolResult.content || '') });
    }
  }

  const metrics: RequestMetrics = {
    type: 'metrics',
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    tools_loaded: toolsOn ? baseTools.length : 0,
    tool_calls: toolNames,
    agent_id: request.agentId || '',
    model,
    iterations: 1,
    estimated_context_tokens: 0,
    duration_ms: Date.now() - startTime,
  };
  console.log(`[prompt] tokens in=${inputTokens} out=${outputTokens} model=${model}`);
  yield metrics;
}
