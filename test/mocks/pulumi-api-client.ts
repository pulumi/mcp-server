import {
  PulumiSearchApiClient,
  PulumiSearchRequest,
  PulumiSearchResponse
} from '../../src/insights/pulumi-api-client.js';

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
            properties: request.properties
              ? {
                  bucket: 'acme-bucket',
                  region: 'us-west-2'
                  // No tags property = untagged
                }
              : {},
            id: 'arn:aws:s3:::acme-bucket',
            created: '2024-01-15T10:30:00Z',
            modified: '2024-01-15T10:30:00Z',
            provider: 'aws',
            package: 'aws'
          }
        ],
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
          properties: request.properties
            ? {
                instanceType: 't3.micro',
                tags: { Environment: 'dev' }
              }
            : {},
          id: 'i-1234567890abcdef0',
          created: '2024-01-15T10:30:00Z',
          modified: '2024-01-15T10:30:00Z',
          provider: 'aws',
          package: 'aws'
        }
      ],
      totalResources: 1
    };
  }
}