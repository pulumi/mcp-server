/**
 * Mock Pulumi API Client for testing
 * This module provides mock implementations for testing without making real API calls
 */

import {
  PulumiApiClient,
  type PulumiSearchRequest,
  type PulumiSearchResponse,
  type PolicyViolationsResponse,
  type StackExportResponse
} from '../src/insights/pulumi-api-client.js';

/**
 * Mock client for testing - returns stub data without making real API calls
 */
export class MockPulumiApiClient extends PulumiApiClient {
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
      facets: {
        type: { 'aws:ec2:Instance': 1 },
        package: { aws: 1 },
        project: { 'example-project': 1 },
        stack: { dev: 1 }
      },
      totalResources: 1
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getPolicyViolations(org: string): Promise<PolicyViolationsResponse> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Return mock policy violations
    return {
      policyViolations: [
        {
          projectName: 'my-web-app',
          stackName: 'dev',
          policyPack: 'security-policies',
          policyPackTag: '1.0.0',
          policyName: 'no-public-s3-buckets',
          resourceURN: 'urn:pulumi:dev::my-web-app::aws:s3/bucket:Bucket::myBucket',
          resourceType: 'aws:s3/bucket:Bucket',
          resourceName: 'my-public-bucket',
          message: 'S3 bucket should not be publicly accessible',
          observedAt: '2024-01-15T10:30:00Z',
          level: 'mandatory'
        },
        {
          projectName: 'infrastructure',
          stackName: 'prod',
          policyPack: 'compliance-policies',
          policyPackTag: '2.1.0',
          policyName: 'require-encryption',
          resourceURN: 'urn:pulumi:prod::infrastructure::aws:rds/instance:Instance::database',
          resourceType: 'aws:rds/instance:Instance',
          resourceName: 'main-db',
          message: 'RDS instance must have encryption enabled',
          observedAt: '2024-01-14T15:45:00Z',
          level: 'advisory'
        },
        {
          projectName: 'test-project',
          stackName: 'dev',
          policyPack: 'security-policies',
          policyPackTag: '1.0.0',
          policyName: 'require-tags',
          resourceURN: 'urn:pulumi:dev::test-project::aws:ec2/instance:Instance::external-resource',
          resourceType: 'aws:ec2/instance:Instance',
          resourceName: 'external-instance',
          message: 'EC2 instance must have required tags',
          observedAt: '2024-01-15T11:00:00Z',
          level: 'advisory'
        }
      ]
    };
  }

  async getStackExport(org: string, project: string, stack: string): Promise<StackExportResponse> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Return mock stack export data
    return {
      deployment: {
        resources: [
          {
            urn: 'urn:pulumi:dev::test-project::aws:s3/bucketV2:BucketV2::myBucket',
            id: 'my-public-bucket',
            type: 'aws:s3/bucketV2:BucketV2',
            custom: true
          },
          {
            urn: 'urn:pulumi:prod::infrastructure::aws:rds/instance:Instance::database',
            id: 'main-db',
            type: 'aws:rds/instance:Instance',
            custom: true
          },
          {
            urn: 'urn:pulumi:dev::test-project::aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock::bucket-access-block',
            id: 'my-public-bucket',
            type: 'aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock',
            custom: true
          }
        ]
      }
    };
  }
}