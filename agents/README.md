# Brain Agent Harness — 2026-05-26

Brain's 6-specialist + 6-brain-core agent model with hot-editable Markdown
prompts. Designed for clarity over ceremony — single source of truth, no
validator framework, no mutex, no chokidar. Just files + cache + flush.

## Files vs registry

```
apps/brain-api/src/agents/definitions.ts   ← TS interface (id, model, tools, keywords, absorbs)
agents/<id>.md                             ← prompt body (this folder)
apps/brain-api/src/agents/registry.ts      ← AgentRegistry singleton + resolveForChat()
```

Each agent has one `.md` file. The registry reads it once via `loadPrompt(def)`
and caches indefinitely. Editing a `.md` does NOT refresh until either the
backend restarts or you POST the hot-reload endpoint below.

## 6 Specialists (type: `specialist`)

| ID       | Role                | Model       | Tools                                          |
|----------|---------------------|-------------|------------------------------------------------|
| auditor  | Audítor             | sonnet-high | Ahrefs Site Explorer + Audit + GSC + web       |
| analyst  | Analytik            | sonnet-high | Ahrefs (all) + GSC + web + utility             |
| writer   | Pisáč               | sonnet      | Web + utility + file save                      |
| brief    | Brief               | sonnet      | ALL — research everything                       |
| idea     | Idea                | haiku       | Web + utility                                  |
| batch    | Batch               | sonnet      | Multi-domain Ahrefs + GSC + file save          |

## 6 Brain-core (type: `brain-core`) — no tools, orchestrate only

`master-planner`, `brain-document`, `brain-presentation`,
`brain-spreadsheet`, `brain-web-artifact`, `brain-theme-factory`

## Hot reload after editing a `.md`

```bash
# All caches:
curl -X POST https://brain.example.com/api/agents/prompts/reload \
     -H 'Content-Type: application/json' --cookie "$BRAIN_COOKIE"

# Single agent:
curl -X POST https://brain.example.com/api/agents/prompts/reload \
     -H 'Content-Type: application/json' --cookie "$BRAIN_COOKIE" \
     -d '{"id":"auditor"}'
```

## Inspect effective compiled prompt + tool list (admin debugging)

```bash
curl https://brain.example.com/api/agents/auditor/effective-prompt \
     --cookie "$BRAIN_COOKIE"
```

Returns `{ agent, promptLength, promptPreview, promptFull, tools }`.

## Sub-agent absorption (legacy compat)

Pre-rewise `.md` files (`aeo-content-auditor.md`, `ahrefs-keyword-scanner.md`,
…) still live in this folder. They are listed in `definitions.ts` under each
specialist's `absorbs: []`. When a legacy ID is resolved via `resolveForChat()`
the registry returns the absorbing specialist plus that sub-agent's body as
extra context (capped at 4000 chars).

## Adding a new specialist

1. Append to `SpecialistAgentId` union + `SPECIALISTS` record in
   `apps/brain-api/src/agents/definitions.ts`
2. Drop `<id>.md` in this folder
3. Restart `brain-api` (or hit the hot-reload endpoint after first load)

## Adding a custom agent (no code change)

User UI → `Agenti` overlay → "+ Custom agent". Persists into `custom_agents`
table, loaded into the cache on startup via `loadCustomAgentsIntoCache()`.
