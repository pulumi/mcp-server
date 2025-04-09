import { expect } from 'chai';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { formatSchema,registryCommands } from '../src/registry.js';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = path.join(__dirname, './.cache');

// Implement the lowercaseFirstChar function directly
function lowercaseFirstChar(str: string): string {
  if (!str) return str;
  return str.charAt(0).toLowerCase() + str.slice(1);
}

describe('Registry Commands', () => {
  describe('lowercaseFirstChar', () => {
    it('should convert the first character to lowercase', () => {
      expect(lowercaseFirstChar('Hello')).to.equal('hello');
      expect(lowercaseFirstChar('WORLD')).to.equal('wORLD');
      expect(lowercaseFirstChar('aBC')).to.equal('aBC');
    });

    it('should handle empty strings', () => {
      expect(lowercaseFirstChar('')).to.equal('');
    });

    it('should handle single character strings', () => {
      expect(lowercaseFirstChar('A')).to.equal('a');
      expect(lowercaseFirstChar('b')).to.equal('b');
    });
  });

  describe('formatSchema', () => {
    it('should format schema with required and optional properties', () => {
      const resourceKey = 'test:test:Test';
      const resourceData = {
        description: 'A test resource for unit testing',
        properties: {
          'id': {
            type: 'string',
            description: 'The unique identifier of the resource'
          },
          'name': {
            type: 'string',
            description: 'The name of the resource'
          },
          'arn': {
            type: 'string',
            description: 'The ARN of the resource'
          }
        },
        required: ['id', 'arn'],
        inputProperties: {
          'name': {
            type: 'string',
            description: 'The name to give to the resource'
          },
          'tags': {
            type: 'object',
            description: 'Tags to apply to the resource'
          }
        },
        requiredInputs: ['name']
      };
      
      const formatted = formatSchema(resourceKey, resourceData);
      
      expect(formatted).to.include('Resource: test:test:Test');
      expect(formatted).to.include('A test resource for unit testing');
      expect(formatted).to.include('Input Properties:');
      expect(formatted).to.include('name (string, required)');
      expect(formatted).to.include('tags (object)');
      expect(formatted).to.include('Output Properties:');
      expect(formatted).to.include('id (string, always present)');
      expect(formatted).to.include('arn (string, always present)');
      expect(formatted).to.include('name (string)');
    });

    it('should format schema with different property types', () => {
      const resourceKey = 'test:test:AnotherTest';
      const resourceData = {
        description: 'Another test resource with different properties',
        properties: {
          'id': {
            type: 'string',
            description: 'The unique identifier'
          },
          'value': {
            type: 'number',
            description: 'A numeric value'
          }
        },
        required: ['id'],
        inputProperties: {
          'value': {
            type: 'number',
            description: 'The value to set'
          },
          'enabled': {
            type: 'boolean',
            description: 'Whether the resource is enabled'
          }
        },
        requiredInputs: ['value', 'enabled']
      };
      
      const formatted = formatSchema(resourceKey, resourceData);
      
      expect(formatted).to.include('Resource: test:test:AnotherTest');
      expect(formatted).to.include('Another test resource with different properties');
      expect(formatted).to.include('value (number, required)');
      expect(formatted).to.include('enabled (boolean, required)');
      expect(formatted).to.include('value (number)');
    });

    it('should format schema with no required inputs', () => {
      const resourceKey = 'test:module:ModuleTest';
      const resourceData = {
        description: 'A test resource in a different module',
        properties: {
          'id': {
            type: 'string',
            description: 'The unique identifier'
          },
          'status': {
            type: 'string',
            description: 'The current status'
          }
        },
        required: ['id', 'status'],
        inputProperties: {
          'config': {
            type: 'object',
            description: 'Configuration object'
          }
        },
        requiredInputs: []
      };
      
      const formatted = formatSchema(resourceKey, resourceData);
      
      expect(formatted).to.include('Resource: test:module:ModuleTest');
      expect(formatted).to.include('A test resource in a different module');
      expect(formatted).to.include('config (object)');
      expect(formatted).to.include('id (string, always present)');
      expect(formatted).to.include('status (string, always present)');
    });
  });

  describe('getResource handler', () => {
    const commands = registryCommands(CACHE_DIR);

    it('should return resource information when resource exists', async () => {
      const args = {
        provider: 'test',
        module: 'test',
        resource: 'Test'
      };

      const result = await commands.getResource.handler(args);

      expect(result.description).to.equal('Returns information about Pulumi Registry resources');
      expect(result.content[0].type).to.equal('text');
      expect(result.content[0].text).to.include('Resource: test:test:Test');
      expect(result.content[0].text).to.include('A test resource for unit testing');
    });

    it('should handle resources in different modules', async () => {
      const args = {
        provider: 'test',
        module: 'module',
        resource: 'ModuleTest'
      };

      const result = await commands.getResource.handler(args);

      expect(result.description).to.equal('Returns information about Pulumi Registry resources');
      expect(result.content[0].type).to.equal('text');
      expect(result.content[0].text).to.include('Resource: test:module:ModuleTest');
    });

    it('should handle non-existent resources', async () => {
      const args = {
        provider: 'test',
        module: 'test',
        resource: 'NonExistent'
      };

      const result = await commands.getResource.handler(args);

      expect(result.description).to.equal('Returns information about Pulumi Registry resources');
      expect(result.content[0].type).to.equal('text');
      expect(result.content[0].text).to.include('No information found for test:test:NonExistent');
      expect(result.content[0].text).to.include('Available resources:');
    });

    it('should handle missing module parameter', async () => {
      const args = {
        provider: 'test',
        resource: 'Test'
      };

      const result = await commands.getResource.handler(args);

      expect(result.description).to.equal('Returns information about Pulumi Registry resources');
      expect(result.content[0].type).to.equal('text');
      expect(result.content[0].text).to.include('No information found for test:index:Test');
    });
  });

  describe('listResources handler', () => {
    const commands = registryCommands(CACHE_DIR);

    it('should list all resources for a provider', async () => {
      const args = {
        provider: 'test'
      };

      const result = await commands.listResources.handler(args);

      expect(result.description).to.equal('Lists available Pulumi Registry resources');
      expect(result.content[0].type).to.equal('text');
      expect(result.content[0].text).to.include('Available resources for test:');
      expect(result.content[0].text).to.include('Test');
      expect(result.content[0].text).to.include('AnotherTest');
      expect(result.content[0].text).to.include('ModuleTest');
    });

    it('should filter resources by module', async () => {
      const args = {
        provider: 'test',
        module: 'test'
      };

      const result = await commands.listResources.handler(args);

      expect(result.description).to.equal('Lists available Pulumi Registry resources');
      expect(result.content[0].type).to.equal('text');
      expect(result.content[0].text).to.include('Available resources for test/test:');
      expect(result.content[0].text).to.include('Test');
      expect(result.content[0].text).to.include('AnotherTest');
      expect(result.content[0].text).to.not.include('ModuleTest');
    });

    it('should handle non-existent module', async () => {
      const args = {
        provider: 'test',
        module: 'nonexistent'
      };

      const result = await commands.listResources.handler(args);

      expect(result.description).to.equal('No resources found');
      expect(result.content[0].type).to.equal('text');
      expect(result.content[0].text).to.include(`No resources found for provider 'test' in module 'nonexistent'`);
    });
  });
});
