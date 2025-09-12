import { z } from 'zod';

type NeoTaskLauncherArgs = {
  query: string;
  context?: string;
};

async function pollTaskEvents(taskId: string, token: string): Promise<string[]> {
  const messages: string[] = [];
  const startTime = Date.now();
  const maxTimeout = 5 * 60 * 1000; // 5 minutes

  while (Date.now() - startTime < maxTimeout) {
    try {
      const response = await fetch(
        `https://api.pulumi.com/api/preview/agents/pulumi/tasks/${taskId}/events`,
        {
          method: 'GET',
          headers: {
            Authorization: `token ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Events API returned status ${response.status}`);
      }

      const data = await response.json();

      // Process new assistant messages
      if (data.events) {
        for (const event of data.events) {
          if (event.type === 'agentResponse' && event.eventBody?.type === 'assistant_message') {
            const content = event.eventBody.content;
            if (content && !messages.includes(content)) {
              messages.push(content);
            }

            // Check if this is the final message
            if (event.eventBody.is_final === true) {
              return messages;
            }
          }
        }
      }

      // Wait 1 second before polling again
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      throw new Error(
        `Error polling task events: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  throw new Error('Task polling timed out after 5 minutes');
}

export const neoTaskLauncherCommands = {
  'neo-task-launcher': {
    description: 'Launch a Neo task when user asks Neo to do something',
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

      const requestContent =
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
            content: requestContent
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

        // Poll for task completion
        const messages = await pollTaskEvents(taskId, token);

        const content = [
          {
            type: 'text' as const,
            text: `Neo task launched at https://app.pulumi.com/pulumi/neo/tasks/${taskId}\n\nNeo's response:`
          }
        ];

        // Add each message as a separate content block
        messages.forEach((message) => {
          content.push({
            type: 'text' as const,
            text: message
          });
        });

        return {
          description: 'Neo task completed successfully',
          content: content
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
