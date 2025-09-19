/**
 * Pulumi API Client for resource search
 * This module handles actual API calls to Pulumi Cloud Service
 */

export interface PulumiSearchRequest {
  query: string;
  org: string;
  top?: number;
  properties?: boolean;
}

export interface PulumiSearchResponse {
  resources: {
    name: string;
    type: string;
    project: string;
    stack: string;
    properties: Record<string, unknown>;
    urn?: string;
    id?: string;
    created?: string;
    modified?: string;
    provider?: string;
    package?: string;
  }[];
  totalResources: number;
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
   * Calls: GET /api/orgs/{orgName}/search/resourcesv2
   */
  async searchResources(request: PulumiSearchRequest): Promise<PulumiSearchResponse> {
    // Set page size based on top parameter to avoid over-fetching
    const pageSize = request.top ? Math.min(20, request.top) : 20;

    const url = new URL(`/api/orgs/${request.org}/search/resourcesv2`, this.config.apiUrl);

    // Add query parameters
    url.searchParams.set('organization', request.org);
    url.searchParams.set('query', request.query);
    url.searchParams.set('properties', (request.properties || false).toString());
    url.searchParams.set('size', pageSize.toString());
    url.searchParams.set('page', '1'); // API uses 1-indexed pages

    // Initial fetch outside loop
    const response = await this.makeRequest(url.toString());
    const data = await response.json();

    let allResources: PulumiSearchResponse['resources'] = data.resources || [];
    const totalResources = data.total || 0;

    // The 250 constant is found empirically - with this limit, queries can complete successfully
    // while higher limits may cause timeouts or failures
    const maxResultsToFetch = Math.min(totalResources, request.top || 250);

    let nextUrl = data.pagination?.next;
    while (nextUrl && allResources.length < maxResultsToFetch) {
      // Use robust URL resolution to handle both absolute and relative URLs
      const fullUrl = new URL(nextUrl, this.config.apiUrl);
      const pageResponse = await this.makeRequest(fullUrl.toString());
      const pageData = await pageResponse.json();

      const pageResources = pageData.resources || [];

      // If we got no results, we're done
      if (pageResources.length === 0) {
        break;
      }

      allResources.push(...pageResources);
      nextUrl = pageData.pagination?.next;
    }

    // Trim results to respect the top parameter (capped to maxResultsToFetch)
    if (allResources.length > maxResultsToFetch) {
      allResources = allResources.slice(0, maxResultsToFetch);
    }

    return {
      resources: allResources,
      totalResources
    };
  }

  private async makeRequest(url: string): Promise<Response> {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `token ${this.config.accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'pulumi-mcp-server'
      },
      signal: AbortSignal.timeout(this.config.timeout || 30000)
    });

    if (!response.ok) {
      let errorMessage = `Pulumi API error: ${response.status} ${response.statusText}`;

      try {
        const errorData = await response.json();
        if (errorData.message) {
          errorMessage += ` - ${errorData.message}`;
        }
      } catch {
        // Ignore JSON parsing errors for error responses
      }

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
        throw new Error('Organization not found or resource search endpoint not available');
      }

      throw new Error(errorMessage);
    }

    return response;
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
