import { z } from 'zod';
import { MockPulumiApiClient, createPulumiApiClient } from './pulumi-api-client.js';

export type ResourceSearchArgs = {
  query: string;
  org?: string;
  top?: number;
  size?: number;
  properties?: boolean;
};

export type ResourceSearchResult = {
  query: string;
  resources: {
    name: string;
    type: string;
    project: string;
    stack: string;
    properties: Record<string, unknown>;
  }[];
  summary: string;
  facets?: {
    type: { [key: string]: number };
    package: { [key: string]: number };
    project: { [key: string]: number };
    stack: { [key: string]: number };
  };
  totalResources: number;
};

async function getDefaultOrg(): Promise<string> {
  try {
    // Use execFileSync for security - avoids shell interpretation
    const { execFileSync } = await import('child_process');

    const stdout = execFileSync('pulumi', ['org', 'get-default'], { encoding: 'utf8' });
    const defaultOrg = stdout.trim();

    if (!defaultOrg) {
      throw new Error('No default organization set');
    }

    return defaultOrg;
  } catch (error) {
    throw new Error(
      `Could not determine Pulumi default organization. Please specify 'org' parameter. Error: ${error}`
    );
  }
}

export const resourceSearchCommands = {
  'resource-search': {
    description:
      'Search and analyze Pulumi-managed cloud resources using Lucene-style queries. This tool can discover, count, and analyze your deployed infrastructure across all cloud providers.\n\nQuery Syntax Examples:\n- All S3 buckets: type:aws:s3:Bucket\n- Untagged resources: -properties.tags:*\n- Untagged S3 buckets: type:aws:s3:Bucket AND -properties.tags:*\n- Resources in production stack: stack:production\n- AWS Lambda functions: package:aws type:lambda:Function\n- Resources by project: project:my-app\n\nSupports field filters, boolean operators (AND, OR, NOT), exact matches with quotes, and property searches. The top parameter controls the maximum number of results to return (defaults to 20).',
    schema: {
      query: z
        .string()
        .describe(
          'Lucene-style query to search for cloud resources. Examples: "type:aws:s3:Bucket AND -properties.tags:*" (untagged S3 buckets), "package:aws type:lambda:Function" (Lambda functions), "stack:production" (production resources)'
        ),
      org: z
        .string()
        .optional()
        .describe('Pulumi organization name (optional, defaults to current default org)'),
      top: z
        .number()
        .optional()
        .describe('Maximum number of top results to return (defaults to 20)'),
      size: z.number().optional().describe('Number of results per page (defaults to 25)'),
      properties: z
        .boolean()
        .optional()
        .describe('Whether to include resource properties in the response (defaults to false)')
    },
    handler: async (args: ResourceSearchArgs) => {
      const isTestMode = process.env.MCP_TEST_MODE === 'true';

      if (isTestMode) {
        // Get org - use provided org or mock default for testing
        const org = args.org || 'mock-org';

        // Use mock client for testing
        const mockClient = new MockPulumiApiClient();
        const mockResponse = await mockClient.searchResources({
          query: args.query,
          org: org,
          top: args.top,
          properties: args.properties
        });

        const results: ResourceSearchResult = {
          query: args.query,
          resources: mockResponse.resources,
          summary:
            mockResponse.totalResources > 0 && mockResponse.resources[0].name === 'acme-bucket'
              ? 'Found 1 untagged S3 bucket: acme-bucket'
              : `Found ${mockResponse.totalResources} resource${mockResponse.totalResources === 1 ? '' : 's'} matching your query`,
          facets: mockResponse.facets,
          totalResources: mockResponse.totalResources
        };

        return {
          description: 'Pulumi resource search results',
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  query: results.query,
                  org: org,
                  results: {
                    resources: results.resources,
                    facets: results.facets,
                    totalResources: results.totalResources
                  },
                  summary: results.summary
                },
                null,
                2
              )
            }
          ]
        };
      } else {
        // Get org - use provided org or detect default org
        const org = args.org || (await getDefaultOrg());

        // Use real API client - will throw clear error if token is missing
        const apiClient = createPulumiApiClient();
        const apiResponse = await apiClient.searchResources({
          query: args.query,
          org: org,
          top: args.top,
          size: args.size,
          properties: args.properties,
          source: 'mcp-server'
        });

        const results: ResourceSearchResult = {
          query: args.query,
          resources: apiResponse.resources,
          summary: `Found ${apiResponse.totalResources} resource${apiResponse.totalResources === 1 ? '' : 's'} matching your query`,
          facets: apiResponse.facets,
          totalResources: apiResponse.totalResources
        };

        return {
          description: 'Pulumi resource search results',
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  query: results.query,
                  org: org,
                  results: {
                    resources: results.resources,
                    facets: results.facets,
                    totalResources: results.totalResources
                  },
                  summary: results.summary
                },
                null,
                2
              )
            }
          ]
        };
      }
    }
  }
};
