import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

// Define schema types
type ResourceProperty = {
  type?: string;
  description: string;
};

type ResourceSchema = {
  description: string;
  properties: Record<string, ResourceProperty>;
  required: string[];
  inputProperties: Record<string, ResourceProperty>;
  requiredInputs: string[];
};

type TypeSchema = {
  description: string;
  properties: Record<string, ResourceProperty>;
  required: string[];
};

type FunctionProperty = {
  description: string;
  properties: Record<string, ResourceProperty>;
  required?: string[];
};

type FunctionSchema = {
  description: string;
  inputs: FunctionProperty;
  outputs: FunctionProperty;
};

type Schema = {
  name: string;
  resources: Record<string, ResourceSchema>;
  types: Record<string, TypeSchema>;
  functions: Record<string, FunctionSchema>;
};

type GetResourceArgs = {
  provider: string;
  module?: string;
  resource: string;
  version?: string;
};

type GetTypeSchemaArgs = {
  provider: string;
  name: string;
  module?: string;
  version?: string;
};

type GetFunctionArgs = {
  provider: string;
  module?: string;
  function: string;
  version?: string;
};

type ListResourcesArgs = {
  provider: string;
  module?: string;
  version?: string;
};

export type GetResourceData = {
  type: string;
  requiredInputs: string[];
  inputProperties: Record<string, ResourceProperty>;
  outputProperties: Record<string, ResourceProperty>;
  requiredOutputs: string[];
};

export type GetFunctionData = {
  type: string;
  inputs: FunctionProperty;
  outputs: FunctionProperty;
};
type ListFunctionsArgs = ListResourcesArgs;

export type ListResourcesData = {
  type: string;
  description: string;
  name: string;
  module: string;
}[];

export type ListFunctionsData = ListResourcesData;

export const registryCommands = function (cacheDir: string) {
  // Function to get schema with caching
  async function getSchema(provider: string, version?: string): Promise<Schema> {
    const providerWithVersion = version ? `${provider}@${version}` : provider;
    const cacheFile = path.join(
      cacheDir,
      `${providerWithVersion.replace(/[^a-zA-Z0-9]/g, '_')}_schema.json`
    );

    if (!fs.existsSync(cacheFile)) {
      const output = execFileSync('pulumi', ['package', 'get-schema', providerWithVersion]);
      fs.writeFileSync(cacheFile, output);
    }
    return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
  }

  return {
    'get-type': {
      description: 'Get the JSON schema for a specific JSON schema type reference',
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
        name: z
          .string()
          .describe(
            "The name of the type to query (e.g., 'BucketGrant', 'FunctionEnvironment', 'InstanceCpuOptions')"
          ),
        version: z
          .string()
          .optional()
          .describe(
            "The provider version to use (e.g., '6.0.0'). If not specified, uses the latest available version."
          )
      },
      handler: async (args: GetTypeSchemaArgs) => {
        const schema = await getSchema(args.provider, args.version);
        const typeEntry = Object.entries(schema.types).find(([key]) => {
          const [, modulePath, typeName] = key.split(':');
          const mainModule = modulePath.split('/')[0];

          if (args.module) {
            // If module is provided, match module and resource name
            return mainModule === args.module && typeName === args.name;
          } else {
            // If no module provided, match resource name only
            return typeName === args.name;
          }
        });
        if (typeEntry) {
          return {
            description: 'Returns information about Pulumi Registry Types',
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(typeEntry[1])
              }
            ]
          };
        } else {
          return {
            description: 'Returns information about Pulumi Registry Types', // Consider making this more specific, e.g., "Type not found"
            content: [
              {
                type: 'text' as const,
                text: `No information found for ${args.name}${args.module ? ` in module ${args.module}` : ''}`
              }
            ]
          };
        }
      }
    },
    'get-resource': {
      description: 'Returns information about a Pulumi Registry resource',
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
            "The module to query (e.g., 's3', 'ec2', 'lambda'). If not specified it will match resources with the given name in any module."
          ),
        resource: z
          .string()
          .describe("The resource type to query (e.g., 'Bucket', 'Function', 'Instance')"),
        version: z
          .string()
          .optional()
          .describe(
            "The provider version to use (e.g., '6.0.0'). If not specified, uses the latest available version."
          )
      },
      handler: async (args: GetResourceArgs) => {
        const schema = await getSchema(args.provider, args.version);
        // Find the resource entry [key, data] directly
        const resourceEntry = Object.entries(schema.resources).filter(([key]) => {
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

        if (resourceEntry.length > 0) {
          const resources: GetResourceData[] = resourceEntry.flatMap((entry) => {
            const schema = entry[1];
            const resourceName = entry[0];
            const outputProperties: Record<string, ResourceProperty> = {};
            for (const [key, value] of Object.entries(schema.properties)) {
              if (!(key in schema.inputProperties)) {
                outputProperties[key] = value;
              }
            }
            const requiredOutputs = schema.required.filter(
              (name) => !(name in schema.inputProperties)
            );

            return {
              // for now leaving out:
              // - `description`: Can be pretty large and contains all language examples (if we knew the language we could extract the specific language example)
              type: resourceName,
              requiredInputs: schema.requiredInputs,
              inputProperties: schema.inputProperties,
              outputProperties: outputProperties,
              requiredOutputs: requiredOutputs
            };
          });
          return {
            description: 'Returns information about a Pulumi Registry resource',
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(resources)
              }
            ]
          };
        } else {
          return {
            description: 'Returns information about a Pulumi Registry resource', // Consider making this more specific, e.g., "Resource not found"
            content: [
              {
                type: 'text' as const,
                text: `No information found for ${args.resource}${args.module ? ` in module ${args.module}` : ''}. You can call list-resources to get a list of resources` // Slightly improved message
              }
            ]
          };
        }
      }
    },

    'get-function': {
      description: 'Returns information about a Pulumi Registry function',
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
            "The module to query (e.g., 's3', 'ec2', 'lambda'). If not specified it will match functions with the given name in any module."
          ),
        function: z
          .string()
          .describe("The function type to query (e.g., 'getBucket', 'getFunction', 'getInstance')"),
        version: z
          .string()
          .optional()
          .describe(
            "The provider version to use (e.g., '6.0.0'). If not specified, uses the latest available version."
          )
      },
      handler: async (args: GetFunctionArgs) => {
        const schema = await getSchema(args.provider, args.version);
        // Find the function entry [key, data] directly
        const functionEntry = Object.entries(schema.functions).filter(([key]) => {
          const [, modulePath, functionName] = key.split(':');
          const mainModule = modulePath.split('/')[0];

          if (args.module) {
            // If module is provided, match module and function name
            return mainModule === args.module && functionName === args.function;
          } else {
            // If no module provided, match function name only
            return functionName === args.function;
          }
        });

        if (functionEntry.length > 0) {
          const functions: GetFunctionData[] = functionEntry.flatMap((entry) => {
            const schema = entry[1];
            const functionName = entry[0];
            return {
              // for now leaving out:
              // - `description`: Can be pretty large and contains all language examples (if we knew the language we could extract the specific language example)
              type: functionName,
              inputs: schema.inputs,
              outputs: schema.outputs
            };
          });
          return {
            description: 'Returns information about a Pulumi Registry function',
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(functions)
              }
            ]
          };
        } else {
          return {
            description: 'Returns information about a Pulumi Registry function', // Consider making this more specific, e.g., "Function not found"
            content: [
              {
                type: 'text' as const,
                text: `No information found for ${args.function}${args.module ? ` in module ${args.module}` : ''}. You can call list-functions to get a list of functions` // Slightly improved message
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
          .describe("Optional module to filter by (e.g., 's3', 'ec2', 'lambda')"),
        version: z
          .string()
          .optional()
          .describe(
            "The provider version to use (e.g., '6.0.0'). If not specified, uses the latest available version."
          )
      },
      handler: async (args: ListResourcesArgs) => {
        const schema = await getSchema(args.provider, args.version);

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
              type: key,
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

        return {
          description: 'Lists available Pulumi Registry resources',
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(resources)
            }
          ]
        };
      }
    },

    'list-functions': {
      description: 'List all function types for a given provider and module',
      schema: {
        provider: z
          .string()
          .describe(
            "The cloud provider (e.g., 'aws', 'azure', 'gcp', 'random') or github.com/org/repo for Git-hosted components"
          ),
        module: z
          .string()
          .optional()
          .describe("Optional module to filter by (e.g., 's3', 'ec2', 'lambda')"),
        version: z
          .string()
          .optional()
          .describe(
            "The provider version to use (e.g., '6.0.0'). If not specified, uses the latest available version."
          )
      },
      handler: async (args: ListFunctionsArgs) => {
        const schema = await getSchema(args.provider, args.version);

        // Filter and format functions
        const functions = Object.entries(schema.functions)
          .filter(([key]) => {
            if (args.module) {
              const [, modulePath] = key.split(':');
              const mainModule = modulePath.split('/')[0];
              return mainModule === args.module;
            }
            return true;
          })
          .map(([key, func]) => {
            const functionName = key.split(':').pop() || '';
            const modulePath = key.split(':')[1];
            const mainModule = modulePath.split('/')[0];
            // Trim description at first '#' character
            const shortDescription = func.description?.split('\n')[0].trim() ?? '<no description>';
            return {
              type: key,
              name: functionName,
              module: mainModule,
              description: shortDescription
            };
          });

        if (functions.length === 0) {
          return {
            description: 'No functions found',
            content: [
              {
                type: 'text' as const,
                text: args.module
                  ? `No functions found for provider '${args.provider}' in module '${args.module}'`
                  : `No functions found for provider '${args.provider}'`
              }
            ]
          };
        }

        return {
          description: 'Lists available Pulumi Registry functions',
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(functions)
            }
          ]
        };
      }
    }
  };
};
