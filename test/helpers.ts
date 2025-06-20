import { exec } from 'child_process';
import { promisify } from 'util';

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
