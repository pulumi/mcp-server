#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registryCommands } from "./registry.js";
import { cliCommands } from "./cli.js";

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create cache directory if it doesn't exist
const CACHE_DIR = path.join(__dirname, './.cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}


// Define a type for the text content part of the response
type TextContent = {
  type: "text";
  text: string;
};

// Create an MCP server
const server = new McpServer({ 
  name: "PulumiServer", 
  version: "0.1.2",
  description: "An MCP server for querying Pulumi Registry information and running Pulumi CLI commands"
});

// Centralized error handling function
const handleError = (error: unknown, toolName: string): { description: string; content: TextContent[] } => {
  console.error(`Error in tool ${toolName}:`, error);
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  return {
    description: `Error executing ${toolName}`, 
    content: [{ 
      type: "text" as const, 
      text: `Operation failed: ${errorMessage}` 
    }]
  };
};

// Register registry commands
Object.entries(registryCommands(CACHE_DIR)).forEach(([commandName, command]) => {
  const toolName = `pulumi-registry-${commandName}`;
  server.tool(toolName, command.description, command.schema, async (args: any) => {
    try {
      return await command.handler(args);
    } catch (error) {
      return handleError(error, toolName);
    }
  });
});

// Register CLI commands
Object.entries(cliCommands).forEach(([commandName, command]) => {
  const toolName = `pulumi-cli-${commandName}`;
  server.tool(toolName, command.description, command.schema, async (args: any) => {
    try {
      return await command.handler(args);
    } catch (error) {
      return handleError(error, toolName);
    }
  });
});

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();

// Connect the server to the transport
server.connect(transport).catch(error => {
  console.error("Failed to connect server:", error);
  process.exit(1);
});
