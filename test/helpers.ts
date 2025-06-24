import { exec } from 'child_process';
import { promisify } from 'util';
import { query } from '@anthropic-ai/claude-code';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

export interface InspectorTool {
  name: string;
  description: string;
  inputSchema: object;
}

export interface InspectorPrompt {
  name: string;
  description: string;
  arguments: object;
}

export interface InspectorTextContent {
  type: 'text';
  text: string;
}

export interface ListToolsResponse {
  tools: InspectorTool[];
}

export interface ListPromptsResponse {
  prompts: InspectorPrompt[];
}

export interface ToolCallResponse {
  content: InspectorTextContent[];
}

async function runInspectorCommand<T>(command: string): Promise<T> {
  const inspectorCommand = `npx @modelcontextprotocol/inspector --cli node dist/index.js stdio ${command}`;
  try {
    const { stdout } = await execAsync(inspectorCommand);
    return JSON.parse(stdout) as T;
  } catch (error) {
    if (error instanceof Error && 'stdout' in error) {
      console.error('Command stdout:', error.stdout);
      if ('stderr' in error) {
        console.error('Command stderr:', error.stderr);
      }
    }
    throw error;
  }
}

export function listTools(): Promise<ListToolsResponse> {
  return runInspectorCommand<ListToolsResponse>('--method tools/list');
}

export function listPrompts(): Promise<ListPromptsResponse> {
  return runInspectorCommand<ListPromptsResponse>('--method prompts/list');
}

export function callTool(toolName: string, args?: string): Promise<ToolCallResponse> {
  let command = `--method tools/call --tool-name ${toolName}`;
  if (args) {
    command += ` ${args}`;
  }
  return runInspectorCommand<ToolCallResponse>(command);
}

// Claude Code SDK testing interface

export interface ClaudeCodeTest {
  query: string;
  expectedTool: string;
  description: string;
  contextType?: 'nodejs' | 'pulumi' | 'none';
}

// Helper to create realistic project context based on explicit context type
function getProjectContext(contextType?: string): string {
  switch (contextType) {
    case 'nodejs':
      return `I have a Node.js web application with the following structure:

package.json:
{
  "name": "my-web-app",
  "version": "1.0.0",
  "main": "app.js",
  "scripts": {
    "start": "node app.js"
  },
  "dependencies": {
    "express": "^4.18.0"
  }
}

app.js:
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(\`Server running on port \${port}\`);
});`;

    case 'pulumi':
      return `I have a Pulumi project in the current directory (/my-project) with the following files:

Pulumi.yaml:
name: my-infrastructure
runtime: nodejs

index.ts:
import * as aws from "@pulumi/aws";

const bucket = new aws.s3.Bucket("my-bucket");
export const bucketName = bucket.id;`;

    case 'none':
    default:
      return `I have a development environment set up and ready.`;
  }
}


// Claude Code SDK testing function
export async function testClaudeCodeInvocation(testCase: ClaudeCodeTest): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required for Claude Code SDK testing'
    );
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Create project context
  const projectContext = getProjectContext(testCase.contextType);

  let toolInvoked: string | null = null;
  let toolFound = false;

  try {
    // Use Claude Code SDK to process the request
    for await (const message of query({
      prompt: `${projectContext}\n\n${testCase.query}`,
      options: {
        maxTurns: 1,
        // Configure our MCP server
        mcpServers: {
          'pulumi-mcp': {
            command: 'node',
            args: [path.resolve(__dirname, '../dist/index.js'), 'stdio'],
            env: {
              MCP_TEST_MODE: 'true'
            }
          }
        }
      }
    })) {
      // Check for tool usage in the message
      if (message.type === 'assistant') {
        // Look for tool use in message
        if ('message' in message && (message as any).message?.content) {
          for (const item of (message as any).message.content) {
            if (item.type === 'tool_use') {
              toolInvoked = item.name;
              toolFound = true;
              console.log('✅ Tool invoked by Claude Code:', toolInvoked);
              break;
            }
          }
        }
      }

      if (toolFound) break;
    }
  } catch (error) {
    console.error('Claude Code SDK error:', error);
    throw error;
  }

  if (!toolInvoked) {
    throw new Error(`No tool was invoked for query: "${testCase.query}"`);
  }

  return toolInvoked;
}
