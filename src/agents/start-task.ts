import { z } from 'zod';

export const startTask = {
  'start-task': {
    description:
      'Generate a deeplink URL to the Pulumi Console, where the user can continue their cloud development task using Pulumi Agents. Requires knowing the organization of the user before proceeding.',
    schema: {
      organization: z.string().describe('The Pulumi organization name (required)'),
      description: z
        .string()
        .optional()
        .describe(
          'A brief but detailed LLM-oriented description of the task that the user wishes the Pulumi Agent to perform (optional)'
        ),
      stack: z
        .string()
        .optional()
        .describe(
          'The name of the stack to which the work will be restricted to, either "project/stack" format or just "stack" name (optional)'
        ),
      repo: z
        .string()
        .optional()
        .describe(
          'The name of the Git repository to which the work will be restricted to (optional)'
        )
    },
    handler: async (args: {
      organization: string;
      description?: string;
      stack?: string;
      repo?: string;
    }) => {
      const params = new URLSearchParams();
      if (args.description) params.set('description', args.description);
      if (args.stack) params.set('stack', args.stack);
      if (args.repo) params.set('repo', args.repo);

      const queryString = params.toString();
      const url = `https://app.pulumi.com/${args.organization}/agents/tasks${queryString ? `?${queryString}` : ''}`;

      return {
        content: [{ type: 'text' as const, text: `[Continue task using Pulumi Agents](${url})` }]
      };
    }
  }
};
