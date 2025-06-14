#!/bin/bash

# Install script for Pulumi MCP Local Server
# This script removes any existing installation and installs the current version

set -e  # Exit on any error

# Get the absolute path of the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_NAME="pulumi-mcp-local"
DIST_PATH="$SCRIPT_DIR/dist/index.js"

echo "Installing Pulumi MCP Local Server..."
echo "Script directory: $SCRIPT_DIR"
echo "Distribution path: $DIST_PATH"

# Check if dist/index.js exists
if [ ! -f "$DIST_PATH" ]; then
    echo "Error: $DIST_PATH not found. Please run 'npm run build' first."
    exit 1
fi

# Remove existing installation if it exists
echo "Removing existing installation (if any)..."
claude mcp remove -s user "$MCP_NAME" 2>/dev/null || echo "No previous installation found."

# Install the new version
echo "Installing new version..."
claude mcp add-json -s user "$MCP_NAME" "{\"type\":\"stdio\",\"command\":\"node\",\"args\":[\"$DIST_PATH\",\"stdio\"]}"

echo "✅ Successfully installed $MCP_NAME"
echo "You can now use the deploy-to-aws tool and prompt in Claude."