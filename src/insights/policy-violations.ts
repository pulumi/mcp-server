import { z } from 'zod';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import * as automation from '@pulumi/pulumi/automation/index.js';
import {
  createPulumiApiClient,
  type PolicyViolation,
  type EnhancedPolicyViolation,
  type StackResource
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

export async function getStackInfo(
  workDir?: string,
  stackName?: string
): Promise<{
  org: string;
  project: string;
  stack: string;
}> {
  try {
    const stackArgs: automation.LocalProgramArgs = {
      stackName: stackName ?? 'dev',
      workDir: workDir ?? process.cwd()
    };

    console.log(`🔍 [DEBUG] Detecting stack info from: ${stackArgs.workDir}`);
    const stack = await automation.LocalWorkspace.selectStack(stackArgs);

    const actualStackName = stack.name;
    const workspace = stack.workspace;

    // Get project settings
    const projectSettings = await workspace.projectSettings();
    const projectName = projectSettings.name;

    // Get stack settings to find the org
    const stackSettings = await workspace.stackSettings(actualStackName);
    const org = stackSettings?.config?.['pulumi:org']?.value || (await getDefaultOrg());

    console.log(`📋 [DEBUG] Detected stack info:`);
    console.log(`   Organization: ${org}`);
    console.log(`   Project: ${projectName}`);
    console.log(`   Stack: ${actualStackName}`);

    return {
      org,
      project: projectName,
      stack: actualStackName
    };
  } catch (error) {
    console.log(`⚠️  [DEBUG] Failed to detect stack info with automation API: ${error}`);

    // Fallback: try to read Pulumi.yaml directly and use default org
    try {
      const workingDir = workDir ?? process.cwd();
      const pulumiYamlPath = join(workingDir, 'Pulumi.yaml');
      console.log(`🔄 [DEBUG] Trying fallback: reading ${pulumiYamlPath}`);

      const pulumiYaml = readFileSync(pulumiYamlPath, 'utf8');
      const yamlContent = pulumiYaml.match(/name:\s*(.+)/);

      if (yamlContent && yamlContent[1]) {
        const projectName = yamlContent[1].trim();
        const stackName_ = stackName ?? 'dev';
        const org = await getDefaultOrg();

        console.log(`📋 [DEBUG] Fallback detection successful:`);
        console.log(`   Organization: ${org}`);
        console.log(`   Project: ${projectName}`);
        console.log(`   Stack: ${stackName_}`);

        return {
          org,
          project: projectName,
          stack: stackName_
        };
      }
    } catch (fallbackError) {
      console.log(`⚠️  [DEBUG] Fallback detection also failed: ${fallbackError}`);
    }

    throw new Error(`Could not detect Pulumi project/stack info: ${error}`);
  }
}

/**
 * Extract logical name from Pulumi URN
 * URN format: urn:pulumi:stack::project::type::logicalName
 */
function extractLogicalNameFromURN(urn: string): string {
  const parts = urn.split('::');
  return parts[parts.length - 1];
}

/**
 * Recursively find all source files in the current directory
 */
function findSourceFiles(dir: string = '.'): string[] {
  const sourceFiles: string[] = [];
  const extensions = ['.ts', '.js', '.py', '.go', '.cs', '.java'];

  console.log(`🔍 [DEBUG] Scanning directory: ${dir}`);

  try {
    const items = readdirSync(dir);

    for (const item of items) {
      const fullPath = join(dir, item);

      // Skip common directories that don't contain source code
      if (item.startsWith('.') || item === 'node_modules' || item === 'dist' || item === 'build') {
        continue;
      }

      try {
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          // Recursively search subdirectories
          sourceFiles.push(...findSourceFiles(fullPath));
        } else if (stat.isFile()) {
          // Check if file has a source code extension
          const hasSourceExtension = extensions.some((ext) => item.endsWith(ext));
          if (hasSourceExtension) {
            sourceFiles.push(fullPath);
          }
        }
      } catch {
        // Skip files/directories we can't read
        continue;
      }
    }
  } catch (error) {
    console.log(`⚠️  [DEBUG] Cannot read directory ${dir}: ${error}`);
  }

  console.log(`📁 [DEBUG] Found ${sourceFiles.length} source files total`);
  sourceFiles.forEach((file) => console.log(`   - ${file}`));

  return sourceFiles;
}

/**
 * Search for logical resource name in source files
 */
function findResourceInFiles(logicalName: string, filePaths: string[]): string[] {
  const matchingFiles: string[] = [];

  console.log(`🔎 [DEBUG] Searching for logical name: "${logicalName}"`);

  for (const filePath of filePaths) {
    try {
      const content = readFileSync(filePath, 'utf8');

      // Look for the logical name in quotes (most common pattern)
      const hasQuotedMatch =
        content.includes(`"${logicalName}"`) || content.includes(`'${logicalName}'`);

      if (hasQuotedMatch) {
        console.log(`✅ [DEBUG] Found "${logicalName}" in ${filePath}`);
        matchingFiles.push(filePath);
      } else {
        console.log(`❌ [DEBUG] Not found "${logicalName}" in ${filePath}`);
      }
    } catch (error) {
      console.log(`⚠️  [DEBUG] Cannot read file ${filePath}: ${error}`);
      continue;
    }
  }

  console.log(`📄 [DEBUG] Logical name "${logicalName}" found in ${matchingFiles.length} files`);
  return matchingFiles;
}

/**
 * Map policy violations to resources using stack export data
 */
export async function mapViolationsUsingStackExport(
  violations: PolicyViolation[],
  apiClient: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  org: string,
  project: string,
  stack: string,
  workDir?: string
): Promise<EnhancedPolicyViolation[]> {
  console.log(
    `\n🚨 [DEBUG] Processing ${violations.length} policy violations with stack export mapping`
  );
  console.log(`   Stack: ${org}/${project}/${stack}`);

  try {
    // Get stack export data
    const stackExport = await apiClient.getStackExport(org, project, stack);
    console.log(
      `📦 [DEBUG] Found ${stackExport.deployment.resources.length} resources in stack export`
    );

    // Create mapping from (AWS resource ID + resource type) to Pulumi logical name
    const resourceKeyToLogicalName = new Map<string, string>();
    stackExport.deployment.resources.forEach((resource: StackResource) => {
      if (resource.id && resource.custom) {
        const logicalName = extractLogicalNameFromURN(resource.urn);
        const resourceKey = `${resource.id}::${resource.type}`;
        resourceKeyToLogicalName.set(resourceKey, logicalName);
        console.log(
          `🗺️  [DEBUG] Mapping: AWS ID "${resource.id}" + Type "${resource.type}" → Logical name "${logicalName}"`
        );
      }
    });

    // Find source files to check which logical names exist in code
    const sourceFiles = findSourceFiles(workDir || '.');
    const enhancedViolations: EnhancedPolicyViolation[] = [];

    for (const violation of violations) {
      console.log(`\n📋 [DEBUG] Processing violation:`);
      console.log(`   URN: ${violation.resourceURN}`);
      console.log(`   AWS resource name: "${violation.resourceName}"`);
      console.log(`   Resource type: ${violation.resourceType}`);

      // Try to find the logical name using the composite key (AWS ID + resource type)
      const resourceKey = `${violation.resourceName}::${violation.resourceType}`;
      const logicalName = resourceKeyToLogicalName.get(resourceKey);

      if (logicalName) {
        console.log(
          `✅ [DEBUG] Found mapping: "${violation.resourceName}" + "${violation.resourceType}" → "${logicalName}"`
        );

        // Check if this logical name exists in source files
        const filePaths = findResourceInFiles(logicalName, sourceFiles);

        if (filePaths.length > 0) {
          console.log(
            `✅ [DEBUG] Including violation for "${logicalName}" (found in ${filePaths.length} files)`
          );
          enhancedViolations.push({
            ...violation,
            logicalName,
            filePaths
          });
        } else {
          console.log(
            `❌ [DEBUG] Filtering out violation for "${logicalName}" (not found in source files)`
          );
        }
      } else {
        console.log(
          `❌ [DEBUG] No mapping found for AWS resource "${violation.resourceName}" + type "${violation.resourceType}"`
        );
      }
    }

    console.log(
      `\n📊 [DEBUG] Final result: ${enhancedViolations.length}/${violations.length} violations kept`
    );
    return enhancedViolations;
  } catch (error) {
    console.log(`⚠️  [DEBUG] Stack export failed: ${error}`);
    console.log(`   Falling back to old string-based matching`);
    return mapViolationsToLocalResourcesFallback(violations, workDir);
  }
}

/**
 * Fallback mapping when stack export is not available
 */
function mapViolationsToLocalResourcesFallback(
  violations: PolicyViolation[],
  workDir?: string
): EnhancedPolicyViolation[] {
  console.log(`\n🚨 [DEBUG] Using fallback mapping for ${violations.length} policy violations`);

  const sourceFiles = findSourceFiles(workDir || '.');
  const enhancedViolations: EnhancedPolicyViolation[] = [];

  for (const violation of violations) {
    const logicalName = extractLogicalNameFromURN(violation.resourceURN);
    console.log(`\n📋 [DEBUG] Processing violation (fallback):`);
    console.log(`   URN: ${violation.resourceURN}`);
    console.log(`   Extracted logical name: "${logicalName}"`);
    console.log(`   AWS resource name: "${violation.resourceName}"`);
    console.log(`   Resource type: ${violation.resourceType}`);

    const filePaths = findResourceInFiles(logicalName, sourceFiles);

    // Only include violations for resources found in the current project
    if (filePaths.length > 0) {
      console.log(
        `✅ [DEBUG] Including violation for "${logicalName}" (found in ${filePaths.length} files)`
      );
      enhancedViolations.push({
        ...violation,
        logicalName,
        filePaths
      });
    } else {
      console.log(
        `❌ [DEBUG] Filtering out violation for "${logicalName}" (not found in local files)`
      );
    }
  }

  console.log(
    `\n📊 [DEBUG] Final result: ${enhancedViolations.length}/${violations.length} violations kept`
  );
  return enhancedViolations;
}

export type PolicyViolationsArgs = {
  org?: string;
  workDir?: string;
  stackName?: string;
  project?: string;
  stack?: string;
};

export type PolicyViolationsResult = {
  org: string;
  violations: EnhancedPolicyViolation[];
  summary: string;
  totalViolations: number;
  filteredCount?: number;
};

export const policyViolationsCommands = {
  'policy-violations': {
    description:
      'Retrieve policy violations for a Pulumi organization. Shows all current policy violations including security, compliance, and best practice violations detected in your infrastructure.',
    schema: {
      org: z
        .string()
        .optional()
        .describe('Pulumi organization name (optional, defaults to current default org)'),
      workDir: z
        .string()
        .optional()
        .describe('The working directory of the program (optional, defaults to current directory)'),
      stackName: z
        .string()
        .optional()
        .describe('The associated stack name (optional, defaults to "dev")'),
      project: z
        .string()
        .optional()
        .describe('Pulumi project name (fallback when auto-detection fails)'),
      stack: z
        .string()
        .optional()
        .describe('Pulumi stack name (fallback when auto-detection fails)')
    },
    handler: async (args: PolicyViolationsArgs) => {
      // Check if we're in test mode - use test client if so
      if (process.env.MCP_TEST_MODE === 'true') {
        const { MockPulumiApiClient } = await import('../../test/mock-pulumi-api-client.js');
        const mockClient = new MockPulumiApiClient();
        const mockResponse = await mockClient.getPolicyViolations(args.org || 'mock-org');

        const results: PolicyViolationsResult = {
          org: args.org || 'mock-org',
          violations: mockResponse.policyViolations.map((v) => ({
            ...v,
            logicalName: v.resourceName,
            filePaths: [`src/${v.resourceName}.ts`]
          })),
          summary: `Found ${mockResponse.policyViolations.length} policy violation${mockResponse.policyViolations.length === 1 ? '' : 's'}`,
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
      }

      // Get org - use provided org or detect default org
      const org = args.org || (await getDefaultOrg());

      // Use real API client - will throw clear error if token is missing
      const apiClient = createPulumiApiClient();
      const apiResponse = await apiClient.getPolicyViolations(org);

      // Map violations to resources in current project using stack export
      let enhancedViolations: EnhancedPolicyViolation[];
      let resultOrg = org;
      const originalCount = apiResponse.policyViolations.length;

      try {
        // Try auto-detection first using Pulumi automation API
        const stackInfo = await getStackInfo(args.workDir, args.stackName);
        resultOrg = stackInfo.org;
        enhancedViolations = await mapViolationsUsingStackExport(
          apiResponse.policyViolations,
          apiClient,
          stackInfo.org,
          stackInfo.project,
          stackInfo.stack,
          args.workDir
        );
      } catch (error) {
        console.log(`⚠️  [DEBUG] Stack auto-detection failed: ${error}`);

        // Try explicit parameters as fallback
        if (args.project && args.stack) {
          console.log(
            `🔄 [DEBUG] Using explicit project/stack parameters: ${args.project}/${args.stack}`
          );
          try {
            enhancedViolations = await mapViolationsUsingStackExport(
              apiResponse.policyViolations,
              apiClient,
              org,
              args.project,
              args.stack,
              args.workDir
            );
          } catch (stackExportError) {
            console.log(
              `⚠️  [DEBUG] Stack export failed with explicit params: ${stackExportError}`
            );
            enhancedViolations = mapViolationsToLocalResourcesFallback(
              apiResponse.policyViolations,
              args.workDir
            );
          }
        } else {
          console.log(
            `⚠️  [DEBUG] No explicit project/stack provided, using string-based fallback`
          );
          enhancedViolations = mapViolationsToLocalResourcesFallback(
            apiResponse.policyViolations,
            args.workDir
          );
        }
      }

      const filteredCount = enhancedViolations.length;

      const results: PolicyViolationsResult = {
        org: resultOrg,
        violations: enhancedViolations,
        summary:
          filteredCount > 0
            ? `Found ${filteredCount} policy violation${filteredCount === 1 ? '' : 's'} in current project${originalCount > filteredCount ? ` (filtered ${originalCount - filteredCount} external violations)` : ''}`
            : originalCount > 0
              ? `No policy violations found in current project (filtered ${originalCount} external violations)`
              : 'No policy violations found',
        totalViolations: filteredCount,
        filteredCount: originalCount > filteredCount ? originalCount - filteredCount : undefined
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
};
