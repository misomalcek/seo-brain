import { Router, Request, Response } from 'express';
import { streamChatWithTools, ChatRequest, RequestMetrics } from '../services/claude';
import { AVAILABLE_TOOLS, TOOL_CATEGORIES, QUICK_ACTIONS } from '../tools/definitions';
import { isAhrefsConfigured } from '../tools/executor';
import { getAllPersonas, runMultiPersonaAnalysis, getBrandContext } from '../services/persona';
import { weave, getMentionsForPalette } from '../services/knowledge';
import { resolveAction } from '../services/action-resolver';
import { getActionsForPalette, ACTION_CATEGORIES } from '../config/action-registry';
import { getWorkflowsForPalette } from '../services/workflow-engine';
import { loadRelevantMemories, extractMemories, rememberFromCommand } from '../services/brain-memory';

export const chatRouter = Router();

// Pre-compiled legacy slash command redirects (avoid regex compilation on every request)
const LEGACY_REDIRECTS = [
  { regex: /^\/content-gap(?:\s+(.+))?$/i, newPath: '/content/discover' },
  { regex: /^\/seo-audit(?:\s+(.+))?$/i, newPath: '/seo/audit' },
  { regex: /^\/traffic-drivers(?:\s+(.+))?$/i, newPath: '/ahrefs/domain' },
  { regex: /^\/ranking-distribution(?:\s+(.+))?$/i, newPath: '/seo/keywords' },
  { regex: /^\/position-volatility(?:\s+(.+))?$/i, newPath: '/gsc/performance' },
];

// GET /chat/personas - List available personas
chatRouter.get('/personas', (_req: Request, res: Response) => {
  const personas = getAllPersonas().map(p => ({
    id: p.id,
    name: p.name,
    nameLocalized: p.nameLocalized,
    description: p.description,
    icon: p.icon,
    color: p.color,
    decisionPhases: p.decisionPhases,
    traits: p.traits,
  }));
  res.json({ personas });
});

// POST /chat/deliberate - Multi-persona deliberation
chatRouter.post('/deliberate', async (req: Request, res: Response) => {
  try {
    const { question, personas: personaIds, context } = req.body as {
      question: string;
      personas: string[];
      context?: string;
    };

    if (!question || !personaIds || !Array.isArray(personaIds) || personaIds.length < 2) {
      res.status(400).json({ error: 'question and at least 2 personas are required' });
      return;
    }

    if (personaIds.length > 4) {
      res.status(400).json({ error: 'Maximum 4 personas per deliberation' });
      return;
    }

    const results = await runMultiPersonaAnalysis(question, personaIds, context);

    res.json({
      question,
      responses: results.map(r => ({
        personaId: r.personaId,
        name: r.persona.name,
        nameLocalized: r.persona.nameLocalized,
        icon: r.persona.icon,
        color: r.persona.color,
        content: r.content,
      })),
    });
  } catch (error) {
    console.error('Deliberation error:', error);
    res.status(500).json({
      error: 'Deliberation failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /chat/actions - List available actions for ActionPalette
chatRouter.get('/actions', (_req: Request, res: Response) => {
  res.json({
    actions: getActionsForPalette(),
    categories: ACTION_CATEGORIES,
    workflows: getWorkflowsForPalette(),
  });
});

// GET /chat/mentions - List mentionable entities for MentionsPalette
chatRouter.get('/mentions', (_req: Request, res: Response) => {
  res.json({ categories: getMentionsForPalette() });
});

// POST /chat - Streaming chat endpoint with tool support
chatRouter.post('/', async (req: Request, res: Response) => {
  console.log('POST /chat received');
  try {
    // Tools enabled by default - uses MCP Bridge (Claude Code CLI)
    interface ContextItemInput { type: string; label: string; content: string }
    const { messages, enableTools = true, personaId, siteId, contextItems, modelOverride, mode } = req.body as ChatRequest & {
      enableTools?: boolean;
      siteId?: string;
      contextItems?: ContextItemInput[];
      modelOverride?: string;
      mode?: 'default' | 'extended' | 'fast' | 'confirm' | string;  // string accepts legacy values, coerced server-side
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Messages array is required' });
      return;
    }

    // /remember command — save to brain_memories DB and respond immediately
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'user' && typeof lastMsg.content === 'string') {
      const rememberMatch = lastMsg.content.match(/^\/remember\s+(.+)/is);
      if (rememberMatch) {
        const memoryText = rememberMatch[1].trim();
        const userId = req.user?.userId;
        const conversationId = req.body.conversationId;

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        try {
          const result = await rememberFromCommand(memoryText, userId || 'unknown', conversationId);
          console.log(`[/remember] Saved memory ${result.memory.id} by user ${userId}`);
          res.write(`data: ${JSON.stringify({ text: `Zapamatal som si to. Ulozene do Brain Memory (${result.memory.category}). ${result.memory.is_active ? 'Aktivne ihned.' : 'Admin moze schvalit cez Admin > Memory.'}` })}\n\n`);
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
          return;
        } catch (err) {
          console.error('[/remember] Failed:', err);
          res.write(`data: ${JSON.stringify({ text: 'Nepodarilo sa ulozit do pamate. Skus to znova.' })}\n\n`);
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
          return;
        }
      }
    }

    // Legacy slash commands → redirect to new action paths
    if (lastMsg?.role === 'user' && typeof lastMsg.content === 'string') {
      for (const { regex, newPath } of LEGACY_REDIRECTS) {
        const cmdMatch = lastMsg.content.match(regex);
        if (cmdMatch) {
          const input = cmdMatch[1]?.trim() || '';
          lastMsg.content = `${newPath} ${input}`.trim();
          break;
        }
      }
    }

    // Reject oversized messages (generous limit for small team)
    const totalSize = messages.reduce((sum: number, m: any) => sum + (m.content?.length || 0), 0);
    const contextSize = contextItems?.reduce((sum: number, c: ContextItemInput) => sum + (c.content?.length || 0), 0) || 0;
    if (totalSize > 10_000_000) {
      console.log(`Rejected oversized request: ${(totalSize / 1024 / 1024).toFixed(1)}MB messages`);
      res.status(413).json({ error: 'Message content too large (max 10MB)' });
      return;
    }

    console.log(`Processing ${messages.length} messages, tools: ${enableTools}, persona: ${personaId || 'default'}, site: ${siteId || 'none'}, context: ${contextItems?.length || 0} items (${(contextSize / 1024).toFixed(1)}KB)`);

    // Fetch brand context if site specified
    let brandContext: string | undefined;
    if (siteId) {
      try {
        brandContext = await getBrandContext(siteId);
      } catch (err) {
        console.error('Failed to load brand context:', err);
      }
    }

    // Load brain memories (domain-filtered, budget-capped)
    let memoryContext: string | undefined;
    const conversationId = req.body.conversationId;
    try {
      const userMessage = lastMsg?.role === 'user' && typeof lastMsg.content === 'string' ? lastMsg.content : '';
      const currentDomain = siteId || undefined;
      memoryContext = await loadRelevantMemories(userMessage, currentDomain, conversationId);
    } catch (err) {
      console.error('Failed to load brain memories:', err);
    }

    // Semantic RAG — inject relevant articles + brain knowledge from vector DB
    let ragContext: string | undefined;
    try {
      const userMessage = lastMsg?.role === 'user' && typeof lastMsg.content === 'string' ? lastMsg.content : '';
      if (userMessage.length > 20) {
        const { searchHybrid, searchBrain } = await import('../services/vector');

        // Run article search and brain search in parallel with shared timeout
        const [articleResults, brainResults] = await Promise.race([
          Promise.all([
            searchHybrid(userMessage, { limit: 3, minScore: 0.3, domain: siteId || undefined }),
            searchBrain(userMessage, { types: ['knowledge', 'brand', 'agent', 'template'], limit: 4, minScore: 0.35 }),
          ]),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('RAG timeout')), 3000)),
        ]);

        const parts: string[] = [];

        if (articleResults.length > 0) {
          const articleParts = articleResults.map(r =>
            `### ${r.title} (${r.domain})\n${r.content_md?.slice(0, 1200) || ''}`
          );
          parts.push(`## Relevantné články z našich webov\n${articleParts.join('\n\n---\n\n')}`);
        }

        if (brainResults.length > 0) {
          const brainParts = brainResults.map(r =>
            `### ${r.title} [${r.source_type}]\n${r.content_chunk.slice(0, 800)}`
          );
          parts.push(`## Relevantné znalosti\n${brainParts.join('\n\n')}`);
        }

        if (parts.length > 0) {
          ragContext = '\n\n' + parts.join('\n\n');
          console.log(`[RAG] Injected ${articleResults.length} articles + ${brainResults.length} brain items (${ragContext.length} chars)`);
        }
      }
    } catch (err) {
      if ((err as Error).message !== 'RAG timeout') {
        console.error('RAG failed:', err);
      }
    }

    // Build context from context items - inject into messages, NOT system prompt
    // This ensures Claude sees attached files as conversation content, not hidden instructions
    let contextPrefix = '';
    if (contextItems && contextItems.length > 0) {
      const maxPerItem = 100 * 1024; // 100KB per item
      const parts = contextItems
        .filter(item => item.content)
        .map(item => `### ${item.label} (${item.type})\n${item.content.slice(0, maxPerItem)}`);

      if (parts.length > 0) {
        contextPrefix = `Pouzivatel prilozil nasledujuce dokumenty/subory do kontextu:\n\n${parts.join('\n\n---\n\n')}\n\n---\n\n`;
      }
    }

    // If context items exist, prepend them to the last user message
    const enrichedMessages = [...messages];
    if (contextPrefix && enrichedMessages.length > 0) {
      const lastIdx = enrichedMessages.length - 1;
      if (enrichedMessages[lastIdx].role === 'user') {
        enrichedMessages[lastIdx] = {
          ...enrichedMessages[lastIdx],
          content: contextPrefix + enrichedMessages[lastIdx].content,
        };
        console.log(`Injected ${contextItems!.length} context items into user message (${(contextPrefix.length / 1024).toFixed(1)}KB)`);
      }
    }

    // Unified action/agent resolution (single pipeline)
    const lastUserMsg = enrichedMessages[enrichedMessages.length - 1];
    const userMsgContent = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : '';
    const resolved = resolveAction(userMsgContent, siteId);

    let agentContext = resolved.agentContext;
    let detectedAgentId = resolved.agentId || '';

    // If action matched, rewrite the user message with structured prompt
    if (resolved.rewrittenMessage && enrichedMessages.length > 0) {
      const lastIdx = enrichedMessages.length - 1;
      enrichedMessages[lastIdx] = {
        ...enrichedMessages[lastIdx],
        content: resolved.rewrittenMessage,
      };
    }

    if (resolved.source !== 'none') {
      console.log(`[resolveAction] ${resolved.source}: ${detectedAgentId || 'no agent'} (${resolved.agentName || 'base Claude'})`);
    }

    // Set headers for SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // System context: brand + agent separated by clear headings (NOT file context - that goes in messages)
    const parts: string[] = [];
    if (brandContext) parts.push(brandContext);
    if (agentContext) parts.push(agentContext);
    const systemContext = parts.length > 0 ? parts.join('\n\n---\n') : undefined;

    // Master Planner gets extended tool loop (25 iterations vs default 10)
    const maxIterations = resolved.maxIterations;

    // Weaver: model routing (only when user hasn't manually selected a model)
    let agentModel: string | undefined;
    const isMasterAgent = detectedAgentId === 'master-planner';
    const weaverDecision = weave(
      userMsgContent,
      !!detectedAgentId,
      isMasterAgent
    );

    // Apply Weaver only when no manual override
    if (!modelOverride || modelOverride === 'default' || modelOverride === 'auto') {
      if (weaverDecision.model === 'haiku') {
        agentModel = 'haiku';
      } else if (weaverDecision.model === 'sonnet-high') {
        agentModel = 'sonnet'; // same model, temperature handled separately
      }
      console.log(`[Weaver] ${weaverDecision.model} (${weaverDecision.reason}) for: "${userMsgContent.substring(0, 50)}..."`);
    } else if (resolved.agentModel) {
      agentModel = resolved.agentModel;
    }

    // Send agent activation event BEFORE streaming starts
    if (detectedAgentId) {
      res.write(`data: ${JSON.stringify({
        agent: detectedAgentId,
        agentName: resolved.agentName || detectedAgentId,
        agentColor: resolved.agentColor || 'gray'
      })}\n\n`);
    }

    const userId = req.user?.userId;
    let requestMetrics: RequestMetrics | null = null;
    // Combine memory + RAG into one context block
    const fullMemoryContext = [memoryContext, ragContext].filter(Boolean).join('\n') || undefined;

    // Generate requestId for Bronze observability (one per chat request)
    const requestId = (globalThis.crypto?.randomUUID?.() ?? require('crypto').randomUUID());

    // Extended thinking: auto-enable for planning agents on thinking-capable model path
    const enableThinking = detectedAgentId === 'master-planner' || detectedAgentId === 'brief';
    const thinkingBudget = detectedAgentId === 'master-planner' ? 10000 : 8000;

    // Client-disconnect / Stop button (handoff 2026-06-29) — when the
    // browser aborts the fetch (Stop in ChatFooter), Express fires 'close'.
    // We flip a flag the streaming loop checks each chunk to break early;
    // this stops further SSE writes + further tool-loop iterations. The
    // currently in-flight Anthropic call and any tool already executing
    // still finish (we don't have a cancellation handle for them yet) —
    // documented gap. Follow-up: thread AbortSignal into streamChatWithTools
    // + tool executors so mid-call cost is also cancelled.
    let clientAborted = false;
    req.on('close', () => {
      if (!res.writableEnded) {
        clientAborted = true;
        console.log(`[chat] client aborted requestId=${requestId}`);
      }
    });

    for await (const chunk of streamChatWithTools({ messages: enrichedMessages, enableTools, personaId, brandContext: systemContext, memoryContext: fullMemoryContext, userId, maxIterations, modelOverride: modelOverride as any, agentModel, agentId: detectedAgentId || undefined, agentToolIds: resolved.agentToolIds, temperature: weaverDecision.temperature, mode, conversationId, requestId, enableThinking, thinkingBudget, userRole: req.user?.role })) {
      if (clientAborted) break;
      if (typeof chunk === 'string') {
        // Text content
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      } else if ('type' in chunk && chunk.type === 'tool_use') {
        // Tool use notification
        res.write(`data: ${JSON.stringify({ tool: chunk.name, status: 'executing' })}\n\n`);
      } else if ('type' in chunk && (chunk as any).type === 'thinking_start') {
        res.write(`data: ${JSON.stringify({ thinking: 'start' })}\n\n`);
      } else if ('type' in chunk && (chunk as any).type === 'thinking_end') {
        res.write(`data: ${JSON.stringify({ thinking: 'end', chars: (chunk as any).chars })}\n\n`);
      } else if ('type' in chunk && (chunk as any).type === 'thinking_delta') {
        // Not forwarded to client — thinking is internal; only start/end events surface
      } else if ('type' in chunk && chunk.type === 'metrics') {
        // Metrics from claude.ts — send to client for admin visibility
        requestMetrics = chunk as RequestMetrics;
      }
    }

    // Send done event with metrics
    const donePayload: Record<string, any> = { done: true };
    if (requestMetrics) {
      donePayload.metrics = {
        input_tokens: requestMetrics.input_tokens,
        output_tokens: requestMetrics.output_tokens,
        tool_calls: requestMetrics.tool_calls.length,
        tools_used: requestMetrics.tool_calls,
        agent_id: requestMetrics.agent_id,
        model: requestMetrics.model,
        duration_ms: requestMetrics.duration_ms,
      };
    }
    res.write(`data: ${JSON.stringify(donePayload)}\n\n`);
    res.end();

    // Fire-and-forget: extract memories from substantive conversations
    // Criteria: ≥4 message pairs OR ≥1 tool call
    const msgPairs = Math.floor(enrichedMessages.length / 2);
    const toolCallCount = requestMetrics?.tool_calls?.length || 0;
    if (msgPairs >= 4 || toolCallCount >= 1) {
      extractMemories(enrichedMessages, conversationId, userId).catch(err => {
        console.error('[BUM] Memory extraction failed:', err);
      });
    }

  } catch (error) {
    console.error('Chat error:', error);

    // If headers not sent yet, send error response
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to process chat request',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    } else {
      // If streaming, send error in stream
      res.write(`data: ${JSON.stringify({ error: 'Stream interrupted', message: String(error) })}\n\n`);
      res.end();
    }
  }
});

// GET /chat/tools - Get available tools and categories
chatRouter.get('/tools', (_req: Request, res: Response) => {
  res.json({
    tools: AVAILABLE_TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.input_schema
    })),
    categories: TOOL_CATEGORIES,
    quickActions: QUICK_ACTIONS,
    status: {
      ahrefs: isAhrefsConfigured() ? 'configured' : 'not_configured'
    }
  });
});

// GET /chat/health - Health check for chat service
chatRouter.get('/health', (_req: Request, res: Response) => {
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  res.json({
    status: hasApiKey ? 'ok' : 'missing_api_key',
    service: 'claude-chat',
    tools: {
      enabled: true,
      method: 'MCP Bridge (Claude Code CLI)',
      ahrefs: isAhrefsConfigured() ? 'available' : 'unavailable'
    }
  });
});
