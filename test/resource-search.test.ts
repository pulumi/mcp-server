import { expect } from 'chai';
import { testClaudeCodeInvocation, ClaudeCodeTest } from './helpers.js';
import { resourceSearchCommands } from '../src/insights/resource-search.js';

describe('Resource Search Tool', function () {
  describe('Direct Tool Tests (Unit Tests)', () => {
    const commands = resourceSearchCommands;

    describe('Untagged S3 buckets query', () => {
      it('should return acme-bucket for untagged S3 bucket query', async () => {
        const args = {
          query: 'type:aws:s3:Bucket AND -properties.tags:*'
          // org will default to 'mock-org' in test mode
        };

        const result = await commands['resource-search'].handler(args);
        const response = JSON.parse(result.content[0].text);

        // Test that we get the expected resource
        expect(response.results.resources).to.have.lengthOf(1);
        expect(response.results.resources[0].name).to.equal('acme-bucket');
      });
    });

    describe('Default query handling', () => {
      it('should return default resource for non-S3 queries', async () => {
        const args = {
          query: 'package:aws type:lambda:Function'
          // org will default to 'mock-org' in test mode
        };

        const result = await commands['resource-search'].handler(args);
        const response = JSON.parse(result.content[0].text);

        // Test that we get the default resource
        expect(response.results.resources).to.have.lengthOf(1);
        expect(response.results.resources[0].name).to.equal('example-resource');
      });
    });
  });

  describe('Claude Code SDK Integration Tests', function () {
    before(function () {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.log('Skipping Claude Code SDK tests - no API key');
        this.skip();
      }
    });

    describe('Natural Language to Resource Search Tool Selection', () => {
      const resourceSearchTestCases: ClaudeCodeTest[] = [
        {
          query: 'Do I have any untagged S3 buckets?',
          expectedTool: 'pulumi-resource-search',
          description: 'Untagged S3 buckets query',
          contextType: 'pulumi'
        },
        {
          query: 'List all deployed Lambda functions in my AWS infrastructure',
          expectedTool: 'pulumi-resource-search',
          description: 'Lambda functions query',
          contextType: 'pulumi'
        },
        {
          query: 'Search for all EC2 instances in my production stack',
          expectedTool: 'pulumi-resource-search',
          description: 'Stack-based resource search query',
          contextType: 'pulumi'
        },
        {
          query: 'Find all my RDS database instances across all stacks',
          expectedTool: 'pulumi-resource-search',
          description: 'Resource type search query',
          contextType: 'pulumi'
        }
      ];

      resourceSearchTestCases.forEach((testCase) => {
        it(`should invoke resource-search tool for: "${testCase.description}"`, async function () {
          const toolInvoked = await testClaudeCodeInvocation(testCase);

          // Verify the correct tool was invoked (Claude Code prefixes MCP tools with server name)
          const expectedTools = [
            'mcp__pulumi-mcp__pulumi-resource-search',
            'mcp__pulumi-mcp-local__pulumi-resource-search'
          ];
          expect(expectedTools).to.include(
            toolInvoked,
            `Expected Claude Code to invoke resource-search tool with MCP prefix, but got: ${toolInvoked}`
          );
        });
      });

      // Test that it should NOT invoke resource search for non-resource queries
      it('should NOT invoke resource-search for deployment queries', async function () {
        const testCase: ClaudeCodeTest = {
          query: 'Deploy this code to AWS',
          expectedTool: 'should-not-invoke-resource-search',
          description: 'AWS deployment request',
          contextType: 'pulumi'
        };

        try {
          const toolInvoked = await testClaudeCodeInvocation(testCase);

          // Should NOT invoke resource search tools
          const resourceSearchTools = [
            'mcp__pulumi-mcp__pulumi-resource-search',
            'mcp__pulumi-mcp-local__pulumi-resource-search'
          ];
          expect(resourceSearchTools).to.not.include(
            toolInvoked,
            `Claude incorrectly invoked resource-search for deployment query. Got: ${toolInvoked}`
          );
        } catch (error) {
          // If no tool was invoked or a different tool was invoked, that's fine for this test
          if (error instanceof Error && error.message.includes('No tool was invoked')) {
            console.log('✅ Correct behavior: No tool invoked for deployment query');
            return;
          }
          // For other errors, we still want to verify the tool name if it was invoked
          throw error;
        }
      });
    });
  });
});
