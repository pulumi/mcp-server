import { z } from 'zod';
import {
  MockPulumiApiClient,
  createPulumiSearchApiClient,
  PulumiSearchApiClient
} from './pulumi-api-client.js';

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
    // Use shell execution to run 'pulumi org get-default' directly
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const { stdout } = await execAsync('pulumi org get-default');
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

/**
 * Abstract base class for resource search handling
 */
abstract class ResourceSearchHandler {
  abstract createClient(): PulumiSearchApiClient;

  async handle(args: ResourceSearchArgs) {
    // Get org - use provided org or detect default org
    const org = args.org || (await getDefaultOrg());

    const client = this.createClient();
    const apiResponse = await client.searchResources({
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
      summary: this.createSummary(apiResponse),
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

  private createSummary(response: {
    totalResources: number;
    resources: { name?: string }[];
  }): string {
    return `Found ${response.totalResources} resource${response.totalResources === 1 ? '' : 's'} matching your query`;
  }
}

class ProductionResourceSearchHandler extends ResourceSearchHandler {
  createClient(): PulumiSearchApiClient {
    return createPulumiSearchApiClient();
  }
}

class TestResourceSearchHandler extends ResourceSearchHandler {
  createClient(): PulumiSearchApiClient {
    return new MockPulumiApiClient();
  }
}

// Create the appropriate handler based on test mode
const handler =
  process.env.MCP_TEST_MODE === 'true'
    ? new TestResourceSearchHandler()
    : new ProductionResourceSearchHandler();

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
    handler: (args: ResourceSearchArgs) => handler.handle(args)
  }
};
