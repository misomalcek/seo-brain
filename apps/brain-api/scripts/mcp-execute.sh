#!/bin/bash
# MCP Bridge wrapper script
# This ensures proper environment for Claude Code with MCP tools

export HOME="/home/brain-admin"
export PATH="$HOME/.local/bin:$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
export TERM="xterm-256color"
export LANG="en_US.UTF-8"

# Load nvm if available
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Change to /opt/team-brain to use project-level MCP config
cd /opt/team-brain

# MCP config file location (combined Ahrefs + GSC)
MCP_CONFIG="/opt/team-brain/apps/brain-api/config/mcp-all.json"

# Set GSC credentials
export GOOGLE_APPLICATION_CREDENTIALS="/opt/team-brain/credentials/gsc-service-account.json"

# Use script to provide a pseudo-TTY and execute claude
# The -qec options: quiet, return exit code, command
exec script -qec "claude --dangerously-skip-permissions --mcp-config '$MCP_CONFIG' --print '$1'" /dev/null
