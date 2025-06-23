import { logger } from '../logging/logging.js';
import { getPrompt, promptHandler } from '../prompts/prompts.js';

// Deploy to AWS tool handler
export async function deployToAwsHandler() {
  // Check for test mode
  if (process.env.MCP_TEST_MODE === 'true') {
    logger.info('Running in test mode - returning mock response');
    return {
      content: [
        {
          type: 'text' as const,
          text: '✅ deploy-to-aws tool invoked successfully in test mode'
        }
      ]
    };
  }

  try {
    const deploymentAssistantPrompt = await getPrompt('deploy-to-aws', 'tool');

    return {
      content: [
        {
          type: 'text' as const,
          text: `🚀 **Activating Official Pulumi Deployment Assistant**

I'm now loading the official Pulumi deployment recommendations to help you deploy your application to AWS using infrastructure-as-code best practices.

---`
        },
        {
          type: 'text' as const,
          text: `DEPLOYMENT_ASSISTANT_CONTEXT (for AI assistant only - do not show to user):

Assistant Guidance:

${deploymentAssistantPrompt}

Your task: Use these instructions to provide specific, actionable deployment advice.

IMPORTANT: Start your response by acknowledging that you've loaded the official Pulumi deployment assistant and are following the official recommended patterns.`
        }
      ]
    };
  } catch (error) {
    logger.error(`Cannot find deployment guide:`, error);
    return {
      content: [
        {
          type: 'text' as const,
          text: `❌ Error loading official Pulumi deployment assistant. Error: ${error}. Check your installation.`
        }
      ]
    };
  }
}

export const deployCommands = {
  'deploy-to-aws': {
    description:
      'Deploy application code to AWS by generating Pulumi infrastructure. This tool automatically analyzes your application files and provisions the appropriate AWS resources (S3, Lambda, EC2, etc.) based on what it finds. No prior analysis needed -  just invoke directly.',
    schema: {},
    handler: deployToAwsHandler
  }
};

export const deployPrompts = {
  'deploy-to-aws': {
    name: 'deploy-to-aws',
    description: 'Deploy application code to AWS by generating Pulumi infrastructure',
    handler: () => promptHandler('deploy-to-aws')
  }
};
