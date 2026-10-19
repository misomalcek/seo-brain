#!/bin/bash
# Team Brain - Daily Backup Script
# Run via crontab: 0 3 * * * /opt/team-brain/scripts/backup.sh
set -e

BRAIN_ROOT="/opt/team-brain"
BACKUP_DIR="$BRAIN_ROOT/backups/$(date +%Y-%m-%d)"
RETENTION_DAYS=30

echo "=== Team Brain Backup ==="
echo "Date: $(date)"
echo "Target: $BACKUP_DIR"
echo ""

mkdir -p "$BACKUP_DIR"

# Backup PostgreSQL (if installed)
if command -v pg_dump &> /dev/null; then
  echo "[1/3] Backing up PostgreSQL..."
  pg_dump team_brain > "$BACKUP_DIR/database.sql" 2>/dev/null && \
    echo "  Database backup: $(du -h "$BACKUP_DIR/database.sql" | cut -f1)" || \
    echo "  Database not available (skipped)"
else
  echo "[1/3] PostgreSQL not installed (skipped)"
fi

# Backup Knowledge Base
echo "[2/3] Backing up knowledge base..."
tar czf "$BACKUP_DIR/knowledge.tar.gz" \
  -C "$BRAIN_ROOT" \
  skills/ agents/ knowledge/ memory/ config/ \
  2>/dev/null || true
echo "  Knowledge backup: $(du -h "$BACKUP_DIR/knowledge.tar.gz" 2>/dev/null | cut -f1 || echo 'N/A')"

# Backup API config (without secrets)
echo "[3/3] Backing up configs..."
tar czf "$BACKUP_DIR/api-config.tar.gz" \
  -C "$BRAIN_ROOT" \
  apps/brain-api/src/ \
  apps/brain-api/package.json \
  apps/brain-api/tsconfig.json \
  apps/brain-api/ecosystem.config.js \
  apps/brain-chat/app/ \
  apps/brain-chat/components/ \
  apps/brain-chat/lib/ \
  apps/brain-chat/package.json \
  2>/dev/null || true
echo "  Config backup: $(du -h "$BACKUP_DIR/api-config.tar.gz" 2>/dev/null | cut -f1 || echo 'N/A')"

# Clean old backups
echo ""
echo "Cleaning backups older than $RETENTION_DAYS days..."
find "$BRAIN_ROOT/backups/" -maxdepth 1 -type d -mtime +$RETENTION_DAYS -exec rm -rf {} \; 2>/dev/null || true

TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1 || echo 'N/A')
echo ""
echo "=== Backup Complete ==="
echo "Total size: $TOTAL_SIZE"
echo "Location: $BACKUP_DIR"
