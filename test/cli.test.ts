import { expect } from 'chai';
import { cliCommands } from '../src/pulumi/cli.js';

describe('CLI Commands', () => {
  describe('refresh command', () => {
    it('should have correct description and schema', () => {
      const refreshCommand = cliCommands.refresh;
      
      expect(refreshCommand).to.exist;
      expect(refreshCommand.description).to.equal('Run pulumi refresh for a given project and stack');
      
      // Check schema properties
      expect(refreshCommand.schema.workDir).to.exist;
      expect(refreshCommand.schema.stackName).to.exist;
      
      // Verify workDir is required string
      expect(refreshCommand.schema.workDir._def.typeName).to.equal('ZodString');
      
      // Verify stackName is optional string
      expect(refreshCommand.schema.stackName._def.typeName).to.equal('ZodOptional');
      expect(refreshCommand.schema.stackName._def.innerType._def.typeName).to.equal('ZodString');
    });

    it('should have a handler function', () => {
      const refreshCommand = cliCommands.refresh;
      
      expect(refreshCommand.handler).to.be.a('function');
    });
  });

  describe('command structure consistency', () => {
    const commands = ['preview', 'up', 'refresh'] as const;
    
    commands.forEach(commandName => {
      it(`${commandName} should have consistent schema structure`, () => {
        const command = cliCommands[commandName];
        
        expect(command).to.exist;
        expect(command.description).to.be.a('string');
        expect(command.schema).to.exist;
        expect(command.schema.workDir).to.exist;
        expect(command.schema.stackName).to.exist;
        expect(command.handler).to.be.a('function');
      });
    });
  });

  describe('all commands', () => {
    it('should export all expected commands', () => {
      expect(cliCommands.preview).to.exist;
      expect(cliCommands.up).to.exist;
      expect(cliCommands.refresh).to.exist;
      expect(cliCommands['stack-output']).to.exist;
    });
  });
});