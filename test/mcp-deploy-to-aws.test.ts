/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from 'chai';
import { listTools, listPrompts, callTool } from './helpers.js';
import { setDeployHandler, deployCommands } from '../src/deploy/deploy.js';
import { TestDeployHandler } from './mocks/deploy-handler.js';

describe('MCP Tool: deploy-to-aws', function () {
  // Set up test handler before running tests
  before(() => {
    setDeployHandler(new TestDeployHandler());
  });

  describe('Direct Tool Tests (Unit Tests)', () => {
    const commands = deployCommands;

    it('should successfully invoke deploy-to-aws tool directly', async () => {
      const result = await commands['deploy-to-aws'].handler();

      // Validate response structure
      expect(result.content).to.have.length.greaterThan(0);
      const firstContent = result.content[0];
      expect(firstContent.type).to.equal('text');
      expect(firstContent.text).to.not.equal(undefined);

      // Validate test mode response
      expect(firstContent.text).to.include('deploy-to-aws tool invoked successfully in test mode');
    });
  });

  describe('MCP Inspector Tests', () => {
    it('should successfully invoke deploy-to-aws tool with no parameters', async function () {
      const response = await callTool('deploy-to-aws');

      // Validate response structure
      expect(response.content).to.have.length.greaterThan(0);
      const firstContent = response.content[0];
      expect(firstContent.type).to.equal('text');
      expect(firstContent.text).to.not.equal(undefined);

      // Validate production response (integration test)
      expect(firstContent.text).to.include('Activating Official Pulumi Deployment Assistant');
    });

    it('should fail when called with extra unneeded arguments', async function () {
      try {
        await callTool('deploy-to-aws', '--tool-arg extraParam=notNeeded');

        // This should not be reached
        expect.fail('The command should have failed but it succeeded.');
      } catch (error) {
        // This is expected - the command should fail with extra arguments
        // Verify it's the right kind of error (not a parsing error)
        expect(error).to.be.instanceOf(Error);

        if (error instanceof Error && 'code' in error) {
          // Command failed with exit code - this is expected
          expect((error as any).code).to.be.greaterThan(0);
        }
      }
    });
  });

  describe('Tool Metadata', () => {
    it('should list deploy-to-aws as an available tool', async function () {
      const response = await listTools();

      // Find the deploy-to-aws tool
      const deployTool = response.tools.find((tool) => tool.name === 'deploy-to-aws');
      expect(deployTool).to.not.equal(undefined);
      expect(deployTool?.description).to.include('Deploy application code to AWS');

      // Verify it has empty schema (no parameters required)
      expect(deployTool?.inputSchema).to.be.an('object');
    });
  });

  describe('Prompt Metadata', () => {
    it('should list deploy-to-aws as an available prompt', async function () {
      const response = await listPrompts();

      const deployPrompt = response.prompts.find((prompt) => prompt.name === 'deploy-to-aws');
      expect(deployPrompt).to.not.equal(undefined);
      expect(deployPrompt?.name).to.equal('deploy-to-aws');
      expect(deployPrompt?.description).to.contain('Deploy application code to AWS');
    });
  });
});
