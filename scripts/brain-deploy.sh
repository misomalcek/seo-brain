#!/bin/bash
# brain-deploy — two-tier deploy wrapper for the limited `brain-dev` user.
# Invoked as:  sudo -u brain-admin /opt/team-brain/scripts/brain-deploy.sh   (NOPASSWD, no args)
# Runs AS brain-admin (owns repo + pm2 + gitlab SSH key + /var/www/brain). Takes NO arguments.
# SECURITY: brain-dev must NOT be able to edit this file (owned brain-admin, scripts/ not
# other-writable, brain-dev not in team-brain group) — otherwise the brain-admin NOPASSWD
# sudo would be a privilege-escalation path. Keep it that way.
set -e
export HOME=/home/brain-admin
export PATH="/opt/team-brain/apps/brain-api/node_modules/.bin:$PATH"
cd /opt/team-brain
echo "[brain-deploy] $(date -Iseconds)"
echo "[1/5] git pull origin master"
git pull origin master
echo "[2/5] build brain-api (tsc)"
( cd apps/brain-api && npx tsc ) || echo "  (tsc reported errors — dist still emitted; review above before trusting)"
echo "[3/5] build brain-chat"
( cd apps/brain-chat && npm run build )
echo "[4/5] rsync chat -> /var/www/brain"
rsync -a --delete --exclude=reports/ --exclude=admin/ apps/brain-chat/out/ /var/www/brain/
echo "[5/5] restart brain-api via ecosystem (picks up .env + 4G mem limit cleanly)"
cd apps/brain-api
pm2 delete brain-api >/dev/null 2>&1 || true
pm2 start ecosystem.config.js --only brain-api
pm2 save
sleep 3
curl -s -o /dev/null -w "[brain-deploy] health HTTP %{http_code}\n" http://localhost:3001/health
echo "[brain-deploy] done"
