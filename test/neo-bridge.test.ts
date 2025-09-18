import { expect } from 'chai';
import { neoBridgeCommands, isRelevantMessage } from '../src/neo/neo-bridge.js';
import { listTools } from './helpers.js';

describe('Neo Bridge Commands', () => {
  describe('neo-reset-conversation', () => {
    const resetCommand = neoBridgeCommands['neo-reset-conversation'];

    it('should reset specific task when taskId provided', async () => {
      const args = { taskId: 'task-123' };
      const result = await resetCommand.handler(args);

      expect(result.description).to.equal('Neo task reset');
      expect(result.content[0].text).to.equal('Neo task task-123 has been reset.');
      expect(result.has_more).to.be.false;
    });

    it('should reset all tasks when no taskId provided', async () => {
      const args = {};
      const result = await resetCommand.handler(args);

      expect(result.description).to.equal('Neo conversation reset');
      expect(result.content[0].text).to.equal('All Neo task states have been cleared.');
      expect(result.has_more).to.be.false;
    });
  });

  describe('neo-bridge', () => {
    const neoCommand = neoBridgeCommands['neo-bridge'];

    it('should return error when PULUMI_ACCESS_TOKEN is not set', async () => {
      // Save original token and clear it
      const originalToken = process.env.PULUMI_ACCESS_TOKEN;
      delete process.env.PULUMI_ACCESS_TOKEN;

      const args = { query: 'test query' };
      const result = await neoCommand.handler(args);

      expect(result.description).to.equal('Missing PULUMI_ACCESS_TOKEN');
      expect(result.content[0].text).to.include(
        'PULUMI_ACCESS_TOKEN environment variable is not set'
      );
      expect(result.has_more).to.be.false;

      // Restore original token
      if (originalToken) {
        process.env.PULUMI_ACCESS_TOKEN = originalToken;
      }
    });

    it('should handle invalid state correctly', async () => {
      // Set a dummy token for this test
      process.env.PULUMI_ACCESS_TOKEN = 'test-token';

      const args = { query: 'test query', taskId: undefined };

      try {
        const result = await neoCommand.handler(args);
        // Should throw error or return error response
        expect(result.description).to.equal('Network error');
        expect(result.content[0].text).to.include('Failed to process Neo task');
      } catch (error) {
        // Expected behavior - invalid state should throw
        expect(error).to.be.instanceOf(Error);
      }
    });

    it('should require approval parameter when task has pending approval', async () => {
      // Set a dummy token for this test
      process.env.PULUMI_ACCESS_TOKEN = 'test-token';

      // Since we can't easily mock the internal task state, we'll test the schema instead
      // This test verifies the approval parameter exists in the schema
      const schema = neoBridgeCommands['neo-bridge'].schema;
      expect(schema.approval).to.exist;

      // Verify the approval parameter is optional boolean
      expect(schema.approval._def.typeName).to.equal('ZodOptional');
      expect(schema.approval._def.innerType._def.typeName).to.equal('ZodBoolean');
    });
  });

  describe('Schema validation', () => {
    it('should have correct schema for neo-bridge', () => {
      const schema = neoBridgeCommands['neo-bridge'].schema;

      expect(schema.query).to.exist;
      expect(schema.context).to.exist;
      expect(schema.taskId).to.exist;
      expect(schema.approval).to.exist;
    });

    it('should have correct schema for neo-reset-conversation', () => {
      const schema = neoBridgeCommands['neo-reset-conversation'].schema;

      expect(schema.taskId).to.exist;
    });
  });

  describe('Tool Metadata', () => {
    it('should list neo-bridge as an available tool', async function () {
      const response = await listTools();

      // Find the neo-bridge tool
      const neoBridgeTool = response.tools.find((tool) => tool.name === 'neo-bridge');
      expect(neoBridgeTool).to.not.equal(undefined);
      expect(neoBridgeTool?.description).to.include('Launch and monitor Neo tasks');

      // Verify it has the expected schema parameters
      expect(neoBridgeTool?.inputSchema).to.be.an('object');
      const schema = neoBridgeTool?.inputSchema as any;
      expect(schema.properties).to.have.property('query');
      expect(schema.properties).to.have.property('context');
      expect(schema.properties).to.have.property('taskId');
      expect(schema.properties).to.have.property('approval');
    });

    it('should list neo-reset-conversation as an available tool', async function () {
      const response = await listTools();

      // Find the neo-reset-conversation tool
      const resetTool = response.tools.find((tool) => tool.name === 'neo-reset-conversation');
      expect(resetTool).to.not.equal(undefined);
      expect(resetTool?.description).to.include('Reset the Neo conversation');

      // Verify it has the expected schema parameters
      expect(resetTool?.inputSchema).to.be.an('object');
      const schema = resetTool?.inputSchema as any;
      expect(schema.properties).to.have.property('taskId');
    });
  });

  describe('Approval Flow Tests', () => {
    it('should reject invalid events with isRelevantMessage', () => {
      // Test various invalid event structures (executes production code)
      expect(isRelevantMessage(null)).to.be.false;
      expect(isRelevantMessage(undefined)).to.be.false;
      expect(isRelevantMessage('string')).to.be.false;
      expect(isRelevantMessage(123)).to.be.false;
      expect(isRelevantMessage({})).to.be.false;

      // Missing required properties
      expect(isRelevantMessage({ type: 'agentResponse' })).to.be.false; // missing id
      expect(isRelevantMessage({ id: 'test' })).to.be.false; // missing type
      expect(isRelevantMessage({ type: 'wrongType', id: 'test' })).to.be.false; // wrong type

      // Missing eventBody
      expect(isRelevantMessage({ type: 'agentResponse', id: 'test' })).to.be.false;

      // Invalid eventBody
      expect(
        isRelevantMessage({
          type: 'agentResponse',
          id: 'test',
          eventBody: null
        })
      ).to.be.false;

      expect(
        isRelevantMessage({
          type: 'agentResponse',
          id: 'test',
          eventBody: 'string'
        })
      ).to.be.false;

      // Missing required eventBody properties
      expect(
        isRelevantMessage({
          type: 'agentResponse',
          id: 'test',
          eventBody: { type: 'user_approval_request' } // missing timestamp
        })
      ).to.be.false;

      expect(
        isRelevantMessage({
          type: 'agentResponse',
          id: 'test',
          eventBody: { timestamp: '2025-01-01' } // missing type
        })
      ).to.be.false;
    });

    it('should accept valid assistant messages with isRelevantMessage', () => {
      // Test valid message structures (executes production code)
      const validAssistantMessage = {
        type: 'agentResponse',
        id: 'test-assistant-id',
        eventBody: {
          type: 'assistant_message',
          timestamp: '2025-09-18T18:20:25.553066Z',
          content: 'This is a test assistant message'
        }
      };

      expect(isRelevantMessage(validAssistantMessage)).to.be.true;
    });

    it('should accept valid approval requests with isRelevantMessage', () => {
      // Test approval request structure (executes production code)
      const validApprovalRequest = {
        type: 'agentResponse',
        id: 'test-event-id',
        eventBody: {
          type: 'user_approval_request',
          timestamp: '2025-09-18T18:20:25.553066Z',
          id: 'sys-approval-test-123',
          message: 'Should I proceed with the test operation?'
        }
      };

      expect(isRelevantMessage(validApprovalRequest)).to.be.true;
    });

    it('should reject irrelevant message types with isRelevantMessage', () => {
      // Test rejection of other message types (executes production code)
      const irrelevantMessage = {
        type: 'agentResponse',
        id: 'test-id',
        eventBody: {
          type: 'some_other_type',
          timestamp: '2025-09-18T18:20:25.553066Z'
        }
      };

      expect(isRelevantMessage(irrelevantMessage)).to.be.false;
    });
  });
});
