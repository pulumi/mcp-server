import { z } from 'zod';
import * as automation from '@pulumi/pulumi/automation/index.js';

type PreviewArgs = {
  workDir: string;
  stackName?: string;
};

type UpArgs = {
  workDir: string;
  stackName?: string;
};

type RefreshArgs = {
  workDir: string;
  stackName?: string;
};

export const cliCommands = {
  preview: {
    description: 'Run pulumi preview for a given project and stack',
    schema: {
      workDir: z.string().describe('The working directory of the program.'),
      stackName: z.string().optional().describe("The associated stack name. Defaults to 'dev'.")
    },
    handler: async (args: PreviewArgs) => {
      const stackArgs: automation.LocalProgramArgs = {
        stackName: args.stackName ?? 'dev',
        workDir: args.workDir
      };

      const stack = await automation.LocalWorkspace.createOrSelectStack(stackArgs);

      // Run preview
      const previewResult = await stack.preview({ diff: true });

      // Format the changes
      const changes = previewResult.changeSummary;
      const changesSummary = [
        `Create: ${changes.create}`,
        `Update: ${changes.update}`,
        `Delete: ${changes.delete}`,
        `Same: ${changes.same}`
      ].join('\n');

      return {
        description: 'Pulumi Preview Results',
        content: [
          {
            type: 'text' as const,
            text: `
Preview Results for stack: ${stack.name}

Changes:
${changesSummary}

${previewResult.stdout || 'No additional output'}
`
          }
        ]
      };
    }
  },

  up: {
    description: 'Run pulumi up for a given project and stack',
    schema: {
      workDir: z.string().describe('The working directory of the program.'),
      stackName: z.string().optional().describe("The associated stack name. Defaults to 'dev'.")
    },
    handler: async (args: UpArgs) => {
      const stackArgs: automation.LocalProgramArgs = {
        stackName: args.stackName ?? 'dev',
        workDir: args.workDir
      };

      const stack = await automation.LocalWorkspace.createOrSelectStack(stackArgs);

      // Run up
      const upResult = await stack.up();

      // Format the changes
      const changes = upResult.summary.resourceChanges!;
      const changesSummary = [
        `Create: ${changes.create}`,
        `Update: ${changes.update}`,
        `Delete: ${changes.delete}`,
        `Same: ${changes.same}`
      ].join('\n');

      return {
        description: 'Pulumi Up Results',
        content: [
          {
            type: 'text' as const,
            text: `
Deployment Results for stack: ${stack.name}

Changes:
${changesSummary}

${upResult.stdout || 'No additional output'}
`
          }
        ]
      };
    }
  },

  refresh: {
    description: 'Run pulumi refresh for a given project and stack',
    schema: {
      workDir: z.string().describe('The working directory of the program.'),
      stackName: z.string().optional().describe("The associated stack name. Defaults to 'dev'.")
    },
    handler: async (args: RefreshArgs) => {
      const stackArgs: automation.LocalProgramArgs = {
        stackName: args.stackName ?? 'dev',
        workDir: args.workDir
      };

      const stack = await automation.LocalWorkspace.createOrSelectStack(stackArgs);

      // Run refresh
      const refreshResult = await stack.refresh();

      // Format the changes
      const changes = refreshResult.summary.resourceChanges!;
      const changesSummary = [
        `Create: ${changes.create}`,
        `Update: ${changes.update}`,
        `Delete: ${changes.delete}`,
        `Same: ${changes.same}`
      ].join('\n');

      return {
        description: 'Pulumi Refresh Results',
        content: [
          {
            type: 'text' as const,
            text: `
Refresh Results for stack: ${stack.name}

Changes:
${changesSummary}

${refreshResult.stdout || 'No additional output'}
`
          }
        ]
      };
    }
  },

  'stack-output': {
    description: 'Get the output value(s) of a given stack',
    schema: {
      workDir: z.string().describe('The working directory of the program.'),
      stackName: z.string().optional().describe("The associated stack name. Defaults to 'dev'."),
      outputName: z.string().optional().describe('The specific stack output name to retrieve.')
    },
    handler: async (args: { workDir: string; stackName?: string; outputName?: string }) => {
      const stackArgs: automation.LocalProgramArgs = {
        stackName: args.stackName ?? 'dev',
        workDir: args.workDir
      };

      const stack = await automation.LocalWorkspace.selectStack(stackArgs);

      // Get stack outputs
      const outputs = await stack.outputs();

      let description: string;
      let outputContent: string;

      if (args.outputName) {
        // Return a specific output
        const specificOutput = outputs[args.outputName];
        if (specificOutput) {
          description = `Pulumi Stack Output: ${args.outputName}`;
          outputContent = `${args.outputName}: ${JSON.stringify(specificOutput.value)}`;
        } else {
          description = `Pulumi Stack Output: ${args.outputName}`;
          outputContent = `Output '${args.outputName}' not found.`;
        }
      } else {
        // Return all outputs
        description = 'Pulumi Stack Outputs';
        outputContent = Object.entries(outputs)
          .map(([key, value]) => `${key}: ${JSON.stringify(value.value)}`)
          .join('\\n');
        if (!outputContent) {
          outputContent = 'No outputs found';
        }
      }

      return {
        description: description,
        content: [
          {
            type: 'text' as const,
            text: `
Stack: ${stack.name}

${outputContent}
`
          }
        ]
      };
    }
  }
};
