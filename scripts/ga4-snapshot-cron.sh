#!/bin/bash
# GA4 monthly snapshot cron — Run T (2026-05-26)
# -----------------------------------------------------------------------------
# Captures 6 key GA4 reports per tracked site into `ga4_snapshots` table
# (migration 039). Designed to run 1st of each month at 03:30, after the GSC
# snapshot at 02:30, while quotas are fresh.
#
# Crontab:
#   30 3 1 * * /opt/team-brain/scripts/ga4-snapshot-cron.sh >> /var/log/brain/ga4-snapshot.log 2>&1
#
# Reports captured per site:
#   traffic_overview | landing_pages | source_medium | device | geo | key_events
#
# Retention: 24 months — pruned at end of script.
set -euo pipefail

BRAIN_API="${BRAIN_API:-http://localhost:3001}"
API_DIR="/opt/team-brain/apps/brain-api"

# Auth: mint a short-lived admin JWT (same pattern as ahrefs-snapshot-cron.sh).
# The old cookie-file auth (/opt/team-brain/credentials/cron-session.cookie) never
# existed on disk, so every GA4 snapshot returned "Authentication required" since
# launch — zero GA4 history was ever captured.
if [ -f "$API_DIR/.env" ]; then
  set -a; source "$API_DIR/.env"; set +a
fi
JWT_SECRET="${JWT_SECRET:?JWT_SECRET not set — source .env}"
ADMIN_ID="0064bc3a-3ee7-4f3b-aa55-edfa42602369"
ADMIN_EMAIL="brain-admin@example.com"
TOKEN=$(node -e "
const jwt = require('/opt/team-brain/node_modules/jsonwebtoken');
console.log(jwt.sign({ userId: '$ADMIN_ID', email: '$ADMIN_EMAIL', role: 'admin' }, '$JWT_SECRET', { expiresIn: '10m' }));
")
if [ -z "$TOKEN" ]; then echo "[ga4-snapshot] ERROR: failed to mint JWT"; exit 1; fi
LAST_MONTH_START=$(date -d "$(date +%Y-%m-01) -1 month" +%Y-%m-%d 2>/dev/null || gdate -d "$(date +%Y-%m-01) -1 month" +%Y-%m-%d)
LAST_MONTH_END=$(date -d "$(date +%Y-%m-01) -1 day" +%Y-%m-%d 2>/dev/null || gdate -d "$(date +%Y-%m-01) -1 day" +%Y-%m-%d)

echo "[ga4-snapshot] $(date -Iseconds) — capturing $LAST_MONTH_START..$LAST_MONTH_END"

REPORTS=(
  "traffic_overview:ga4_traffic_overview"
  "landing_pages:ga4_landing_pages"
  "source_medium:ga4_source_medium"
  "device:ga4_device_breakdown"
  "geo:ga4_geo_breakdown"
  "key_events:ga4_key_events"
)

SITES=$(sudo -u postgres psql team_brain -At -c \
  "SELECT id, domain, ga4_property_id FROM sites WHERE is_tracked=TRUE AND ga4_property_id IS NOT NULL")

if [ -z "$SITES" ]; then
  echo "[ga4-snapshot] No tracked sites with ga4_property_id — exiting."
  exit 0
fi

while IFS='|' read -r SITE_ID DOMAIN PROP_ID; do
  echo "[ga4-snapshot] site=$DOMAIN property=$PROP_ID"
  for entry in "${REPORTS[@]}"; do
    REPORT_TYPE="${entry%%:*}"
    TOOL_NAME="${entry##*:}"
    PAYLOAD=$(curl -s -X POST "$BRAIN_API/admin/ga4-snapshot/capture" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "{\"siteId\":\"$SITE_ID\",\"tool\":\"$TOOL_NAME\",\"reportType\":\"$REPORT_TYPE\",\"startDate\":\"$LAST_MONTH_START\",\"endDate\":\"$LAST_MONTH_END\"}")
    echo "  $REPORT_TYPE → $(echo "$PAYLOAD" | head -c 200)"
  done
done <<< "$SITES"

# Prune snapshots older than 24 months
sudo -u postgres psql team_brain -c \
  "DELETE FROM ga4_snapshots WHERE snapshot_date < (CURRENT_DATE - INTERVAL '24 months')"

echo "[ga4-snapshot] done"
