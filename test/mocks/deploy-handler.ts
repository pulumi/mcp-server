import { DeployHandlerBase, DeployResult } from '../../src/deploy/deploy.js';

/**
 * Test implementation using mock response
 */
export class TestDeployHandler extends DeployHandlerBase {
  async handle(): Promise<DeployResult> {
    return {
      content: [
        {
          type: 'text' as const,
          text: '✅ deploy-to-aws tool invoked successfully in test mode'
        }
      ]
    };
  }
}