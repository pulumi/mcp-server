import { expect } from 'chai';
import { listPrompts } from './helpers.js';

describe('MCP Prompt: convert', () => {
  describe('Prompt Metadata', () => {
    it('should list convert-terraform-to-typescript as an available prompt', async function () {
      const response = await listPrompts();

      const convertPrompt = response.prompts.find(
        (prompt) => prompt.name === 'convert-terraform-to-typescript'
      );
      expect(convertPrompt).to.not.equal(undefined);
      expect(convertPrompt?.name).to.equal('convert-terraform-to-typescript');
      expect(convertPrompt?.description).to.contain('Terraform');
    });
  });
});
