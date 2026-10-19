#!/bin/bash
# Seed the first admin user for Team Brain
# Usage: ./scripts/seed-admin.sh [email] [password] [name]

set -e

EMAIL="${1:-brain-admin@example.com}"
PASSWORD="${2:-BrainAdmin2026!}"
NAME="${3:-Brain Admin}"

echo "=== Team Brain - Admin Seed ==="
echo "Email: $EMAIL"
echo "Name: $NAME"

# Use Node.js to hash password and insert
cd /opt/team-brain/apps/brain-api

node -e "
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

async function seed() {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL not set — source apps/brain-api/.env first'); process.exit(1); }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const hash = await bcrypt.hash('$PASSWORD', 12);

  // Upsert: update if exists, insert if not
  const result = await pool.query(\`
    INSERT INTO users (email, name, role, password_hash)
    VALUES (\$1, \$2, 'admin', \$3)
    ON CONFLICT (email)
    DO UPDATE SET password_hash = \$3, role = 'admin', name = \$2
    RETURNING id, email, name, role
  \`, ['$EMAIL', '$NAME', hash]);

  console.log('Admin user created/updated:', result.rows[0]);
  await pool.end();
}

seed().catch(err => { console.error(err); process.exit(1); });
"

echo "=== Done ==="
