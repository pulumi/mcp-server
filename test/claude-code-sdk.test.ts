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
        const toolInvoked = await testClaudeCodeInvocation(testCase);

        // Verify the correct tool was invoked (Claude Code prefixes MCP tools with server name)
        const expectedTools = [
          'mcp__pulumi-mcp__deploy-to-aws',
          'mcp__pulumi-mcp-local__deploy-to-aws'
        ];
        expect(expectedTools).to.include(
          toolInvoked,
          `Expected Claude Code to invoke deploy-to-aws tool with MCP prefix, but got: ${toolInvoked}`
        );
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

      try {
        const toolInvoked = await testClaudeCodeInvocation(testCase);

        // Show what tool was actually invoked
        console.log('Tool invoked for Azure deployment:', toolInvoked);

        // This test should fail - we expect Claude to NOT invoke deploy-to-aws for Azure
        const awsTools = ['mcp__pulumi-mcp__deploy-to-aws', 'mcp__pulumi-mcp-local__deploy-to-aws'];
        expect(awsTools).to.not.include(
          toolInvoked,
          `Claude incorrectly invoked deploy-to-aws for Azure deployment. This shows the tool selection is too broad.`
        );
      } catch (error) {
        // If no tool was invoked, that's actually the correct behavior for Azure
        if (error instanceof Error && error.message.includes('No tool was invoked')) {
          console.log('✅ Correct behavior: No tool invoked for Azure deployment');
          return; // Test passes
        }
        throw error; // Re-throw other errors
      }
    });
  });
});
