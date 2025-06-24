import { exec } from 'child_process';
import { promisify } from 'util';
import { Anthropic } from '@anthropic-ai/sdk';

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

// Claude API integration testing interfaces

export interface ToolInvocationTest {
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

// Claude API testing function
export async function testToolInvocation(testCase: ToolInvocationTest): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required for Claude API testing');
  }

  const client = new Anthropic({ apiKey });

  // Create a realistic project context based on explicit context type
  const contextMessage = getProjectContext(testCase.contextType);

  const messages = [
    {
      role: 'user' as const,
      content: contextMessage
    },
    {
      role: 'user' as const,
      content: testCase.query
    }
  ];

  // Create a message that includes MCP server configuration
  // This mimics the behavior of the MCP client when it invokes tools
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages,
    tools: await getMCPTools() // Get available tools from our MCP server
  });

  // Check if a tool was invoked
  const toolUseContent = response.content.find((item: any) => item.type === 'tool_use');

  if (toolUseContent && 'name' in toolUseContent) {
    return (toolUseContent as any).name;
  } else {
    throw new Error(`No tool was invoked for query: "${testCase.query}"`);
  }
}

// Helper to get MCP tools in Anthropic API format
async function getMCPTools(): Promise<any[]> {
  try {
    const toolsResponse = await listTools();

    return toolsResponse.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as any
    }));
  } catch (error) {
    console.error('Failed to get MCP tools:', error);
    return [];
  }
}
