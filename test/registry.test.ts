import { expect } from 'chai';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  registryCommands,
  GetResourceData,
  GetFunctionData,
  ListFunctionsData,
  ListResourcesData
} from '../src/pulumi/registry.js';

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
      const jsonArray: GetResourceData[] = JSON.parse(result.content[0].text);
      expect(jsonArray).to.be.an('array').with.lengthOf(1);
      expect(jsonArray.map((x: GetResourceData) => x.type)).to.include('test:test:Test');
      expect(Object.keys(jsonArray[0])).to.have.all.members([
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
      const jsonArray: GetResourceData[] = JSON.parse(result.content[0].text);
      expect(jsonArray).to.be.an('array').with.lengthOf(1);
      expect(jsonArray.map((x: GetResourceData) => x.type)).to.include('test:module:ModuleTest');
      expect(result.content[0].type).to.equal('text');
    });

    it('should handle missing module parameter', async () => {
      const args = {
        provider: 'test',
        resource: 'Test'
      };

      const result = await commands['get-resource'].handler(args);

      expect(result.description).to.equal('Returns information about a Pulumi Registry resource');
      const jsonArray: GetResourceData[] = JSON.parse(result.content[0].text);
      expect(jsonArray).to.be.an('array').with.lengthOf(2);
      expect(jsonArray.map((x: GetResourceData) => x.type)).to.have.all.members([
        'test:test:Test',
        'test:other:Test'
      ]);
    });

    it('should find resource in any module when module is not specified', async () => {
      const args = {
        provider: 'test',
        resource: 'ModuleTest'
      };

      const result = await commands['get-resource'].handler(args);

      expect(result.description).to.equal('Returns information about a Pulumi Registry resource');
      expect(result.content[0].type).to.equal('text');
      const jsonArray: GetResourceData[] = JSON.parse(result.content[0].text);
      expect(jsonArray).to.be.an('array').with.lengthOf(1);
      expect(jsonArray.map((x: GetResourceData) => x.type)).to.include('test:module:ModuleTest');
    });

    it('should find resource in complex module path', async () => {
      const args = {
        provider: 'test',
        resource: 'ComplexTest'
      };

      const result = await commands['get-resource'].handler(args);

      expect(result.description).to.equal('Returns information about a Pulumi Registry resource');
      expect(result.content[0].type).to.equal('text');
      const jsonArray: GetResourceData[] = JSON.parse(result.content[0].text);
      expect(jsonArray).to.be.an('array').with.lengthOf(1);
      expect(jsonArray.map((x: GetResourceData) => x.type)).to.include(
        'test:complex/module:ComplexTest'
      );
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
      const jsonArray: GetResourceData[] = JSON.parse(result.content[0].text);
      expect(jsonArray).to.be.an('array').with.lengthOf(1);
      expect(jsonArray.map((x: GetResourceData) => x.type)).to.include(
        'test:complex/module:ComplexTest'
      );
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
      const jsonArray: GetResourceData[] = JSON.parse(result.content[0].text);
      expect(jsonArray).to.be.an('array').with.lengthOf(1);
      expect(jsonArray.map((x: GetResourceData) => x.type)).to.include('test:test:Test');
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

  describe('getFunction handler', () => {
    const commands = registryCommands(CACHE_DIR);

    it('should return function information when function exists', async () => {
      const args = {
        provider: 'test',
        module: 'test',
        function: 'getTest'
      };

      const result = await commands['get-function'].handler(args);

      expect(result.description).to.equal('Returns information about a Pulumi Registry function');
      const jsonArray: GetFunctionData[] = JSON.parse(result.content[0].text);
      expect(jsonArray).to.be.an('array').with.lengthOf(1);
      expect(jsonArray.map((x: GetFunctionData) => x.type)).to.include('test:test:getTest');
      expect(Object.keys(jsonArray[0])).to.have.all.members(['type', 'inputs', 'outputs']);
    });

    it('should handle functions in different modules', async () => {
      const args = {
        provider: 'test',
        module: 'module',
        function: 'getModuleTest'
      };

      const result = await commands['get-function'].handler(args);

      expect(result.description).to.equal('Returns information about a Pulumi Registry function');
      const jsonArray: GetFunctionData[] = JSON.parse(result.content[0].text);
      expect(jsonArray).to.be.an('array').with.lengthOf(1);
      expect(jsonArray.map((x: GetFunctionData) => x.type)).to.include('test:module:getModuleTest');
      expect(result.content[0].type).to.equal('text');
    });

    it('should handle missing module parameter', async () => {
      const args = {
        provider: 'test',
        function: 'getTest'
      };

      const result = await commands['get-function'].handler(args);

      expect(result.description).to.equal('Returns information about a Pulumi Registry function');
      const jsonArray: GetFunctionData[] = JSON.parse(result.content[0].text);
      expect(jsonArray).to.be.an('array').with.lengthOf(2);
      expect(jsonArray.map((x: GetFunctionData) => x.type)).to.have.all.members([
        'test:test:getTest',
        'test:other:getTest'
      ]);
    });

    it('should find function in any module when module is not specified', async () => {
      const args = {
        provider: 'test',
        function: 'getModuleTest'
      };

      const result = await commands['get-function'].handler(args);

      expect(result.description).to.equal('Returns information about a Pulumi Registry function');
      expect(result.content[0].type).to.equal('text');
      const jsonArray: GetFunctionData[] = JSON.parse(result.content[0].text);
      expect(jsonArray).to.be.an('array').with.lengthOf(1);
      expect(jsonArray.map((x: GetFunctionData) => x.type)).to.include('test:module:getModuleTest');
    });

    it('should find function in complex module path', async () => {
      const args = {
        provider: 'test',
        function: 'getComplexTest'
      };

      const result = await commands['get-function'].handler(args);

      expect(result.description).to.equal('Returns information about a Pulumi Registry function');
      expect(result.content[0].type).to.equal('text');
      const jsonArray: GetFunctionData[] = JSON.parse(result.content[0].text);
      expect(jsonArray).to.be.an('array').with.lengthOf(1);
      expect(jsonArray.map((x: GetFunctionData) => x.type)).to.include(
        'test:complex/module:getComplexTest'
      );
    });

    it('should find function in complex module path by main module name', async () => {
      const args = {
        provider: 'test',
        module: 'complex',
        function: 'getComplexTest'
      };

      const result = await commands['get-function'].handler(args);

      expect(result.description).to.equal('Returns information about a Pulumi Registry function');
      expect(result.content[0].type).to.equal('text');
      const jsonArray: GetFunctionData[] = JSON.parse(result.content[0].text);
      expect(jsonArray).to.be.an('array').with.lengthOf(1);
      expect(jsonArray.map((x: GetFunctionData) => x.type)).to.include(
        'test:complex/module:getComplexTest'
      );
    });

    it('should prefer exact module match when module is specified', async () => {
      const args = {
        provider: 'test',
        module: 'test',
        function: 'getTest'
      };

      const result = await commands['get-function'].handler(args);

      expect(result.description).to.equal('Returns information about a Pulumi Registry function');
      expect(result.content[0].type).to.equal('text');
      const jsonArray: GetFunctionData[] = JSON.parse(result.content[0].text);
      expect(jsonArray).to.be.an('array').with.lengthOf(1);
      expect(jsonArray.map((x: GetFunctionData) => x.type)).to.include('test:test:getTest');
    });

    it('should handle non-existent functions with module specified', async () => {
      const args = {
        provider: 'test',
        module: 'test',
        function: 'getNonExistent'
      };

      const result = await commands['get-function'].handler(args);

      expect(result.description).to.equal('Returns information about a Pulumi Registry function');
      expect(result.content[0].type).to.equal('text');
      expect(result.content[0].text).to.include('No information found for getNonExistent');
      expect(result.content[0].text).to.include('You can call list-functions');
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
      const resources: ListResourcesData = JSON.parse(result.content[0].text);
      const names = resources.map((r) => r.name);
      expect(names).to.deep.equal(['Test', 'AnotherTest', 'ModuleTest', 'ComplexTest']);
    });

    it('should filter resources by main module name', async () => {
      const args = {
        provider: 'test',
        module: 'complex'
      };

      const result = await commands['list-resources'].handler(args);

      expect(result.description).to.equal('Lists available Pulumi Registry resources');
      expect(result.content[0].type).to.equal('text');
      const resources: ListResourcesData = JSON.parse(result.content[0].text);
      expect(resources.map((r) => r.name)).to.deep.equal(['ComplexTest']);
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

  describe('listFunctions handler', () => {
    const commands = registryCommands(CACHE_DIR);

    it('should list all functions for a provider with their modules', async () => {
      const args = {
        provider: 'test'
      };

      const result = await commands['list-functions'].handler(args);

      expect(result.description).to.equal('Lists available Pulumi Registry functions');
      expect(result.content[0].type).to.equal('text');
      const functions: ListFunctionsData = JSON.parse(result.content[0].text);
      const names = functions.map((f) => f.name);
      expect(names).to.deep.equal(['getTest', 'getAnotherTest', 'getModuleTest', 'getComplexTest']);
    });

    it('should filter functions by main module name', async () => {
      const args = {
        provider: 'test',
        module: 'complex'
      };

      const result = await commands['list-functions'].handler(args);

      expect(result.description).to.equal('Lists available Pulumi Registry functions');
      expect(result.content[0].type).to.equal('text');
      const functions: ListFunctionsData = JSON.parse(result.content[0].text);
      expect(functions.map((f) => f.name)).to.deep.equal(['getComplexTest']);
    });

    it('should handle non-existent module', async () => {
      const args = {
        provider: 'test',
        module: 'nonexistent'
      };

      const result = await commands['list-functions'].handler(args);

      expect(result.description).to.equal('No functions found');
      expect(result.content[0].type).to.equal('text');
      expect(result.content[0].text).to.include(
        `No functions found for provider 'test' in module 'nonexistent'`
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
