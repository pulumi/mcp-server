#!/bin/bash
# Install script for Pulumi MCP Local Server
# This script removes any existing installation and installs the current version
# Usage: 
#   ./install-mcp.sh                    # Install from local dist/index.js
#   ./install-mcp.sh package.tgz        # Install from packed .tgz file

set -e  # Exit on any error

# Get the absolute path of the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_NAME="pulumi-mcp-local"
TEMP_DIR="$SCRIPT_DIR/temp-mcp-test"

echo "Installing Pulumi MCP Local Server..."
echo "Script directory: $SCRIPT_DIR"

# Check if a .tgz file was provided as argument
if [ $# -gt 0 ]; then
    # Convert to absolute path if it's a relative path
    if [[ "$1" = /* ]]; then
        TGZ_FILE="$1"
    else
        TGZ_FILE="$SCRIPT_DIR/$1"
    fi
    
    echo "Checking packed file: $TGZ_FILE"
    
    # Validate the file exists
    if [ ! -f "$TGZ_FILE" ]; then
        echo "Error: File '$1' not found."
        echo "Looking for: $TGZ_FILE"
        exit 1
    fi
    
    # Validate it's a valid tar.gz file
    if ! tar -tzf "$TGZ_FILE" >/dev/null 2>&1; then
        echo "Error: '$1' is not a valid .tgz file."
        exit 1
    fi
    
    echo "✅ Valid .tgz file found"
    echo "Installing from packed file: $TGZ_FILE"
    
    # Clean up temp directory if it exists
    if [ -d "$TEMP_DIR" ]; then
        echo "Cleaning up existing temp directory..."
        rm -rf "$TEMP_DIR"
    fi
    
    # Create temp directory and extract
    echo "Extracting packed file..."
    mkdir -p "$TEMP_DIR"
    cd "$TEMP_DIR"
    # Extract using absolute path
    tar -xzf "$TGZ_FILE"
    
    # The extracted files will be in a 'package' directory
    cd package
    
    # Install production dependencies
    echo "Installing production dependencies..."
    npm install --production --silent
    
    # Set the distribution path to the extracted package
    DIST_PATH="$(pwd)/dist/index.js"
    
else
    # Use local installation - dist is one level up from scripts
    DIST_PATH="$SCRIPT_DIR/../dist/index.js"
    echo "Installing from local build..."
fi

echo "Distribution path: $DIST_PATH"

# Check if dist/index.js exists
if [ ! -f "$DIST_PATH" ]; then
    if [ $# -gt 0 ]; then
        echo "Error: $DIST_PATH not found in extracted package. The .tgz file may not contain a built version."
    else
        echo "Error: $DIST_PATH not found. Please run 'npm run build' first."
    fi
    exit 1
fi

# Remove existing installation if it exists
echo "Removing existing installation (if any)..."
claude mcp remove -s user "$MCP_NAME" 2>/dev/null || echo "No previous installation found."

# Install the new version
echo "Installing new version..."
claude mcp add-json -s user "$MCP_NAME" "{\"type\":\"stdio\",\"command\":\"node\",\"args\":[\"$DIST_PATH\",\"stdio\"]}"

echo "✅ Successfully installed $MCP_NAME"

# Show cleanup instructions if using temp directory
if [ $# -gt 0 ] && [ -d "$TEMP_DIR" ]; then
    echo ""
    echo "Note: Temporary files extracted to $TEMP_DIR"
    echo "To clean up later, run: rm -rf $TEMP_DIR"
fi
