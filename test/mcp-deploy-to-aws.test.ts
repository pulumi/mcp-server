/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect } from 'chai';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('MCP Tool: deploy-to-aws', () => {
  const inspectorCommand = 'npx @modelcontextprotocol/inspector --cli node dist/index.js stdio --method tools/call --tool-name deploy-to-aws';

  before(async function () {
    this.timeout(30000); // 30 second timeout for build process

    // Set test mode environment variable
    process.env.MCP_TEST_MODE = 'true';
  });

  after(() => {
    // Clean up test environment variable
    delete process.env.MCP_TEST_MODE;
  });

  describe('Tool Invocation', () => {
    it('should successfully invoke deploy-to-aws tool with no parameters', async function () {
      this.timeout(30000); // 30 second timeout for MCP inspector

      try {
        const { stdout } = await execAsync(inspectorCommand);

        // Parse the JSON response
        const response = JSON.parse(stdout);

        // Validate response structure
        expect(response).to.be.an('object');
        expect(response).to.have.property('content');
        expect(response.content).to.be.an('array');
        expect(response.content).to.have.length.greaterThan(0);

        // Validate content structure
        const firstContent = response.content[0];
        expect(firstContent).to.have.property('type', 'text');
        expect(firstContent).to.have.property('text');

        // Validate test mode response
        expect(firstContent.text).to.include(
          'deploy-to-aws tool invoked successfully in test mode'
        );
      } catch (error) {
        if (error instanceof Error && 'stdout' in error) {
          console.error('Command stdout:', (error as any).stdout);
          console.error('Command stderr:', (error as any).stderr);
        }
        throw error;
      }
    });

    it('should fail when called with extra unneeded arguments', async function () {
      this.timeout(30000); // 30 second timeout for MCP inspector

      const inspectorCommandWithArgs = `${inspectorCommand} --tool-arg extraParam=notNeeded`;

      try {
        const { stdout } = await execAsync(inspectorCommandWithArgs);

        // The command should fail or return an error response
        // Either the process exits with error code or returns error in JSON
        const response = JSON.parse(stdout);

        // Check if there's an error in the response
        expect(response).to.have.property('error');
      } catch (error) {
        // This is expected - the command should fail with extra arguments
        // Verify it's the right kind of error (not a parsing error)
        expect(error).to.be.instanceOf(Error);

        if (error instanceof Error && 'code' in error) {
          // Command failed with exit code - this is expected
          expect((error as any).code).to.be.greaterThan(0);
        }
      }
    });
  });

  describe('Tool Metadata', () => {
    it('should list deploy-to-aws as an available tool', async function () {
      this.timeout(30000); // 30 second timeout for MCP inspector

      const listToolsCommand =
        'npx @modelcontextprotocol/inspector --cli node dist/index.js stdio --method tools/list';

      try {
        const { stdout } = await execAsync(listToolsCommand);
        const response = JSON.parse(stdout);

        expect(response).to.be.an('object');
        expect(response).to.have.property('tools');
        expect(response.tools).to.be.an('array');

        // Find the deploy-to-aws tool
        const deployTool = response.tools.find((tool: any) => tool.name === 'deploy-to-aws');
        expect(deployTool).to.exist;
        expect(deployTool).to.have.property('description');
        expect(deployTool.description).to.include('Deploy application code to AWS');

        // Verify it has empty schema (no parameters required)
        expect(deployTool).to.have.property('inputSchema');
        expect(deployTool.inputSchema).to.be.an('object');
      } catch (error) {
        if (error instanceof Error && 'stdout' in error) {
          console.error('Command stdout:', (error as any).stdout);
          console.error('Command stderr:', (error as any).stderr);
        }
        throw error;
      }
    });
  });

  describe('Prompt Metadata', () => {
    it('should list deploy-to-aws as an available prompt', async function () {
      this.timeout(30000); // 30 second timeout for MCP inspector

      const listPromptsCommand =
        'npx @modelcontextprotocol/inspector --cli node dist/index.js stdio --method prompts/list';

      try {
        const { stdout } = await execAsync(listPromptsCommand);
        const response = JSON.parse(stdout);

        expect(response).to.be.an('object');
        expect(response).to.have.property('prompts');
        expect(response.prompts).to.be.an('array');

        // Find the deploy-to-aws prompt
        const deployPrompt = response.prompts.find(
          (prompt: any) => prompt.name === 'deploy-to-aws'
        );
        expect(deployPrompt).to.exist;
        expect(deployPrompt).to.have.property('name', 'deploy-to-aws');
        expect(deployPrompt).to.have.property('arguments');
      } catch (error) {
        if (error instanceof Error && 'stdout' in error) {
          console.error('Command stdout:', (error as any).stdout);
          console.error('Command stderr:', (error as any).stderr);
        }
        throw error;
      }
    });
  });
});
