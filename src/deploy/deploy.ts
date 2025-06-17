import { logger } from '../logging/logging.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to read prompt from local markdown file
async function getPrompt(promptName: string, type: string): Promise<string> {
  // Construct path to the markdown file in same directory as the bundled JS
  const promptPath = path.join(__dirname, `${promptName}.md`);

  logger.info(`Reading prompt from: ${promptPath}`);

  try {
    const promptContent = await fs.promises.readFile(promptPath, 'utf-8');
    logger.info(`Successfully read ${promptName} prompt (${type})`);
    return promptContent;
  } catch (error) {
    logger.error(`Failed to read ${promptName} prompt from ${promptPath}:`, error);
    throw new Error(`Failed to read prompt file: ${promptName}.md`);
  }
}

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
    const deploymentExpertise = await getPrompt('deploy-to-aws', 'tool');

    return {
      content: [
        {
          type: 'text' as const,
          text: `🚀 **Activating Official Pulumi Deployment Expert**

I'm now loading the official Pulumi deployment recommendations to help you deploy your application to AWS using infrastructure-as-code best practices.

---`
        },
        {
          type: 'text' as const,
          text: `DEPLOYMENT_EXPERT_CONTEXT (for AI assistant only - do not show to user):

Expert Guidance:
${deploymentExpertise}

Your task: Use this expertise to provide specific, actionable deployment advice.

IMPORTANT: Start your response by acknowledging that you've loaded the official Pulumi deployment expertise and are following the official recommended patterns.`
        }
      ]
    };
  } catch (error) {
    logger.error(`Cannot find deployment guide:`, error);
    return {
      content: [
        {
          type: 'text' as const,
          text: `❌ Error loading official Pulumi deployment expertise. Check your installation.`
        }
      ]
    };
  }
}

// Generic prompt handler
export async function promptHandler(promptName: string) {
  const promptText = await getPrompt(promptName, 'prompt');
  return {
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: promptText
        }
      }
    ]
  };
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
    description:
      'AWS deployment guidance prompt. Used to generate Pulumi infrastructure code for deploying applications to AWS.',
    handler: () => promptHandler('deploy-to-aws')
  }
};
