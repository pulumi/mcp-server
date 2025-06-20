import { logger } from '../logging/logging.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to read prompt from local markdown file
export async function getPrompt(
  promptName: string,
  type: string,
  args?: Record<string, string>
): Promise<string> {
  // Construct path to the markdown file in same directory as the bundled JS
  const promptPath = path.join(__dirname, `${promptName}.md`);

  logger.info(`Reading prompt from: ${promptPath}`);

  try {
    let promptContent = await fs.promises.readFile(promptPath, 'utf-8');
    logger.info(`Successfully read ${promptName} prompt (${type})`);
    // Replace placeholders with actual values
    if (args) {
      Object.entries(args).forEach(([key, value]) => {
        promptContent = promptContent.replace(`{{${key}}}`, value);
      });
    }
    return promptContent;
  } catch (error) {
    logger.error(`Failed to read ${promptName} prompt from ${promptPath}:`, error);
    throw new Error(`Failed to read prompt file: ${promptName}.md`);
  }
}

export async function promptHandler(promptName: string, args?: Record<string, string>) {
  const promptText = await getPrompt(promptName, 'prompt', args);
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
