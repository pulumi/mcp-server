import { z } from "zod";
import * as fs from 'node:fs';
import * as path from "node:path";
import { execSync } from "node:child_process";

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

export const registryCommands = function(cacheDir: string) {

  // Function to get schema with caching
  async function getSchema(provider: string): Promise<Schema> {
    const cacheFile = path.join(cacheDir, `${provider.replace(/[^a-zA-Z0-9]/g, '_')}_schema.json`);
    
    if (!fs.existsSync(cacheFile)) {
      execSync(`pulumi package get-schema ${provider} >> ${cacheFile}`);
    }
    return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
  }

  return {
    getResource: {
      schema: {
        provider: z.string().describe("The cloud provider (e.g., 'aws', 'azure', 'gcp', 'random') or github.com/org/repo for Git-hosted components"),
        module: z.string().optional().describe("The module to query (e.g., 's3', 'ec2', 'lambda'). Optional for smaller providers, will be 'index by default."),
        resource: z.string().describe("The resource type to query (e.g., 'Bucket', 'Function', 'Instance')")
      },
      handler: async (args: GetResourceArgs) => {
        const schema = await getSchema(args.provider);
        const providerName = schema.name;

        // Look up the resource using correct casing
        const resourceKey = Object.keys(schema.resources).length > 0 
          ? Object.keys(schema.resources)[0].includes('/') 
            ? `${providerName}:${args.module ?? 'index'}/${lowercaseFirstChar(args.resource)}:${args.resource}`
            : `${providerName}:${args.module ?? 'index'}:${args.resource}`
          : `${args.provider}:${args.module ?? 'index'}:${args.resource}`;
        const resourceData = schema.resources[resourceKey];

        if (!resourceData) {
          const availableResources = Object.keys(schema.resources)
            .map(key => key.split(':').pop())
            .filter(Boolean);

          return {
            description: "Returns information about Pulumi Registry resources",
            content: [{ 
              type: "text" as const, 
              text: `No information found for ${resourceKey}. Available resources: ${availableResources.join(', ')}` 
            }]
          };
        }

        return {
          description: "Returns information about Pulumi Registry resources",
          content: [{ 
            type: "text" as const, 
            text: formatSchema(resourceKey, resourceData)
          }]
        };
      }
    },

    listResources: {
      schema: {
        provider: z.string().describe("The cloud provider (e.g., 'aws', 'azure', 'gcp', 'random') or github.com/org/repo for Git-hosted components"),
        module: z.string().optional().describe("Optional module to filter by (e.g., 's3', 'ec2', 'lambda')")
      },
      handler: async (args: ListResourcesArgs) => {
        const schema = await getSchema(args.provider);

        // Filter and format resources
        const resources = Object.entries(schema.resources)
          .filter(([key]) => {
            const [_, modulePath] = key.split(':');
            if (args.module) {
              const moduleMatch = modulePath.split('/')[0];
              return moduleMatch === args.module;
            }
            return true;
          })
          .map(([key, resource]) => {
            const resourceName = key.split(':').pop() || '';
            // Trim description at first '#' character
            const shortDescription = resource.description?.split('\n')[0].trim() ?? '<no description>';
            return {
              name: resourceName,
              description: shortDescription
            };
          });

        if (resources.length === 0) {
          return {
            description: "No resources found",
            content: [{ 
              type: "text" as const, 
              text: args.module 
                ? `No resources found for provider '${args.provider}' in module '${args.module}'`
                : `No resources found for provider '${args.provider}'`
            }]
          };
        }

        const resourceList = resources
          .map(r => `- ${r.name}\n  ${r.description}`)
          .join('\n\n');

        return {
          description: "Lists available Pulumi Registry resources",
          content: [{ 
            type: "text" as const, 
            text: args.module
              ? `Available resources for ${args.provider}/${args.module}:\n\n${resourceList}`
              : `Available resources for ${args.provider}:\n\n${resourceList}`
          }]
        };
      }
    },
  };
};


// Helper function to lowercase first character only
function lowercaseFirstChar(str: string): string {
  if (!str) return str;
  return str.charAt(0).toLowerCase() + str.slice(1);
}

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
