import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import packageJSON from '../../package.json' with { type: 'json' };
import { registryCommands } from '../pulumi/registry.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliCommands } from '../pulumi/cli.js';
import { logger } from '../logging/logging.js';
import { deployCommands, deployPrompts } from '../deploy/deploy.js';
import { convertPrompts } from '../pulumi/convert.js';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create cache directory if it doesn't exist
const CACHE_DIR = path.join(__dirname, './.cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

type TextContent = {
  type: 'text';
  text: string;
};

function handleError(
  error: unknown,
  toolName: string
): { description: string; content: TextContent[] } {
  logger.error(`Error in tool ${toolName}:`, error);
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  return {
    description: `Error executing ${toolName}`,
    content: [
      {
        type: 'text' as const,
        text: `Operation failed: ${errorMessage}`
      }
    ]
  };
}

export class Server extends McpServer {
  constructor(description: string) {
    super({
      name: packageJSON.name,
      version: packageJSON.version,
      description: description
    });
    // Centralized error handling function

    // Register registry commands
    Object.entries(registryCommands(CACHE_DIR)).forEach(([commandName, command]) => {
      const toolName = `pulumi-registry-${commandName}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.tool(toolName, command.description, command.schema, async (args: any) => {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.tool(toolName, command.description, command.schema, async (args: any) => {
        try {
          return await command.handler(args);
        } catch (error) {
          return handleError(error, toolName);
        }
      });
    });

    // Register deploy commands
    Object.entries(deployCommands).forEach(([commandName, command]) => {
      const toolName = commandName;
      this.tool(toolName, command.description, command.schema, async () => {
        try {
          return await command.handler();
        } catch (error) {
          return handleError(error, toolName);
        }
      });
    });

    // Register deploy prompts
    Object.entries(deployPrompts).forEach(([promptName, prompt]) => {
      this.prompt(promptName, prompt.description, async () => {
        try {
          return await prompt.handler();
        } catch (error) {
          logger.error(`Error in prompt ${promptName}:`, error);
          throw error;
        }
      });
    });

    // Register convert prompts
    Object.entries(convertPrompts).forEach(([promptName, prompt]) => {
      this.prompt(promptName, prompt.description, prompt.args, async (args) => {
        try {
          return await prompt.handler(args);
        } catch (error) {
          logger.error(`Error in prompt ${promptName}:`, error);
          throw error;
        }
      });
    });
  }
}

export const createServer = () => {
  return new Server(
    'An MCP server for querying Pulumi Registry information and running Pulumi CLI commands'
  );
};
