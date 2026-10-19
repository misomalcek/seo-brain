# SEO Brain

A workspace for search work. You talk to it, it reads your notes and the files you give it, and — when you add the keys — it can ask Ahrefs, Search Console, and Analytics.

Two ways to run it. One codebase.

The **desktop app** is for a person who does not run servers. It is not in this first commit. The database it will use is already proven: Postgres in the app, no install. The **server edition** is the one that deploys today, on a Linux machine, with Postgres.

No account with us. A model key is yours. Nothing in this repository is a credential.

## What works without a key

The app opens and says what a key unlocks. Chat needs an Anthropic key, or another OpenAI-compatible endpoint once that sheet exists. Search Console, Analytics, and Ahrefs each turn on their own tools. A missing key is a quiet switch, not a crash.

Embeddings stay on the machine (384 dimensions). They download after you agree. They are not inside the installer, and they are not sent to the chat endpoint. Mixing those two would change the size of every vector.

## What the desktop database is

Postgres, in-process, with pgvector. The same SQL the server runs. Three things stay on the server, because the desktop build does not have them:

- Timescale. The log tables exist. They are not chunked.
- The trigram index. Search still works. That index is only a speedup.
- The knowledge-graph tool. It belongs to a server install. The desktop does not register it.

`vectorscale` is not installed anywhere. Nothing used it.

## Server deploy

`scripts/brain-deploy.sh` is the deploy. It is meant to be run as `brain-admin`, and the `brain-dev` user must not be able to edit it. Do not move it, rename it, or loosen those permissions.

The server still needs Postgres, with `vector` and `pg_trgm`. Timescale is optional and only adds chunking. The graph migration (`038_hive_graph_seed.sql`) is server-only.

```bash
npm install
npm run dev:api     # needs DATABASE_URL
npm run dev:chat
```

A desktop build skips `038_hive_graph_seed.sql` by setting `SEO_BRAIN_SKIP_MIGRATIONS` to that file name. The server does not set that variable.
