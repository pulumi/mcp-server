/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from 'chai';
import { testClaudeCodeInvocation, ClaudeCodeTest } from './helpers.js';

describe('Claude Code SDK - Tool Selection Tests', function () {
  before(function () {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('Skipping Claude Code SDK tests - no API key');
      this.skip();
    }
  });

  describe('Deploy to AWS Tool Selection', () => {
    const deployTestCases: ClaudeCodeTest[] = [
      {
        query: 'Deploy this code to AWS',
        expectedTool: 'deploy-to-aws',
        description: 'Direct deployment request',
        contextType: 'nodejs'
      },
      {
        query: 'How do I deploy this app to the cloud',
        expectedTool: 'deploy-to-aws',
        description: 'General cloud deployment request',
        contextType: 'nodejs'
      }
    ];

    deployTestCases.forEach((testCase) => {
      it(`should invoke deploy-to-aws tool for: "${testCase.description}"`, async function () {
        const toolsInvoked = await testClaudeCodeInvocation(testCase);

        // Verify that one of the invoked tools contains 'deploy-to-aws'
        const deployTool = toolsInvoked.find((tool) => tool.includes('deploy-to-aws'));
        expect(
          deployTool,
          `Expected Claude Code to invoke a tool containing 'deploy-to-aws', but got: ${toolsInvoked.join(', ')}`
        ).to.not.be.undefined;
      });
    });

    // Negative test - should NOT invoke deploy-to-aws for Azure
    it('should NOT invoke deploy-to-aws tool for Azure deployment', async function () {
      const testCase: ClaudeCodeTest = {
        query: 'Deploy this code to Azure',
        expectedTool: 'should-not-invoke-any-tool',
        description: 'Azure deployment request',
        contextType: 'nodejs'
      };

      const toolsInvoked = await testClaudeCodeInvocation(testCase);

      // Show what tools were actually invoked
      console.log('Tools invoked for Azure deployment:', toolsInvoked.join(', '));

      // This test should pass - we expect Claude to NOT invoke any tool containing 'deploy-to-aws' for Azure
      const deployTool = toolsInvoked.find((tool) => tool.includes('deploy-to-aws'));
      expect(
        deployTool,
        `Claude incorrectly invoked a deploy-to-aws tool for Azure deployment. This shows the tool selection is too broad. Got: ${deployTool}`
      ).to.be.undefined;
    });
  });
});
