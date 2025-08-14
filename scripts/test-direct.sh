#!/bin/bash
# Test script to directly invoke MCP server tools via JSON-RPC 2.0
# This bypasses MCP clients and allows seeing console.log output from the server
# 
# JSON-RPC 2.0 format:
# - jsonrpc: "2.0" (protocol version)
# - id: unique request identifier
# - method: MCP method ("tools/call", "tools/list", etc.)
# - params: method parameters (tool name and arguments)

set -e

# Get the absolute path of the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_SERVER="$SCRIPT_DIR/../dist/index.js"

echo "Testing MCP server directly via JSON-RPC..."
echo "Server: $MCP_SERVER"
echo ""

# Test pulumi-registry-get-resource tool with AWS S3 Bucket
echo "Calling pulumi-registry-get-resource for AWS S3 Bucket..."
echo ""

# Send JSON-RPC request directly to MCP server
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "pulumi-registry-get-resource", "arguments": {"provider": "aws", "resource": "Bucket"}}}' | node "$MCP_SERVER" stdio

echo ""
echo "✅ Direct MCP test completed"