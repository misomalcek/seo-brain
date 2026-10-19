#!/bin/bash
#
# GSC Nightly Snapshot Generator
# Runs at 2:30 AM daily to pull fresh Google Search Console data for all tracked domains
#
# Cron: 30 2 * * * /opt/team-brain/scripts/gsc-snapshot-cron.sh >> /opt/team-brain/logs/gsc-snapshot.log 2>&1
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
API_DIR="$PROJECT_ROOT/apps/brain-api"
LOG_FILE="$PROJECT_ROOT/logs/gsc-snapshot.log"

# Load environment variables (.env for DATABASE_URL etc.)
if [ -f "$API_DIR/.env" ]; then
  set -a; source "$API_DIR/.env"; set +a
fi

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

echo "==================================="
echo "GSC Snapshot Cron"
echo "Started: $(date '+%Y-%m-%d %H:%M:%S')"
echo "==================================="

# Navigate to API directory
cd "$API_DIR"

# Run snapshot generator via Node.js
NODE_PATH="$API_DIR/dist:$API_DIR/node_modules" node -e "
const { generateAllSnapshots, cleanOldSnapshots } = require('./dist/services/gsc-snapshot.js');

async function run() {
  try {
    // Generate fresh snapshots for all tracked domains
    const result = await generateAllSnapshots();

    if (result.success) {
      console.log('✓ All GSC snapshots generated successfully');
    } else {
      console.error('⚠ Some GSC snapshots failed:');
      result.snapshots.forEach(s => {
        if (s.status === 'failed') {
          console.error(\`  - \${s.domain}: \${s.error}\`);
        }
      });
      process.exit(1);
    }

    // Clean old snapshots (> 7 days)
    const cleaned = await cleanOldSnapshots();
    console.log(\`✓ Cleaned \${cleaned} old GSC snapshots\`);

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

run();
"

EXIT_CODE=$?

echo "==================================="
echo "Finished: $(date '+%Y-%m-%d %H:%M:%S')"
echo "Exit code: $EXIT_CODE"
echo "==================================="

exit $EXIT_CODE
