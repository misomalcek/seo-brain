#!/bin/bash
# Cleanup MCP reports older than 30 days
# Run weekly via cron: 0 2 * * 0
REPORT_DIR="/opt/team-brain/reports/mcp"
LOG_FILE="/opt/team-brain/backups/cleanup.log"

if [ -d "$REPORT_DIR" ]; then
    COUNT=$(find "$REPORT_DIR" -type f -mtime +30 -name "*.json" | wc -l)
    find "$REPORT_DIR" -type f -mtime +30 -name "*.json" -delete
    echo "$(date '+%Y-%m-%d %H:%M'): Deleted $COUNT MCP reports older than 30 days" >> "$LOG_FILE"
fi
