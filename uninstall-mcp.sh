#!/bin/bash

# Uninstall script for Pulumi MCP Local Server

set -e  # Exit on any error

MCP_NAME="pulumi-mcp-local"

echo "Uninstalling Pulumi MCP Local Server..."

# Remove the MCP server
claude mcp remove -s user "$MCP_NAME"

echo "✅ Successfully uninstalled $MCP_NAME"