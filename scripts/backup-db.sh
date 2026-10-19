#!/bin/bash
# Team Brain - PostgreSQL Daily Backup
# Runs via cron, keeps last 30 days

BACKUP_DIR="/opt/team-brain/backups"
DB_NAME="team_brain"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y-%m-%d_%H%M)

# Create backup
BACKUP_FILE="${BACKUP_DIR}/team_brain_${TIMESTAMP}.sql.gz"
sudo -u postgres pg_dump "$DB_NAME" | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "[$(date)] Backup OK: $BACKUP_FILE ($SIZE)"
else
    echo "[$(date)] ERROR: Backup failed!" >&2
    exit 1
fi

# Cleanup old backups
DELETED=$(find "$BACKUP_DIR" -name "team_brain_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
    echo "[$(date)] Cleaned up $DELETED old backups (>${RETENTION_DAYS} days)"
fi
