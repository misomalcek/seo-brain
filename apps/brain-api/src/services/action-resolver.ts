/**
 * Unified Action Resolver — single routing pipeline for all user input.
 * Replaces 3 parallel routing systems (slash commands, detectAgent, detectComplexity).
 *
 * Priority order:
 * 1. Action path match (/content/discover, /seo/audit, etc.)
 * 2. @mention (@seo-specialist, @master-planner)
 * 3. Complexity routing (multi-domain/multi-step → master planner)
 * 4. Keyword match (fallback heuristic from detectAgent)
 * 5. /remember command (special — handled before this resolver)
 * 6. No match → base Claude
 */

import { findAction, Action } from '../config/action-registry';
import { getAgentContent } from './knowledge';
import { loadWorkflowTemplates, buildWorkflowPrompt } from './workflow-engine';
import { agentRegistry } from '../agents/registry.js';
import { AVAILABLE_TOOLS } from '../tools/definitions.js';
import { routeByKeyword, routeByComplexity } from './brain-router.js';

// Complex tasks get extended iteration loop (was master-planner only, now any complex routing)
const COMPLEX_TASK_ITERATIONS = 25;

export interface ResolvedAction {
  agentId: string | null;
  agentName: string | null;
  agentColor: string | null;
  agentModel: string | null;    // Agent's configured model (avoids re-reading from disk)
  agentContext: string;          // Agent content to inject into system prompt
  /**
   * Tool IDs this agent is allowed to use.
   * 'ALL' = unrestricted (Brief, master-planner).
   * string[] = filtered set — claude.ts applies this to AVAILABLE_TOOLS.
   * undefined = no agent resolved → all tools (base Claude).
   */
  agentToolIds: string[] | 'ALL' | undefined;
  rewrittenMessage: string | null;
  source: 'action' | 'mention' | 'complexity' | 'keyword' | 'none';
  maxIterations?: number;
}

/** Format agent data into system prompt context string (legacy path) */
function buildAgentContext(agentData: { agent: { name: string }; content: string }): string {
  return `\n\n## Active Agent: ${agentData.agent.name}\n${agentData.content}`;
}

/**
 * Resolve an agent ID through the registry (canonical agents + legacy absorbed).
 * Returns a ResolvedAction fragment on match, null otherwise.
 * Registry-first ensures correct tools + up-to-date prompt body.
 */
function resolveFromRegistry(agentId: string): Partial<ResolvedAction> | null {
  const reg = agentRegistry.resolveForChat(agentId);
  if (!reg) return null;

  const { def, prompt, subAgentContext } = reg;

  // Build context string: specialist prompt + optional sub-agent knowledge
  let agentContext = `\n\n## Active Agent: ${def.nameLocalized}\n${prompt}`;
  if (subAgentContext) {
    agentContext += `\n\n---\n### Sub-agent knowledge (${agentId})\n${subAgentContext}`;
  }

  return {
    agentId: def.id,
    agentName: def.nameLocalized,
    agentColor: def.color,
    agentModel: def.model,
    agentContext,
    agentToolIds: def.tools,
  };
}

/**
 * Resolve the best action/agent for the given user message.
 * This is the SINGLE routing pipeline — call this instead of separate detection functions.
 */
export function resolveAction(message: string, siteId?: string): ResolvedAction {
  const noMatch: ResolvedAction = {
    agentId: null,
    agentName: null,
    agentColor: null,
    agentModel: null,
    agentContext: '',
    agentToolIds: undefined,
    rewrittenMessage: null,
    source: 'none',
  };

  if (!message || typeof message !== 'string') return noMatch;

  // 0. Workflow match — /workflow/[template-id] [params]
  const workflowMatch = matchWorkflow(message, siteId);
  if (workflowMatch) return workflowMatch;

  // 1. Action path match — check if message starts with a registered action path
  const actionMatch = matchActionPath(message, siteId);
  if (actionMatch) return actionMatch;

  // 2. @mention — explicit agent override
  const mentionMatch = matchMention(message);
  if (mentionMatch) return mentionMatch;

  // 3. Complexity routing — multi-step/multi-domain → master agent
  const complexityMatch = matchComplexity(message);
  if (complexityMatch) return complexityMatch;

  // 4. Keyword detection — fallback heuristic
  const keywordMatch = matchKeyword(message);
  if (keywordMatch) return keywordMatch;

  // 5. No match
  return noMatch;
}

/**
 * Match against action registry paths.
 * Supports: "/content/discover exampleorg.sk" or "/seo/audit"
 */
function matchActionPath(message: string, siteId?: string): ResolvedAction | null {
  // Match /path [optional input]
  const match = message.match(/^(\/[\w/.-]+)(?:\s+(.+))?$/i);
  if (!match) return null;

  const path = match[1].toLowerCase();
  const input = match[2]?.trim() || siteId || '';

  const action = findAction(path);
  if (!action) return null;

  // Registry-first: resolve agent via registry (handles legacy IDs via absorbs)
  let agentContext = '';
  let agentName: string | null = null;
  let agentColor: string | null = null;
  let agentModel: string | null = null;
  let agentToolIds: string[] | 'ALL' | undefined;

  if (action.agent) {
    const reg = resolveFromRegistry(action.agent);
    if (reg) {
      agentContext = reg.agentContext || '';
      agentName = reg.agentName || null;
      agentColor = reg.agentColor || null;
      agentModel = reg.agentModel || null;
      agentToolIds = reg.agentToolIds;
    } else {
      // Fallback: legacy knowledge.ts path
      const agentData = getAgentContent(action.agent);
      if (agentData) {
        agentContext = buildAgentContext(agentData);
        agentName = agentData.agent.name;
        agentColor = agentData.agent.color || null;
        agentModel = agentData.agent.model || null;
      }
    }
  }

  return {
    agentId: action.agent || null,
    agentName,
    agentColor,
    agentModel,
    agentContext,
    agentToolIds,
    rewrittenMessage: action.prompt(input),
    source: 'action',
    maxIterations: action.multiStep ? COMPLEX_TASK_ITERATIONS : undefined,
  };
}

/**
 * Match @mention pattern.
 */
function matchMention(message: string): ResolvedAction | null {
  const mentionMatch = message.match(/@([\w-]+)/);
  if (!mentionMatch) return null;

  const mentionedId = mentionMatch[1];

  // Registry-first
  const reg = resolveFromRegistry(mentionedId);
  if (reg) {
    return {
      agentId: reg.agentId || mentionedId,
      agentName: reg.agentName || mentionedId,
      agentColor: reg.agentColor || null,
      agentModel: reg.agentModel || null,
      agentContext: reg.agentContext || '',
      agentToolIds: reg.agentToolIds,
      rewrittenMessage: null,
      source: 'mention',
      maxIterations: (reg.agentModel === 'sonnet-high') ? COMPLEX_TASK_ITERATIONS : undefined,
    };
  }

  // Fallback: legacy
  const mentioned = getAgentContent(mentionedId);
  if (!mentioned) return null;

  return {
    agentId: mentioned.agent.id,
    agentName: mentioned.agent.name,
    agentColor: mentioned.agent.color || null,
    agentModel: mentioned.agent.model || null,
    agentContext: buildAgentContext(mentioned),
    agentToolIds: undefined,
    rewrittenMessage: null,
    source: 'mention',
    maxIterations: mentioned.agent.type === 'master' ? COMPLEX_TASK_ITERATIONS : undefined,
  };
}

/**
 * Complexity-first routing — brain-router.ts (Sprint D).
 * routeByComplexity() detects structural signals and maps to specialist AgentId.
 * Falls back to legacy detectComplexity() if brain-router returns no match.
 */
function matchComplexity(message: string): ResolvedAction | null {
  // Brain-router primary path
  const route = routeByComplexity(message);

  if (!route.isComplex) return null;

  const targetAgent = route.agentId || 'brief'; // default complex → brief
  console.log(`[resolveAction] Complexity (brain-router): ${route.reasons.join(', ')}, ~${route.estimatedTools} tools → ${targetAgent}`);

  const reg = resolveFromRegistry(targetAgent);
  if (reg) {
    return {
      agentId: reg.agentId || targetAgent,
      agentName: reg.agentName || targetAgent,
      agentColor: reg.agentColor || null,
      agentModel: reg.agentModel || null,
      agentContext: reg.agentContext || '',
      agentToolIds: reg.agentToolIds,
      rewrittenMessage: null,
      source: 'complexity',
      maxIterations: COMPLEX_TASK_ITERATIONS,
    };
  }

  // Fallback: legacy getAgentContent
  const agent = getAgentContent(targetAgent);
  if (!agent) return null;
  return {
    agentId: targetAgent,
    agentName: agent.agent.name,
    agentColor: agent.agent.color || null,
    agentModel: agent.agent.model || null,
    agentContext: buildAgentContext(agent),
    agentToolIds: undefined,
    rewrittenMessage: null,
    source: 'complexity',
    maxIterations: COMPLEX_TASK_ITERATIONS,
  };
}

/**
 * Keyword-based agent detection — brain-router.ts (Sprint D/F).
 * Registry-driven: keywords[] from definitions.ts, scored by phrase word count.
 * Legacy detectAgent() removed (Sprint F) — all coverage migrated to definitions.ts.
 */
function matchKeyword(message: string): ResolvedAction | null {
  const route = routeByKeyword(message);
  if (!route) return null;

  console.log(`[resolveAction] Keyword (brain-router): "${route.matchedKeywords.join(', ')}" score=${route.score} → ${route.agentId}`);
  const reg = resolveFromRegistry(route.agentId);
  if (reg) {
    return {
      agentId: reg.agentId || route.agentId,
      agentName: reg.agentName || route.agentId,
      agentColor: reg.agentColor || null,
      agentModel: reg.agentModel || null,
      agentContext: reg.agentContext || '',
      agentToolIds: reg.agentToolIds,
      rewrittenMessage: null,
      source: 'keyword',
    };
  }
  return null;
}

/**
 * Workflow template match: /workflow/[template-id] [param=value ...]
 * Also handles just /workflow to list available workflows.
 */
function matchWorkflow(message: string, siteId?: string): ResolvedAction | null {
  const match = message.match(/^\/workflow(?:\/(\S+))?\s*(.*)?$/i);
  if (!match) return null;

  const templateId = match[1];
  const paramsStr = match[2]?.trim() || '';

  const templates = loadWorkflowTemplates();

  // /workflow (no ID) — list available workflows
  if (!templateId) {
    const list = templates
      .map(t => `- \`/workflow/${t.id}\` — ${t.name}: ${t.description}`)
      .join('\n');

    return {
      agentId: null,
      agentName: null,
      agentColor: null,
      agentModel: null,
      agentContext: '',
      agentToolIds: undefined,
      rewrittenMessage: `Dostupné workflow šablóny:\n\n${list}\n\nPouži \`/workflow/[id]\` na spustenie.`,
      source: 'action',
    };
  }

  // Find specific template
  const template = templates.find(t => t.id === templateId);
  if (!template) return null;

  // Parse inline params: key=value or just positional values
  const params: Record<string, string> = {};
  if (paramsStr) {
    // Try key=value format first
    const kvPairs = paramsStr.match(/(\w+)=("[^"]+"|[^\s]+)/g);
    if (kvPairs) {
      for (const kv of kvPairs) {
        const [key, ...valueParts] = kv.split('=');
        params[key] = valueParts.join('=').replace(/^"|"$/g, '');
      }
    } else {
      // Single value — assign to first required variable
      const firstRequired = template.variables.find(v => v.required);
      if (firstRequired) params[firstRequired.name] = paramsStr;
    }
  }

  // Default domain from siteId
  if (!params.domain && siteId) {
    params.domain = siteId;
  }

  // Check for missing required variables — Brain will ask for them
  const missing = template.variables.filter(v => v.required && !params[v.name] && !v.default);

  let prompt: string;
  if (missing.length > 0) {
    // Ask user for missing variables
    const missingList = missing
      .map(v => {
        const opts = v.options ? ` (${v.options.join(', ')})` : '';
        return `- **${v.label}**${opts}`;
      })
      .join('\n');

    prompt = `Workflow: **${template.name}**\n\n${template.description}\n\nPre spustenie potrebujem ešte:\n${missingList}\n\nPoskyni tieto údaje a spustím workflow.`;
  } else {
    prompt = buildWorkflowPrompt(template, params);
  }

  // Workflows use Brain's native planning (no master-planner agent needed)
  // Extended iterations for multi-step execution
  return {
    agentId: null,
    agentName: 'Brain Plan',
    agentColor: '#a01441',
    agentModel: null,
    agentContext: '',
    agentToolIds: undefined,
    rewrittenMessage: prompt,
    source: 'action',
    maxIterations: COMPLEX_TASK_ITERATIONS,
  };
}
