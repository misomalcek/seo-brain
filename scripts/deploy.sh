#!/bin/bash
# Team Brain - Deploy Script
# Builds apps and deploys to production locations
set -e

BRAIN_ROOT="/opt/team-brain"
DEPLOY_ROOT="/var/www/brain"

echo "=== Team Brain Deploy ==="
echo "Source: $BRAIN_ROOT"
echo "Target: $DEPLOY_ROOT"
echo ""

# Build Brain API
echo "[1/4] Building Brain API..."
cd "$BRAIN_ROOT/apps/brain-api"
npm run build
echo "  Brain API built successfully."

# Build Brain Chat
echo "[2/4] Building Brain Chat..."
cd "$BRAIN_ROOT/apps/brain-chat"
npm run build
echo "  Brain Chat built successfully."

# Deploy Brain Chat static output
echo "[3/4] Deploying Brain Chat..."
mkdir -p "$DEPLOY_ROOT/apps/brain-chat"
rsync -av --delete "$BRAIN_ROOT/apps/brain-chat/out/" "$DEPLOY_ROOT/apps/brain-chat/out/"
echo "  Brain Chat deployed to $DEPLOY_ROOT/apps/brain-chat/out/"

# Restart Brain API
echo "[4/4] Restarting Brain API..."
cd "$BRAIN_ROOT/apps/brain-api"
if command -v pm2 &> /dev/null && pm2 describe brain-api &> /dev/null; then
  pm2 restart brain-api
  echo "  Brain API restarted via PM2."
else
  # Fallback: kill and restart manually
  pkill -f "node.*brain-api/dist" 2>/dev/null || true
  sleep 1
  node dist/index.js &
  echo "  Brain API restarted manually."
fi

echo ""
echo "=== Deploy Complete ==="
echo "Dashboard: https://brain.example.com"
echo "Chat:      https://brain.example.com/apps/brain-chat/"
echo "API:       https://brain.example.com/api/health"
