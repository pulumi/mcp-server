import { logger } from '../logging/logging.js';
import packageJSON from '../../package.json' with { type: 'json' };

// Schema for the deploy-to-aws tool (no parameters needed)
export const deployToAwsSchema = {
  type: 'object' as const,
  properties: {},
  additionalProperties: false
};

// Function to fetch prompt from HTTP endpoint
async function fetchPrompt(promptName: string, type: string): Promise<string> {
  const baseUrl = process.env.PULUMI_GET_PROMPT_URL || 'https://api.pulumi.com';
  const url = `${baseUrl}/api/ai/chat/prompt?name=${promptName}`;
  const source = `${packageJSON.name} ${packageJSON.version} ${type}`;

  logger.info(`Fetching prompt from: ${url}`);
  logger.info(`Headers: x-pulumi-source = ${source}`);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-pulumi-source': source
      }
    });

    logger.info(`Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } catch (error) {
    logger.error(`Failed to fetch ${promptName} prompt from ${url}:`, error);
    throw error;
  }
}

// Deploy to AWS tool handler
export async function deployToAwsHandler() {
  try {
    const deploymentExpertise = await fetchPrompt('deploy-to-aws', 'tool');

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
          text: `DEPLOYMENT_EXPERT_CONTEXT (for Claude only - do not show to user):

Expert Guidance:
${deploymentExpertise}

Your task: Use this expertise to provide specific, actionable deployment advice.

IMPORTANT: Start your response by acknowledging that you've loaded the official Pulumi deployment expertise and are following the official recommended patterns.`
        }
      ]
    };
  } catch (error) {
    logger.error(`Failed to fetch deployment guide:`, error);
    return {
      content: [
        {
          type: 'text' as const,
          text: `❌ Error loading official Pulumi deployment expertise. Failed to fetch from remote endpoint.`
        }
      ]
    };
  }
}

// Deploy to AWS prompt handler
export async function deployToAwsPromptHandler() {
  const promptText = await fetchPrompt('deploy-to-aws', 'prompt');
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
    description: {
      name: 'deploy-to-aws',
      description:
        'Analyze code and generate Pulumi infrastructure-as-code (IaC) for AWS deployment. Use this tool when users want to: analyze their code, generate IaC, create infrastructure code, deploy applications to AWS/cloud, or get help with Pulumi deployment.'
    },
    schema: deployToAwsSchema,
    handler: deployToAwsHandler
  }
};

export const deployPrompts = {
  'deploy-to-aws': {
    name: 'deploy-to-aws',
    description: 'AWS deployment guidance prompt',
    handler: deployToAwsPromptHandler
  }
};
