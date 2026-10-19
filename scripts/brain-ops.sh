#!/bin/bash
# brain-ops — safe ops for the limited `brain-dev` user.
# Invoked as:  sudo -u brain-admin /opt/team-brain/scripts/brain-ops.sh <status|logs|health|restart>
# Runs AS brain-admin (pm2 owner). Each subcommand is whitelisted in sudoers so brain-dev
# can only run these exact actions — no arbitrary args. See brain-deploy.sh security note.
export HOME=/home/brain-admin
PM2=/opt/team-brain/apps/brain-api/node_modules/.bin/pm2
case "$1" in
  status)  "$PM2" list ;;
  logs)    "$PM2" logs brain-api --lines 50 --nostream ;;
  health)  curl -s http://localhost:3001/health; echo ;;
  restart) cd /opt/team-brain/apps/brain-api && "$PM2" delete brain-api >/dev/null 2>&1; "$PM2" start ecosystem.config.js --only brain-api && "$PM2" save ;;
  *) echo "usage: brain-ops {status|logs|health|restart}"; exit 1 ;;
esac
