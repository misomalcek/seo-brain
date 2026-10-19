const dotenv = require('dotenv');
const path = require('path');

// Load .env file
dotenv.config({ path: path.join(__dirname, '.env') });

module.exports = {
  apps: [{
    name: 'brain-api',
    script: './dist/index.js',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    // 4G (was 500M): the in-process embedding model is now Nomic-768 (~hundreds of MB,
    // vs MiniLM-30MB). 500M caused pm2 to recycle brain-api the moment the model loaded
    // during a RAG chat → "crash mid-request". 4G is a safety backstop well above normal
    // footprint (~0.5–1G) but below the box's OOM threshold (8G RAM + 2G swap).
    max_memory_restart: '4096M',
    env: {
      NODE_ENV: 'development',
      PORT: 3001,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      AHREFS_API_KEY: process.env.AHREFS_API_KEY,
      CRUX_API_KEY: process.env.CRUX_API_KEY,
      JWT_SECRET: process.env.JWT_SECRET,
      DATABASE_URL: process.env.DATABASE_URL,
      ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || 'https://brain.example.com'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      AHREFS_API_KEY: process.env.AHREFS_API_KEY,
      CRUX_API_KEY: process.env.CRUX_API_KEY,
      JWT_SECRET: process.env.JWT_SECRET,
      DATABASE_URL: process.env.DATABASE_URL,
      ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || 'https://brain.example.com'
    }
  },
  // Night Shift — autonomous agents
  {
    name: 'ns-auto-activate',
    script: '/opt/team-brain/scripts/night-shift/run.sh',
    args: 'auto-activate.ts',
    cron_restart: '30 1 * * *',
    autorestart: false,
    watch: false,
    env: {
      NODE_PATH: path.join(__dirname, 'node_modules')
    }
  },
  {
    name: 'ns-memory-decay',
    script: '/opt/team-brain/scripts/night-shift/run.sh',
    args: 'memory-decay.ts',
    cron_restart: '0 4 1 * *',
    autorestart: false,
    watch: false,
    env: {
      NODE_PATH: path.join(__dirname, 'node_modules')
    }
  },
  {
    name: 'ns-curate-memories',
    script: '/opt/team-brain/scripts/night-shift/run.sh',
    args: 'curate-memories.ts',
    cron_restart: '0 4 * * 0',  // Sunday 4:00 AM
    autorestart: false,
    watch: false,
    env: {
      NODE_PATH: path.join(__dirname, 'node_modules')
    }
  },
  {
    name: 'ns-health-check',
    script: '/opt/team-brain/scripts/night-shift/run.sh',
    args: 'health-check.ts',
    cron_restart: '30 6 * * *',
    autorestart: false,
    watch: false,
    env: {
      NODE_PATH: path.join(__dirname, 'node_modules')
    }
  },
  {
    name: 'ns-weekly-digest',
    script: '/opt/team-brain/scripts/night-shift/run.sh',
    args: 'weekly-digest.ts',
    cron_restart: '0 5 * * 1',
    autorestart: false,
    watch: false,
    env: {
      NODE_PATH: path.join(__dirname, 'node_modules')
    }
  },
  {
    name: 'ns-refresh-knowledge',
    script: '/opt/team-brain/scripts/night-shift/run.sh',
    args: 'refresh-knowledge.ts',
    cron_restart: '0 3 1 * *',
    autorestart: false,
    watch: false,
    env: {
      NODE_PATH: path.join(__dirname, 'node_modules')
    }
  },
  {
    name: 'ns-refresh-worldview',
    script: '/opt/team-brain/scripts/night-shift/run.sh',
    args: 'refresh-worldview.ts',
    cron_restart: '0 5 * * *',  // Daily 5:00 AM
    autorestart: false,
    watch: false,
    env: {
      NODE_PATH: path.join(__dirname, 'node_modules')
    }
  },
  {
    name: 'ns-article-scraper',
    script: '/opt/team-brain/scripts/night-shift/run.sh',
    args: 'article-scraper.ts',
    cron_restart: '0 3 * * 0',
    autorestart: false,
    watch: false,
    env: {
      NODE_PATH: path.join(__dirname, 'node_modules')
    }
  },
  // Snapshot Strategy v2 — Weekly Wednesday
  {
    name: 'ns-gsc-snapshot-v2',
    script: '/opt/team-brain/scripts/night-shift/run.sh',
    args: 'gsc-snapshot-v2.ts',
    cron_restart: '30 1 * * 3',  // Wednesday 1:30 AM
    autorestart: false,
    watch: false,
    env: {
      NODE_PATH: path.join(__dirname, 'node_modules')
    }
  },
  {
    name: 'ns-crux-snapshot',
    script: '/opt/team-brain/scripts/night-shift/run.sh',
    args: 'crux-snapshot.ts',
    cron_restart: '30 2 * * 3',  // Wednesday 2:30 AM
    autorestart: false,
    watch: false,
    env: {
      NODE_PATH: path.join(__dirname, 'node_modules')
    }
  },
  {
    name: 'ns-sitemap-crawl',
    script: '/opt/team-brain/scripts/night-shift/run.sh',
    args: 'sitemap-crawl.ts',
    cron_restart: '0 3 1 * *',  // Monthly 1st, 3:00 AM
    autorestart: false,
    watch: false,
    env: {
      NODE_PATH: path.join(__dirname, 'node_modules')
    }
  }]
};
