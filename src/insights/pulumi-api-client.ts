/**
 * Pulumi API Client for resource search
 * This module handles actual API calls to Pulumi Cloud Service
 */

export interface PulumiSearchRequest {
  query: string;
  org: string;
  size?: number;
  page?: number;
  top?: number;
  properties?: boolean;
  source?: string;
  facet?: string[];
  ai?: string;
}

export interface PulumiSearchResponse {
  resources: {
    name: string;
    type: string;
    project: string;
    stack: string;
    properties: Record<string, unknown>;
    id?: string;
    created?: string;
    modified?: string;
    provider?: string;
    package?: string;
  }[];
  facets: {
    type: { [key: string]: number };
    package: { [key: string]: number };
    project: { [key: string]: number };
    stack: { [key: string]: number };
  };
  totalResources: number;
  page?: number;
  size?: number;
}

export interface PulumiSearchApiClientConfig {
  apiUrl: string;
  accessToken: string;
  timeout?: number;
}

/**
 * Client for interacting with Pulumi Cloud Resource Search API
 */
export class PulumiSearchApiClient {
  constructor(private config: PulumiSearchApiClientConfig) {}

  /**
   * Search for resources using Pulumi Cloud Resource Search API
   * Calls: GET /api/orgs/{orgName}/search/resources
   */
  async searchResources(request: PulumiSearchRequest): Promise<PulumiSearchResponse> {
    const url = new URL(`/api/orgs/${request.org}/search/resources`, this.config.apiUrl);

    // Add query parameters
    url.searchParams.set('query', request.query);
    url.searchParams.set('size', (request.size || 25).toString());
    url.searchParams.set('page', (request.page || 0).toString());
    url.searchParams.set('top', (request.top || 20).toString());
    url.searchParams.set('properties', (request.properties || false).toString());
    url.searchParams.set('source', request.source || 'mcp-server');

    // Add facet parameters
    const facets = request.facet || ['type', 'package', 'project', 'stack'];
    facets.forEach((facet) => {
      url.searchParams.append('facet', facet);
    });

    if (request.ai) {
      url.searchParams.set('ai', request.ai);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `token ${this.config.accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'pulumi-mcp-server'
      },
      signal: AbortSignal.timeout(this.config.timeout || 30000)
    });

    if (!response.ok) {
      if (response.status === 402) {
        throw new Error('Quota limit exceeded for resource search API');
      }
      if (response.status === 401) {
        throw new Error('Unauthorized: Invalid or expired access token');
      }
      if (response.status === 403) {
        throw new Error('Forbidden: Insufficient permissions for resource search');
      }
      if (response.status === 404) {
        throw new Error(`Organization '${request.org}' not found`);
      }

      throw new Error(`Pulumi API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Transform the API response to match our interface
    return {
      resources: data.resources || [],
      facets: data.facets || {
        type: {},
        package: {},
        project: {},
        stack: {}
      },
      totalResources: data.total || 0,
      page: data.page,
      size: data.size
    };
  }
}

/**
 * Factory function to create PulumiApiClient with environment-based configuration
 */
export function createPulumiSearchApiClient(): PulumiSearchApiClient {
  const apiUrl = process.env.PULUMI_API_URL || 'https://api.pulumi.com';
  const accessToken = process.env.PULUMI_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error('PULUMI_ACCESS_TOKEN environment variable is required');
  }

  return new PulumiSearchApiClient({
    apiUrl,
    accessToken,
    timeout: 30000
  });
}

/**
 * Mock client for testing - returns stub data without making real API calls
 */
export class MockPulumiApiClient extends PulumiSearchApiClient {
  constructor() {
    super({ apiUrl: 'http://mock', accessToken: 'mock' });
  }

  async searchResources(request: PulumiSearchRequest): Promise<PulumiSearchResponse> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    const lowerQuery = request.query.toLowerCase();

    // Return different mock data based on query
    if (lowerQuery.includes('type:aws:s3:bucket') && lowerQuery.includes('-properties.tags:')) {
      return {
        resources: [
          {
            name: 'acme-bucket',
            type: 'aws:s3:Bucket',
            project: 'example-project',
            stack: 'dev',
            properties: request.properties ? {
              bucket: 'acme-bucket',
              region: 'us-west-2'
              // No tags property = untagged
            } : {},
            id: 'arn:aws:s3:::acme-bucket',
            created: '2024-01-15T10:30:00Z',
            modified: '2024-01-15T10:30:00Z',
            provider: 'aws',
            package: 'aws'
          }
        ],
        facets: {
          type: { 'aws:s3:Bucket': 1 },
          package: { aws: 1 },
          project: { 'example-project': 1 },
          stack: { dev: 1 }
        },
        totalResources: 1
      };
    }

    // Default mock response
    return {
      resources: [
        {
          name: 'example-resource',
          type: 'aws:ec2:Instance',
          project: 'example-project',
          stack: 'dev',
          properties: request.properties ? {
            instanceType: 't3.micro',
            tags: { Environment: 'dev' }
          } : {},
          id: 'i-1234567890abcdef0',
          created: '2024-01-15T10:30:00Z',
          modified: '2024-01-15T10:30:00Z',
          provider: 'aws',
          package: 'aws'
        }
      ],
      facets: {
        type: { 'aws:ec2:Instance': 1 },
        package: { aws: 1 },
        project: { 'example-project': 1 },
        stack: { dev: 1 }
      },
      totalResources: 1
    };
  }
}
