import { z } from 'zod';

type NeoTaskLauncherArgs = {
  query: string;
  context?: string;
};

export const neoTaskLauncherCommands = {
  'neo-task-launcher': {
    description:
      'Launch a Neo task when user asks Neo to perform a task. Pulumi Neo is a purpose-built cloud infrastructure automation agent.',
    schema: {
      query: z.string().describe('The task query to send to Neo (what the user wants Neo to do)'),
      context: z
        .string()
        .optional()
        .describe(
          'Optional conversation context with details of work done so far. Include: 1) Summary of what the user has been working on, 2) For any files modified, provide git diff format showing the changes, 3) Textual explanation of what was changed and why. Example: "The user has been working on authentication. Files modified: src/auth.ts - Added token support: ```diff\\n- function login(user) {\\n+ function login(user, token) {\\n```\\nThis change adds token-based auth for better security."'
        )
    },
    handler: async (args: NeoTaskLauncherArgs) => {
      const token = process.env.PULUMI_ACCESS_TOKEN;

      if (!token) {
        return {
          description: 'Missing PULUMI_ACCESS_TOKEN',
          content: [
            {
              type: 'text' as const,
              text: 'PULUMI_ACCESS_TOKEN environment variable is not set. Please set it to use the Neo task launcher.'
            }
          ]
        };
      }

      if (!args.query || args.query.trim() === '') {
        return {
          description: 'Missing query parameter',
          content: [
            {
              type: 'text' as const,
              text: 'The query parameter is required and cannot be empty. Please provide what you want Neo to do.'
            }
          ]
        };
      }

      const content =
        args.context && args.context.trim() !== ''
          ? `Conversation context:

${args.context}

User request:

${args.query}`
          : args.query;

      try {
        const response = await fetch('https://api.pulumi.com/api/preview/agents/pulumi/tasks', {
          method: 'POST',
          headers: {
            Authorization: `token ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            content: content
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          return {
            description: 'API request failed',
            content: [
              {
                type: 'text' as const,
                text: `Failed to launch Neo task. Status: ${response.status}, Error: ${errorText}`
              }
            ]
          };
        }

        const result = await response.json();
        const taskId = result.taskId;

        return {
          description: 'Neo task launched successfully',
          content: [
            {
              type: 'text' as const,
              text: `I have launched a Neo task, you can complete it at https://app.pulumi.com/pulumi/neo/tasks/${taskId}`
            }
          ]
        };
      } catch (error) {
        return {
          description: 'Network error',
          content: [
            {
              type: 'text' as const,
              text: `Failed to launch Neo task due to network error: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          ]
        };
      }
    }
  }
};
