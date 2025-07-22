import { expect } from 'chai';
import { testClaudeCodeInvocation, ClaudeCodeTest } from './helpers.js';
import { policyViolationsCommands } from '../src/insights/policy-violations.js';

describe('Policy Violations Tool', function () {
  describe('Direct Tool Tests (Unit Tests)', () => {
    const commands = policyViolationsCommands;

    describe('Policy violations retrieval', () => {
      it('should return policy violations for organization', async () => {
        const args = {
          org: 'test-org'
        };

        const result = await commands['policy-violations'].handler(args);
        const response = JSON.parse(result.content[0].text);

        // Test that we get violations
        expect(response.violations).to.be.an('array');
        expect(response.org).to.equal('test-org');
        expect(response.totalViolations).to.be.a('number');
        expect(response.summary).to.be.a('string');
        
        // Test mock data structure
        if (response.violations.length > 0) {
          const violation = response.violations[0];
          expect(violation).to.have.property('projectName');
          expect(violation).to.have.property('stackName');
          expect(violation).to.have.property('policyPack');
          expect(violation).to.have.property('policyName');
          expect(violation).to.have.property('resourceURN');
          expect(violation).to.have.property('message');
          expect(violation).to.have.property('level');
        }
      });

      it('should work without org parameter (defaults to mock-org in test mode)', async () => {
        const args = {};

        const result = await commands['policy-violations'].handler(args);
        const response = JSON.parse(result.content[0].text);

        // Test that default org is used
        expect(response.org).to.equal('mock-org');
        expect(response.violations).to.be.an('array');
        expect(response.totalViolations).to.be.a('number');
      });

      it('should return proper summary message', async () => {
        const args = {
          org: 'test-org'
        };

        const result = await commands['policy-violations'].handler(args);
        const response = JSON.parse(result.content[0].text);

        // Test summary format
        if (response.totalViolations === 0) {
          expect(response.summary).to.equal('No policy violations found');
        } else if (response.totalViolations === 1) {
          expect(response.summary).to.equal('Found 1 policy violation');
        } else {
          expect(response.summary).to.equal(`Found ${response.totalViolations} policy violations`);
        }
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

    describe('Natural Language to Policy Violations Tool Selection', () => {
      const policyViolationsTestCases: ClaudeCodeTest[] = [
        {
          query: 'Show me my policy violations',
          expectedTool: 'pulumi-policy-violations',
          description: 'Direct policy violations request',
          contextType: 'pulumi'
        },
        {
          query: 'Do I have any policy violations?',
          expectedTool: 'pulumi-policy-violations',
          description: 'Policy violations question',
          contextType: 'pulumi'
        },
        {
          query: 'What compliance issues do I have?',
          expectedTool: 'pulumi-policy-violations',
          description: 'Compliance violations query',
          contextType: 'pulumi'
        },
        {
          query: 'Check for security policy violations in my infrastructure',
          expectedTool: 'pulumi-policy-violations',
          description: 'Security policy violations query',
          contextType: 'pulumi'
        }
      ];

      policyViolationsTestCases.forEach((testCase) => {
        it(`should invoke policy-violations tool for: "${testCase.description}"`, async function () {
          // Increase timeout for LLM calls
          this.timeout(30000);
          
          const toolInvoked = await testClaudeCodeInvocation(testCase);

          // Verify the correct tool was invoked (Claude Code prefixes MCP tools with server name)
          const expectedTools = [
            'mcp__pulumi-mcp__pulumi-policy-violations',
            'mcp__pulumi-mcp-local__pulumi-policy-violations'
          ];
          expect(expectedTools).to.include(
            toolInvoked,
            `Expected Claude Code to invoke policy-violations tool with MCP prefix, but got: ${toolInvoked}`
          );
        });
      });

      // Test that it should NOT invoke policy violations for non-policy queries
      it('should NOT invoke policy-violations for deployment queries', async function () {
        this.timeout(30000);
        
        const testCase: ClaudeCodeTest = {
          query: 'Deploy this code to AWS',
          expectedTool: 'should-not-invoke-policy-violations',
          description: 'AWS deployment request',
          contextType: 'pulumi'
        };

        try {
          const toolInvoked = await testClaudeCodeInvocation(testCase);

          // Should NOT invoke policy violations tools
          const policyViolationsTools = [
            'mcp__pulumi-mcp__pulumi-policy-violations',
            'mcp__pulumi-mcp-local__pulumi-policy-violations'
          ];
          expect(policyViolationsTools).to.not.include(
            toolInvoked,
            `Claude incorrectly invoked policy-violations for deployment query. Got: ${toolInvoked}`
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