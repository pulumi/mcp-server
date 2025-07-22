/**
 * Policy Violations API Client
 * This module handles API calls to Pulumi Cloud Policy Violations endpoint
 */

export interface PolicyViolation {
  projectName: string;
  stackName: string;
  policyPack: string;
  policyPackTag: string;
  policyName: string;
  resourceURN: string;
  resourceType: string;
  resourceName: string;
  message: string;
  observedAt: string;
  level: string;
}

export interface PolicyViolationsResponse {
  policyViolations: PolicyViolation[];
}

export interface PolicyViolationsApiClientConfig {
  apiUrl: string;
  accessToken: string;
  timeout?: number;
}

/**
 * Client for interacting with Pulumi Cloud Policy Violations API
 */
export class PolicyViolationsApiClient {
  constructor(private config: PolicyViolationsApiClientConfig) {}

  /**
   * Get policy violations for an organization
   * Calls: GET /api/orgs/{organization}/policyresults/violationsv2
   */
  async getPolicyViolations(org: string): Promise<PolicyViolationsResponse> {
    const url = new URL(`/api/orgs/${org}/policyresults/violationsv2`, this.config.apiUrl);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.pulumi+8',
        'Authorization': `token ${this.config.accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'pulumi-mcp-server'
      },
      signal: AbortSignal.timeout(this.config.timeout || 30000)
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Invalid or expired access token');
      }
      if (response.status === 403) {
        throw new Error('Forbidden: Insufficient permissions for policy violations');
      }
      if (response.status === 404) {
        throw new Error(`Organization '${org}' not found`);
      }

      throw new Error(`Pulumi API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }
}

/**
 * Factory function to create PolicyViolationsApiClient with environment-based configuration
 */
export function createPolicyViolationsApiClient(): PolicyViolationsApiClient {
  const apiUrl = process.env.PULUMI_API_URL || 'https://api.pulumi.com';
  const accessToken = process.env.PULUMI_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error('PULUMI_ACCESS_TOKEN environment variable is required');
  }

  return new PolicyViolationsApiClient({
    apiUrl,
    accessToken,
    timeout: 30000
  });
}

/**
 * Mock client for testing - returns stub data without making real API calls
 */
export class MockPolicyViolationsApiClient extends PolicyViolationsApiClient {
  constructor() {
    super({ apiUrl: 'http://mock', accessToken: 'mock' });
  }

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
          resourceURN: 'urn:pulumi:dev::my-web-app::aws:s3/bucket:Bucket::my-public-bucket',
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
          resourceURN: 'urn:pulumi:prod::infrastructure::aws:rds/instance:Instance::main-db',
          resourceType: 'aws:rds/instance:Instance',
          resourceName: 'main-db',
          message: 'RDS instance must have encryption enabled',
          observedAt: '2024-01-14T15:45:00Z',
          level: 'advisory'
        }
      ]
    };
  }
}