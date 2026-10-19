#!/bin/bash
# Team Brain - Daily Dashboard Refresh
# Generates fresh SEO, Content, and CEO dashboards with real data
# Runs via cron: 0 6 * * * /opt/team-brain/scripts/refresh-dashboards.sh

set -e

LOG="/var/log/team-brain/dashboard-refresh.log"
mkdir -p "$(dirname "$LOG")"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG"; }

log "Starting daily dashboard refresh"

# Load env for JWT_SECRET
source /opt/team-brain/apps/brain-api/.env 2>/dev/null || true

JWT_SECRET="${JWT_SECRET:-brain-dev-secret-change-me}"
ADMIN_ID="0064bc3a-3ee7-4f3b-aa55-edfa42602369"
ADMIN_EMAIL="brain-admin@example.com"
API_URL="http://localhost:3001"

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

# Generate each dashboard type
for TYPE in seo content ceo keywords audit links visibility; do
  log "Generating $TYPE dashboard..."
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "$API_URL/dashboards/$TYPE/generate" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    --max-time 120)

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  if [ "$HTTP_CODE" = "200" ]; then
    log "OK: $TYPE dashboard generated successfully"
  else
    log "ERROR: $TYPE dashboard failed (HTTP $HTTP_CODE): $BODY"
  fi
done

log "Dashboard refresh complete"
