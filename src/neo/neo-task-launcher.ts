import { z } from 'zod';

type NeoTaskLauncherArgs = {
  query: string;
  context?: string;
};

export const neoTaskLauncherCommands = {
  'neo-task-launcher': {
    description: 'Launch a Neo task when user asks Neo to do something',
    schema: {
      query: z.string().describe('The task query to send to Neo (what the user wants Neo to do)'),
      context: z
        .string()
        .optional()
        .describe(
          'Optional conversation context - summary of what the user has been working on or discussing'
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

      const contextSection = args.context ? args.context : '';

      const content = `# Conversation context
${contextSection}

# User request
${args.query}`;

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
