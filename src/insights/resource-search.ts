import { z } from 'zod';
import { createPulumiSearchApiClient, PulumiSearchApiClient } from './pulumi-api-client.js';

export type ResourceSearchArgs = {
  query: string;
  org?: string;
  top?: number;
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
export abstract class ResourceSearchHandlerBase {
  abstract createClient(): PulumiSearchApiClient;

  async handle(args: ResourceSearchArgs) {
    // Get org - use provided org or detect default org
    const org = args.org || (await getDefaultOrg());

    // Use client created by virtual function
    const client = this.createClient();
    const apiResponse = await client.searchResources({
      query: args.query,
      org: org,
      top: args.top,
      properties: args.properties
    });

    const results: ResourceSearchResult = {
      query: args.query,
      resources: apiResponse.resources,
      summary: this.createSummary(apiResponse),
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

class ResourceSearchHandler extends ResourceSearchHandlerBase {
  createClient(): PulumiSearchApiClient {
    return createPulumiSearchApiClient();
  }
}

// Global handler instance that can be overridden for testing
let resourceSearchHandler: ResourceSearchHandlerBase;

export function setResourceSearchHandler(handler: ResourceSearchHandlerBase) {
  resourceSearchHandler = handler;
}

setResourceSearchHandler(new ResourceSearchHandler());

export const resourceSearchCommands = {
  'resource-search': {
    description: `Search and analyze Pulumi-managed cloud resources using a strict subset of Lucene query syntax.

QUERY SYNTAX RULES:
- The search query syntax is a strict subset of Lucene query syntax
- The documents being searched are Pulumi resources
- The implicit operator is AND
- Parentheses and OR are supported between fields but not within fields
- All resources are returned by default (use empty query "" to get all)
- Wildcard queries are NOT supported (no * allowed)
- Fuzzy queries are NOT supported
- Boosting is NOT supported
- Field grouping is NOT supported
- Whitespace is NOT supported
- field:value produces a match_phrase query
- field:"value" produces a term query
- -field:value produces a bool must_not match_phrase query
- -field:"value" produces a bool must_not term query
- field: produces an existence query
- Resource properties can be queried with leading dot: .property.path:value or .property.path: (existence)
- You absolutely must not produce queries that use fields other than: type, name, id, stack, project, package, modified, provider, provider_urn, team and protected, unless the field is the name of a property.
- You absolutely must not produce queries that use wildcards (e.g., *).
- You absolutely must not produce queries that use field grouping (e.g., type:(a OR b))

AVAILABLE FIELDS:
- type: Pulumi types used for pulumi import operations (e.g., aws:s3/bucket:Bucket)
- name: logical Pulumi resource names
- id: physical Pulumi resource names
- stack: name of the stack the resource belongs to
- project: name of the project the resource belongs to
- created: when the resource was first created (absolute dates only)
- modified: when the resource was last modified (absolute dates only)
- package: package of the resource (e.g., aws, gcp)
- provider: alias for the "package" field
- provider_urn: full URN of the resource's provider
- protected: boolean representing whether a resource is protected
- team: name of a team with access to the resource

IMPORTANT QUERY PATTERNS:
For AWS resources, do not use specific provider prefixes (aws: or aws-native:) in type filters. Instead:
WRONG: type:aws:s3/bucket:Bucket
WRONG: type:aws-native:s3:Bucket
CORRECT: type:"Bucket" (searches across both aws and aws-native providers)
For package filtering, use the generic package name:
CORRECT: package:aws (matches both aws and aws-native packages)
For finding resources by service, prefer the module field when possible:
PREFERRED: module:s3 (finds all S3 resources regardless of provider)
For property existence queries, always use the dot notation:
CORRECT: .tags: (checks if tags property exists)
For property negation queries (finding resources WITHOUT a property):
CORRECT: -.tags: or NOT .tags: (finds resources without tags)
COMMON TRANSLATIONS:
- "untagged resources" → -.tags: or NOT .tags:
- "resources without tags" → -.tags: or NOT .tags:

Supports field filters, boolean operators (AND, OR, NOT), exact matches with quotes, and property searches. The top parameter controls the maximum number of results to return (defaults to 20).

Resources may not have a repository url. This means that there is no available information about the repository that the resource is associated with.`,
    schema: {
      query: z
        .string()
        .describe(
          'Lucene query string using strict subset syntax (see tool description for full rules). NO WILDCARDS (*) allowed.'
        ),
      org: z
        .string()
        .optional()
        .describe('Pulumi organization name (optional, defaults to current default org)'),
      top: z
        .number()
        .optional()
        .default(20)
        .describe('Maximum number of top results to return (defaults to 20)'),
      properties: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'Whether to include resource properties in the response (defaults to false). ' +
            'WARNING: Setting this to true produces significantly more tokens and can cause response size limits to be exceeded. ' +
            'Only set to true when: (1) user explicitly requests properties/details, (2) querying a very small number of specific resources, or (3) user needs property-based analysis. ' +
            'NOT recommended for loose queries (empty query, broad type searches, etc.) that return many resources.'
        )
    },
    handler: (args: ResourceSearchArgs) => resourceSearchHandler.handle(args)
  }
};
