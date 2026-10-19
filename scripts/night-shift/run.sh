#!/bin/bash
# Night shift wrapper — runs TypeScript agents with correct module resolution
# Usage: ./run.sh <script.ts>
# Example: ./run.sh auto-activate.ts

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_DIR="/opt/team-brain/apps/brain-api"

export NODE_PATH="$API_DIR/node_modules"
cd "$API_DIR"
exec npx tsx "$SCRIPT_DIR/$1"
