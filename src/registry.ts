import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

// Define schema types
type ResourceProperty = {
  type: string;
  description: string;
};

type ResourceSchema = {
  description: string;
  properties: Record<string, ResourceProperty>;
  required: string[];
  inputProperties: Record<string, ResourceProperty>;
  requiredInputs: string[];
};

type Schema = {
  name: string;
  resources: Record<string, ResourceSchema>;
};

type GetResourceArgs = {
  provider: string;
  module?: string;
  resource: string;
};

type ListResourcesArgs = {
  provider: string;
  module?: string;
};

export const registryCommands = function (cacheDir: string) {
  // Function to get schema with caching
  async function getSchema(provider: string): Promise<Schema> {
    const cacheFile = path.join(cacheDir, `${provider.replace(/[^a-zA-Z0-9]/g, '_')}_schema.json`);

    if (!fs.existsSync(cacheFile)) {
      execSync(`pulumi package get-schema ${provider} >> ${cacheFile}`);
    }
    return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
  }

  return {
    'get-resource': {
      description: 'Get information about a specific resource from the Pulumi Registry',
      schema: {
        provider: z
          .string()
          .describe(
            "The cloud provider (e.g., 'aws', 'azure', 'gcp', 'random') or github.com/org/repo for Git-hosted components"
          ),
        module: z
          .string()
          .optional()
          .describe(
            "The module to query (e.g., 's3', 'ec2', 'lambda'). Optional for smaller providers, will be 'index by default."
          ),
        resource: z
          .string()
          .describe("The resource type to query (e.g., 'Bucket', 'Function', 'Instance')")
      },
      handler: async (args: GetResourceArgs) => {
        const schema = await getSchema(args.provider);

        // Find the resource entry [key, data] directly
        const resourceEntry = Object.entries(schema.resources).find(([key]) => {
          const [, modulePath, resourceName] = key.split(':');
          const mainModule = modulePath.split('/')[0];

          if (args.module) {
            // If module is provided, match module and resource name
            return mainModule === args.module && resourceName === args.resource;
          } else {
            // If no module provided, match resource name only
            return resourceName === args.resource;
          }
        });

        if (resourceEntry) {
          // Destructure the found entry - TS knows these are defined now
          const [resourceKey, resourceData] = resourceEntry;

          return {
            description: 'Returns information about Pulumi Registry resources',
            content: [
              {
                type: 'text' as const,
                text: formatSchema(resourceKey, resourceData) // No '!' needed
              }
            ]
          };
        } else {
          // Handle the case where the resource was not found
          const availableResources = Object.keys(schema.resources)
            .map((key) => key.split(':').pop())
            .filter(Boolean);

          return {
            description: 'Returns information about Pulumi Registry resources', // Consider making this more specific, e.g., "Resource not found"
            content: [
              {
                type: 'text' as const,
                text: `No information found for ${args.resource}${args.module ? ` in module ${args.module}` : ''}. Available resources: ${availableResources.join(', ')}` // Slightly improved message
              }
            ]
          };
        }
      }
    },

    'list-resources': {
      description: 'List all resource types for a given provider and module',
      schema: {
        provider: z
          .string()
          .describe(
            "The cloud provider (e.g., 'aws', 'azure', 'gcp', 'random') or github.com/org/repo for Git-hosted components"
          ),
        module: z
          .string()
          .optional()
          .describe("Optional module to filter by (e.g., 's3', 'ec2', 'lambda')")
      },
      handler: async (args: ListResourcesArgs) => {
        const schema = await getSchema(args.provider);

        // Filter and format resources
        const resources = Object.entries(schema.resources)
          .filter(([key]) => {
            if (args.module) {
              const [, modulePath] = key.split(':');
              const mainModule = modulePath.split('/')[0];
              return mainModule === args.module;
            }
            return true;
          })
          .map(([key, resource]) => {
            const resourceName = key.split(':').pop() || '';
            const modulePath = key.split(':')[1];
            const mainModule = modulePath.split('/')[0];
            // Trim description at first '#' character
            const shortDescription =
              resource.description?.split('\n')[0].trim() ?? '<no description>';
            return {
              name: resourceName,
              module: mainModule,
              description: shortDescription
            };
          });

        if (resources.length === 0) {
          return {
            description: 'No resources found',
            content: [
              {
                type: 'text' as const,
                text: args.module
                  ? `No resources found for provider '${args.provider}' in module '${args.module}'`
                  : `No resources found for provider '${args.provider}'`
              }
            ]
          };
        }

        const resourceList = resources
          .map((r) => `- ${r.name} (${r.module})\n  ${r.description}`)
          .join('\n\n');

        return {
          description: 'Lists available Pulumi Registry resources',
          content: [
            {
              type: 'text' as const,
              text: args.module
                ? `Available resources for ${args.provider}/${args.module}:\n\n${resourceList}`
                : `Available resources for ${args.provider}:\n\n${resourceList}`
            }
          ]
        };
      }
    }
  };
};

// Helper function to format schema
export function formatSchema(resourceKey: string, resourceData: ResourceSchema): string {
  // Format the input properties section
  const inputProperties = Object.entries(resourceData.inputProperties ?? {})
    .sort(([nameA], [nameB]) => {
      const isRequiredA = (resourceData.requiredInputs ?? []).includes(nameA);
      const isRequiredB = (resourceData.requiredInputs ?? []).includes(nameB);
      if (isRequiredA !== isRequiredB) {
        return isRequiredA ? -1 : 1;
      }
      return nameA.localeCompare(nameB);
    })
    .map(([name, prop]) => {
      const isRequired = (resourceData.requiredInputs ?? []).includes(name);
      return `- ${name} (${prop.type}${isRequired ? ', required' : ''}): ${prop.description ?? '<no description>'}`;
    })
    .join('\n');

  // Format the output properties section
  const outputProperties = Object.entries(resourceData.properties ?? {})
    .sort(([nameA], [nameB]) => {
      const isRequiredA = (resourceData.required ?? []).includes(nameA);
      const isRequiredB = (resourceData.required ?? []).includes(nameB);
      if (isRequiredA !== isRequiredB) {
        return isRequiredA ? -1 : 1;
      }
      return nameA.localeCompare(nameB);
    })
    .map(([name, prop]) => {
      const isRequired = (resourceData.required ?? []).includes(name);
      return `- ${name} (${prop.type}${isRequired ? ', always present' : ''}): ${prop.description ?? '<no description>'}`;
    })
    .join('\n');

  return `
Resource: ${resourceKey}

${resourceData.description ?? '<no description>'}

Input Properties:
${inputProperties}

Output Properties:
${outputProperties}
`;
}
