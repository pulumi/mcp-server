import { promptHandler } from '../prompts/prompts.js';

export const convertPrompts = {
  'convert-terraform-to-typescript': {
    name: 'convert-terraform-to-typescript',
    description: 'Convert a Terraform program to a Pulumi TypeScript program',
    handler: () => promptHandler('convert-terraform-to-typescript')
  }
};
