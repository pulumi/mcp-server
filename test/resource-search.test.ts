import { expect } from 'chai';
import { testClaudeCodeInvocation, ClaudeCodeTest } from './helpers.js';
import {
  resourceSearchCommands,
  setResourceSearchHandler
} from '../src/insights/resource-search.js';
import { TestResourceSearchHandler } from './mocks/resource-search-handler.js';

describe('Resource Search Tool', function () {
  // Set up test handler before running tests
  before(() => {
    setResourceSearchHandler(new TestResourceSearchHandler());
  });

  describe('Direct Tool Tests (Unit Tests)', () => {
    const commands = resourceSearchCommands;

    describe('Untagged S3 buckets query', () => {
      it('should return acme-bucket for untagged S3 bucket query', async () => {
        const args = {
          query: 'type:aws:s3:Bucket AND -properties.tags:*',
          org: 'mock-org'
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
          query: 'package:aws type:lambda:Function',
          org: 'mock-org'
        };

        const result = await commands['resource-search'].handler(args);
        const response = JSON.parse(result.content[0].text);

        // Test that we get the default resource
        expect(response.results.resources).to.have.lengthOf(1);
        expect(response.results.resources[0].name).to.equal('example-resource');
      });
    });

    describe('Properties parameter handling', () => {
      it('should pass properties parameter to the search request', async () => {
        const args = {
          query: 'type:aws:s3:Bucket -properties.tags:*',
          properties: true,
          org: 'mock-org'
        };

        const result = await commands['resource-search'].handler(args);
        const response = JSON.parse(result.content[0].text);

        // Test that we get a resource with properties
        expect(response.results.resources).to.have.lengthOf(1);
        expect(response.results.resources[0]).to.have.property('properties');
        expect(response.results.resources[0].properties).to.be.an('object');
        expect(response.results.resources[0].properties['region']).to.equal('us-west-2');
      });

      it('should handle properties parameter set to false', async () => {
        const args = {
          query: 'type:aws:s3:Bucket -properties.tags:*',
          properties: false,
          org: 'mock-org'
        };

        const result = await commands['resource-search'].handler(args);
        const response = JSON.parse(result.content[0].text);

        // Test that we still get a resource (properties behavior is handled by API)
        expect(response.results.resources).to.have.lengthOf(1);
        expect(response.results.resources[0]).to.have.property('properties');
        expect(JSON.stringify(response.results.resources[0].properties)).to.equal('{}');
      });

      it('should work without properties parameter (defaults to false)', async () => {
        const args = {
          query: 'type:aws:s3:Bucket -properties.tags:*',
          org: 'mock-org'
        };

        const result = await commands['resource-search'].handler(args);
        const response = JSON.parse(result.content[0].text);

        // Test that we get a resource without explicitly setting properties
        expect(response.results.resources).to.have.lengthOf(1);
        expect(response.results.resources[0]).to.have.property('properties');
        expect(JSON.stringify(response.results.resources[0].properties)).to.equal('{}');
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
          const toolsInvoked = await testClaudeCodeInvocation(testCase);

          // Verify that one of the invoked tools contains 'resource-search'
          const searchTool = toolsInvoked.find(tool => tool.includes('resource-search'));
          expect(searchTool, `Expected Claude Code to invoke a tool containing 'resource-search', but got: ${toolsInvoked.join(', ')}`).to.not.be.undefined;
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

        const toolsInvoked = await testClaudeCodeInvocation(testCase);

        // Should NOT invoke any tool containing 'resource-search'
        const searchTool = toolsInvoked.find(tool => tool.includes('resource-search'));
        expect(searchTool, `Claude incorrectly invoked a resource-search tool for deployment query. Got: ${searchTool}`).to.be.undefined;
      });
    });
  });
});
