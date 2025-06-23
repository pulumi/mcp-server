import { expect } from 'chai';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { registryCommands } from '../src/pulumi/registry.js';

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

  describe('getResource handler', () => {
    const commands = registryCommands(CACHE_DIR);

    it('should return resource information when resource exists', async () => {
      const args = {
        provider: 'test',
        module: 'test',
        resource: 'Test'
      };

      const result = await commands['get-resource'].handler(args);

      expect(result.description).to.equal('Returns information about a Pulumi Registry resource');
      const jsonText = JSON.parse(result.content[0].text);
      expect(jsonText).to.contain({
        type: 'test:test:Test'
      });
      expect(Object.keys(jsonText)).to.have.all.members([
        'type',
        'requiredInputs',
        'inputProperties',
        'outputProperties',
        'requiredOutputs'
      ]);
    });

    it('should handle resources in different modules', async () => {
      const args = {
        provider: 'test',
        module: 'module',
        resource: 'ModuleTest'
      };

      const result = await commands['get-resource'].handler(args);

      expect(result.description).to.equal('Returns information about a Pulumi Registry resource');
      const jsonText = JSON.parse(result.content[0].text);
      expect(jsonText).to.contain({
        type: 'test:module:ModuleTest'
      });
      expect(result.content[0].type).to.equal('text');
    });

    it('should handle missing module parameter', async () => {
      const args = {
        provider: 'test',
        resource: 'Test'
      };

      const result = await commands['get-resource'].handler(args);

      expect(result.description).to.equal('Returns information about a Pulumi Registry resource');
      const jsonText = JSON.parse(result.content[0].text);
      expect(jsonText).to.contain({
        type: 'test:test:Test'
      });
    });

    it('should find resource in any module when module is not specified', async () => {
      const args = {
        provider: 'test',
        resource: 'ModuleTest'
      };

      const result = await commands['get-resource'].handler(args);

      expect(result.description).to.equal('Returns information about a Pulumi Registry resource');
      expect(result.content[0].type).to.equal('text');
      const jsonText = JSON.parse(result.content[0].text);
      expect(jsonText).to.contain({
        type: 'test:module:ModuleTest'
      });
    });

    it('should find resource in complex module path', async () => {
      const args = {
        provider: 'test',
        resource: 'ComplexTest'
      };

      const result = await commands['get-resource'].handler(args);

      expect(result.description).to.equal('Returns information about a Pulumi Registry resource');
      expect(result.content[0].type).to.equal('text');
      const jsonText = JSON.parse(result.content[0].text);
      expect(jsonText).to.contain({
        type: 'test:complex/module:ComplexTest'
      });
    });

    it('should find resource in complex module path by main module name', async () => {
      const args = {
        provider: 'test',
        module: 'complex',
        resource: 'ComplexTest'
      };

      const result = await commands['get-resource'].handler(args);

      expect(result.description).to.equal('Returns information about a Pulumi Registry resource');
      expect(result.content[0].type).to.equal('text');
      const jsonText = JSON.parse(result.content[0].text);
      expect(jsonText).to.contain({
        type: 'test:complex/module:ComplexTest'
      });
    });

    it('should prefer exact module match when module is specified', async () => {
      const args = {
        provider: 'test',
        module: 'test',
        resource: 'Test'
      };

      const result = await commands['get-resource'].handler(args);

      expect(result.description).to.equal('Returns information about a Pulumi Registry resource');
      expect(result.content[0].type).to.equal('text');
      const jsonText = JSON.parse(result.content[0].text);
      expect(jsonText).to.contain({
        type: 'test:test:Test'
      });
    });

    it('should handle non-existent resources with module specified', async () => {
      const args = {
        provider: 'test',
        module: 'test',
        resource: 'NonExistent'
      };

      const result = await commands['get-resource'].handler(args);

      expect(result.description).to.equal('Returns information about a Pulumi Registry resource');
      expect(result.content[0].type).to.equal('text');
      expect(result.content[0].text).to.include('No information found for NonExistent');
      expect(result.content[0].text).to.include('You can call list-resources');
    });
  });

  describe('listResources handler', () => {
    const commands = registryCommands(CACHE_DIR);

    it('should list all resources for a provider with their modules', async () => {
      const args = {
        provider: 'test'
      };

      const result = await commands['list-resources'].handler(args);

      expect(result.description).to.equal('Lists available Pulumi Registry resources');
      expect(result.content[0].type).to.equal('text');
      expect(result.content[0].text).to.include('Available resources for test:');
      expect(result.content[0].text).to.include('Test (test)');
      expect(result.content[0].text).to.include('AnotherTest (test)');
      expect(result.content[0].text).to.include('ModuleTest (module)');
      expect(result.content[0].text).to.include('ComplexTest (complex)');
    });

    it('should filter resources by main module name', async () => {
      const args = {
        provider: 'test',
        module: 'complex'
      };

      const result = await commands['list-resources'].handler(args);

      expect(result.description).to.equal('Lists available Pulumi Registry resources');
      expect(result.content[0].type).to.equal('text');
      expect(result.content[0].text).to.include('Available resources for test/complex:');
      expect(result.content[0].text).to.include('ComplexTest (complex)');
      expect(result.content[0].text).to.not.include('Test (test)');
      expect(result.content[0].text).to.not.include('ModuleTest (module)');
    });

    it('should handle non-existent module', async () => {
      const args = {
        provider: 'test',
        module: 'nonexistent'
      };

      const result = await commands['list-resources'].handler(args);

      expect(result.description).to.equal('No resources found');
      expect(result.content[0].type).to.equal('text');
      expect(result.content[0].text).to.include(
        `No resources found for provider 'test' in module 'nonexistent'`
      );
    });
  });

  describe('getType handler', () => {
    const commands = registryCommands(CACHE_DIR);
    it('should find type in complex module path', async () => {
      const args = {
        provider: 'test',
        module: 'complex',
        name: 'ComplexType'
      };
      const result = await commands['get-type'].handler(args);
      expect(result.description).to.equal('Returns information about Pulumi Registry Types');
      expect(result.content[0].type).to.equal('text');
      expect(JSON.parse(result.content[0].text)).to.deep.equal({
        properties: {
          level: {
            type: 'number',
            description: 'The complexity level'
          }
        },
        type: 'object'
      });
    });

    it('should prefer exact module match when module is specified', async () => {
      const args = {
        provider: 'test',
        module: 'test',
        name: 'DuplicateType'
      };
      const result = await commands['get-type'].handler(args);
      expect(result.description).to.equal('Returns information about Pulumi Registry Types');
      expect(result.content[0].type).to.equal('text');
      expect(JSON.parse(result.content[0].text)).to.deep.equal({
        properties: {
          foo: {
            type: 'string',
            description: 'Foo property'
          }
        },
        type: 'object'
      });
    });
    it('should return type information when type exists and module is not specified', async () => {
      const args = {
        provider: 'test',
        name: 'TestReferenceProperty'
      };

      const result = await commands['get-type'].handler(args);
      expect(result.description).to.equal('Returns information about Pulumi Registry Types');
      expect(result.content[0].type).to.equal('text');
      expect(JSON.parse(result.content[0].text)).to.deep.equal({
        properties: {
          name: {
            type: 'string',
            description: 'The name of the property'
          }
        },
        type: 'object'
      });
    });

    it('should handle non-existent types when module is not specified', async () => {
      const args = {
        provider: 'test',
        name: 'NonExistentType'
      };

      const result = await commands['get-type'].handler(args);
      expect(result.description).to.equal('Returns information about Pulumi Registry Types');
      expect(result.content[0].type).to.equal('text');
      expect(result.content[0].text).to.equal('No information found for NonExistentType');
    });

    it('should return type information when type exists', async () => {
      const args = {
        provider: 'test',
        module: 'test',
        name: 'TestReferenceProperty'
      };

      const result = await commands['get-type'].handler(args);
      expect(result.description).to.equal('Returns information about Pulumi Registry Types');
      expect(result.content[0].type).to.equal('text');
      expect(JSON.parse(result.content[0].text)).to.deep.equal({
        properties: {
          name: {
            type: 'string',
            description: 'The name of the property'
          }
        },
        type: 'object'
      });
    });

    it('should handle non-existent types', async () => {
      const args = {
        provider: 'test',
        module: 'test',
        name: 'NonExistentType'
      };

      const result = await commands['get-type'].handler(args);
      expect(result.description).to.equal('Returns information about Pulumi Registry Types');
      expect(result.content[0].type).to.equal('text');
      expect(result.content[0].text).to.equal(
        'No information found for NonExistentType in module test'
      );
    });
  });
});
