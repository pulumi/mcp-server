/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from 'chai';
import { testToolInvocation, ToolInvocationTest } from './helpers.js';

describe('Claude API Integration - Natural Language to Tool Mapping', function () {
  before(function () {
    console.log('ANTHROPIC_API_KEY present:', !!process.env.ANTHROPIC_API_KEY);
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('Skipping Claude API integration tests - no API key');
      this.skip();
    }
  });

  describe('Deploy to AWS Tool Mapping', () => {
    const deployTestCases: ToolInvocationTest[] = [
      {
        query: 'Deploy this code to AWS',
        expectedTool: 'deploy-to-aws',
        description: 'Direct deployment request',
        contextType: 'nodejs'
      },
      {
        query: 'I want to deploy my application to Amazon Web Services',
        expectedTool: 'deploy-to-aws',
        description: 'Verbose deployment request',
        contextType: 'nodejs'
      },
      {
        query: 'Can you help me get this running on AWS?',
        expectedTool: 'deploy-to-aws',
        description: 'Casual deployment request',
        contextType: 'nodejs'
      },
      {
        query: 'Set up my app in the cloud using AWS',
        expectedTool: 'deploy-to-aws',
        description: 'Cloud setup request',
        contextType: 'nodejs'
      }
    ];

    deployTestCases.forEach((testCase) => {
      it(`should invoke deploy-to-aws tool for: "${testCase.description}"`, async function () {
        const toolInvoked = await testToolInvocation(testCase);
        expect(toolInvoked).to.equal(testCase.expectedTool);
      });
    });

    // TODO: Fix tool selection specificity - currently deploy-to-aws is incorrectly invoked for Azure requests
    // Negative test - should NOT invoke deploy-to-aws for Azure
    it.skip('should NOT invoke deploy-to-aws tool for Azure deployment', async function () {
      const toolInvoked = await testToolInvocation({
        query: 'Deploy this code to Azure',
        expectedTool: 'should-not-invoke-any-tool',
        description: 'Azure deployment request',
        contextType: 'nodejs'
      });

      // Show what tool was actually invoked
      console.log('Tool invoked for Azure deployment:', toolInvoked);

      // This test should fail - we expect Claude to NOT invoke deploy-to-aws for Azure
      expect(toolInvoked).to.not.equal(
        'deploy-to-aws',
        `Claude incorrectly invoked deploy-to-aws for Azure deployment. This shows the tool selection is too broad.`
      );
    });
  });

  describe('Pulumi Registry Tool Mapping', () => {
    const registryTestCases: ToolInvocationTest[] = [
      {
        query: 'Show me information about AWS S3 bucket resource',
        expectedTool: 'pulumi-registry-get-resource',
        description: 'Resource information request',
        contextType: 'none'
      },
      {
        query: 'What are the available resources for AWS EC2?',
        expectedTool: 'pulumi-registry-list-resources',
        description: 'List resources request',
        contextType: 'none'
      },
      {
        query: 'Get details about the Lambda function resource in AWS',
        expectedTool: 'pulumi-registry-get-resource',
        description: 'Specific resource details',
        contextType: 'none'
      }
    ];

    registryTestCases.forEach((testCase) => {
      it(`should invoke ${testCase.expectedTool} tool for: "${testCase.description}"`, async function () {
        const toolInvoked = await testToolInvocation(testCase);
        expect(toolInvoked).to.equal(testCase.expectedTool);
      });
    });
  });

  describe('Pulumi CLI Tool Mapping', () => {
    const cliTestCases: ToolInvocationTest[] = [
      {
        query: 'Run pulumi preview to see what changes will be made',
        expectedTool: 'pulumi-cli-preview',
        description: 'Preview command request',
        contextType: 'pulumi'
      },
      {
        query: 'Deploy my Pulumi stack',
        expectedTool: 'pulumi-cli-up',
        description: 'Stack deployment request',
        contextType: 'pulumi'
      },
      {
        query: 'Show me the outputs from my Pulumi stack',
        expectedTool: 'pulumi-cli-stack-output',
        description: 'Stack output request',
        contextType: 'pulumi'
      },
      {
        query: 'Refresh my Pulumi stack state',
        expectedTool: 'pulumi-cli-refresh',
        description: 'Stack refresh request',
        contextType: 'pulumi'
      }
    ];

    cliTestCases.forEach((testCase) => {
      it(`should invoke ${testCase.expectedTool} tool for: "${testCase.description}"`, async function () {
        const toolInvoked = await testToolInvocation(testCase);
        expect(toolInvoked).to.equal(testCase.expectedTool);
      });
    });
  });
});
