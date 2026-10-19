#!/bin/bash
# Ahrefs Snapshot Cron — runs at 3:30 AM after GSC (2:30 AM)
# Triggers via API endpoint using JWT auth (same pattern as refresh-dashboards.sh)
# Cron: 30 3 * * * /opt/team-brain/scripts/ahrefs-snapshot-cron.sh >> /opt/team-brain/logs/ahrefs-snapshot.log 2>&1

set -e

API_DIR="/opt/team-brain/apps/brain-api"
LOG_FILE="/opt/team-brain/logs/ahrefs-snapshot.log"
mkdir -p /opt/team-brain/logs

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"; }

log "Starting Ahrefs snapshot..."

# Load env for JWT_SECRET
if [ -f "$API_DIR/.env" ]; then
  set -a; source "$API_DIR/.env"; set +a
fi

JWT_SECRET="${JWT_SECRET:-brain-dev-secret-change-me}"
ADMIN_ID="0064bc3a-3ee7-4f3b-aa55-edfa42602369"
ADMIN_EMAIL="brain-admin@example.com"

# Generate a short-lived JWT for the admin user
TOKEN=$(node -e "
const jwt = require('/opt/team-brain/node_modules/jsonwebtoken');
const token = jwt.sign(
  { userId: '$ADMIN_ID', email: '$ADMIN_EMAIL', role: 'admin' },
  '$JWT_SECRET',
  { expiresIn: '5m' }
);
console.log(token);
")

if [ -z "$TOKEN" ]; then
  log "ERROR: Failed to generate JWT token"
  exit 1
fi

# Trigger tiered Ahrefs snapshot refresh (v1.8)
# This runs ALL tiers on 1st of month, skips on other days (unless force=true)
log "Running tiered snapshot refresh..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "http://localhost:3001/snapshots/ahrefs/refresh-tiered" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --max-time 600)

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  log "OK: Tiered snapshot completed: $BODY"
else
  log "WARN: Tiered snapshot failed (HTTP $HTTP_CODE): $BODY"
fi

# Also run legacy T1 refresh (backward compat)
log "Running legacy snapshot refresh..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "http://localhost:3001/snapshots/ahrefs/refresh" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --max-time 300)

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  log "OK: Legacy snapshot completed: $BODY"
else
  log "WARN: Legacy snapshot failed (HTTP $HTTP_CODE): $BODY"
fi

log "Done"
