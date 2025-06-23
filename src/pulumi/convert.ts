import { z } from 'zod';
import { promptHandler } from '../prompts/prompts.js';

export const convertPrompts = {
  'convert-terraform-to-typescript': {
    name: 'convert-terraform-to-typescript',
    description: 'Converts a Terraform file to TypeScript',
    args: {
      outputDir: z.string().describe('The directory to output the TypeScript code to').optional()
    },
    handler: async (args: { outputDir?: string }) => {
      return await promptHandler('convert-terraform-to-typescript', {
        outputDir: args.outputDir ?? './pulumi'
      });
    }
  }
};
