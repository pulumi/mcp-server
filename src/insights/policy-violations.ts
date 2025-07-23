import { z } from 'zod';
import {
  MockPulumiApiClient,
  createPulumiApiClient,
  type PolicyViolation
} from './pulumi-api-client.js';

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

export type PolicyViolationsArgs = {
  org?: string;
};

export type PolicyViolationsResult = {
  org: string;
  violations: PolicyViolation[];
  summary: string;
  totalViolations: number;
};

export const policyViolationsCommands = {
  'policy-violations': {
    description:
      'Retrieve policy violations for a Pulumi organization. Shows all current policy violations including security, compliance, and best practice violations detected in your infrastructure.',
    schema: {
      org: z
        .string()
        .optional()
        .describe('Pulumi organization name (optional, defaults to current default org)')
    },
    handler: async (args: PolicyViolationsArgs) => {
      const isTestMode = process.env.MCP_TEST_MODE === 'true';

      if (isTestMode) {
        // Get org - use provided org or mock default for testing
        const org = args.org || 'mock-org';

        // Use mock client for testing
        const mockClient = new MockPulumiApiClient();
        const mockResponse = await mockClient.getPolicyViolations(org);

        const results: PolicyViolationsResult = {
          org: org,
          violations: mockResponse.policyViolations,
          summary:
            mockResponse.policyViolations.length > 0
              ? `Found ${mockResponse.policyViolations.length} policy violation${mockResponse.policyViolations.length === 1 ? '' : 's'}`
              : 'No policy violations found',
          totalViolations: mockResponse.policyViolations.length
        };

        return {
          description: 'Pulumi policy violations',
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  org: results.org,
                  violations: results.violations,
                  summary: results.summary,
                  totalViolations: results.totalViolations
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
        const apiResponse = await apiClient.getPolicyViolations(org);

        const policyViolations = apiResponse.policyViolations;

        const results: PolicyViolationsResult = {
          org: org,
          violations: policyViolations,
          summary:
            policyViolations.length > 0
              ? `Found ${policyViolations.length} policy violation${policyViolations.length === 1 ? '' : 's'}`
              : 'No policy violations found',
          totalViolations: policyViolations.length
        };

        return {
          description: 'Pulumi policy violations',
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  org: results.org,
                  violations: results.violations,
                  summary: results.summary,
                  totalViolations: results.totalViolations
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
