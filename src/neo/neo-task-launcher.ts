import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

type NeoTaskLauncherArgs = {
  query: string;
  context?: string;
};

// Global storage for the active Neo task ID to enable follow-up conversations
let activeTaskId: string | null = null;
// Track seen message IDs to avoid duplicate responses
let seenMessageIds: Set<string> = new Set();

function debugLog(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync(path.join(process.env.HOME || '~', 'test/mcp.log'), logMessage);
  } catch (error) {
    // Silently ignore logging errors
  }
}

async function pollTaskEvents(taskId: string, token: string): Promise<string[]> {
  debugLog(`Starting pollTaskEvents for task ${taskId}`);
  const startTime = Date.now();
  const maxTimeout = 5 * 60 * 1000; // 5 minutes

  while (Date.now() - startTime < maxTimeout) {
    try {
      const response = await fetch(
        `https://api.pulumi.com/api/preview/agents/pulumi/tasks/${taskId}/events`,
        {
          method: 'GET',
          headers: {
            Authorization: `token ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Events API returned status ${response.status}`);
      }

      const data = await response.json();

      // Check if we found the final message
      let foundFinalMessage = false;
      if (data.events) {
        for (const event of data.events) {
          if (event.type === 'agentResponse' && event.eventBody?.type === 'assistant_message') {
            if (event.eventBody.is_final === true) {
              foundFinalMessage = true;
              break;
            }
          }
        }
      }

      // If we found the final message, collect all unseen messages and return
      if (foundFinalMessage) {
        const messages: string[] = [];
        debugLog('Found final message, processing events...');
        for (const event of data.events) {
          if (event.type === 'agentResponse' && event.eventBody?.type === 'assistant_message') {
            const eventId = event.id;
            const content = event.eventBody.content;
            const isFinal = event.eventBody.is_final;
            
            debugLog(`Event ${eventId}, isFinal: ${isFinal}, hasSeen: ${seenMessageIds.has(eventId)}, hasContent: ${!!content}`);
            
            if (content && eventId) {
              if (!seenMessageIds.has(eventId)) {
                debugLog(`Adding message ${eventId} to result`);
                messages.push(content);
                seenMessageIds.add(eventId); // Mark as seen since we're returning it
              } else {
                debugLog(`Skipping message ${eventId} - already seen`);
              }
            }
          }
        }
        debugLog(`Returning ${messages.length} messages`);
        return messages;
      }

      // No final message yet, just continue polling
      // Wait 1 second before polling again
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      throw new Error(
        `Error polling task events: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  throw new Error('Task polling timed out after 5 minutes');
}

async function sendFollowUpMessage(taskId: string, token: string, message: string): Promise<string[]> {
  try {
    // First, get the current state to know what messages already exist
    const preResponse = await fetch(
      `https://api.pulumi.com/api/preview/agents/pulumi/tasks/${taskId}/events`,
      {
        method: 'GET',
        headers: {
          Authorization: `token ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const preMessages = new Set<string>();
    if (preResponse.ok) {
      const preData = await preResponse.json();
      if (preData.events) {
        for (const event of preData.events) {
          if (event.type === 'agentResponse' && event.eventBody?.type === 'assistant_message') {
            if (event.id) {
              preMessages.add(event.id);
            }
          }
        }
      }
    }
    debugLog(`Before follow-up: found ${preMessages.size} existing messages`);

    // Send the follow-up message
    const response = await fetch(
      `https://api.pulumi.com/api/preview/agents/pulumi/tasks/${taskId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `token ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event: {
            type: 'user_message',
            content: message,
            timestamp: new Date().toISOString()
          }
        })
      }
    );

    if (!response.ok) {
      if (response.status === 409) {
        throw new Error(`Task is currently busy processing. Please wait and try again.`);
      }
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Follow-up API returned status ${response.status}: ${errorText}`);
    }

    // Add pre-existing messages to seen set so we only return new ones
    for (const msgId of preMessages) {
      seenMessageIds.add(msgId);
    }
    debugLog(`Added ${preMessages.size} pre-existing messages to seenMessageIds`);
    
    // Poll for new responses after sending the follow-up message
    return await pollTaskEvents(taskId, token);
  } catch (error) {
    throw new Error(
      `Error sending follow-up message: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export const neoTaskLauncherCommands = {
  'neo-task-launcher': {
    description: 'Launch a Neo task when user asks Neo to do something',
    schema: {
      query: z.string().describe('The task query to send to Neo (what the user wants Neo to do)'),
      context: z
        .string()
        .optional()
        .describe(
          'Optional conversation context with details of work done so far. Include: 1) Summary of what the user has been working on, 2) For any files modified, provide git diff format showing the changes, 3) Textual explanation of what was changed and why. Example: "The user has been working on authentication. Files modified: src/auth.ts - Added token support: ```diff\\n- function login(user) {\\n+ function login(user, token) {\\n```\\nThis change adds token-based auth for better security."'
        )
    },
    handler: async (args: NeoTaskLauncherArgs) => {
      const token = process.env.PULUMI_ACCESS_TOKEN;

      if (!token) {
        return {
          description: 'Missing PULUMI_ACCESS_TOKEN',
          content: [
            {
              type: 'text' as const,
              text: 'PULUMI_ACCESS_TOKEN environment variable is not set. Please set it to use the Neo task launcher.'
            }
          ]
        };
      }

      if (!args.query || args.query.trim() === '') {
        return {
          description: 'Missing query parameter',
          content: [
            {
              type: 'text' as const,
              text: 'The query parameter is required and cannot be empty. Please provide what you want Neo to do.'
            }
          ]
        };
      }

      const requestContent =
        args.context && args.context.trim() !== ''
          ? `Conversation context:

${args.context}

User request:

${args.query}`
          : args.query;

      try {
        let messages: string[];
        let taskId: string;
        let isFollowUp = false;

        if (activeTaskId) {
          // This is a follow-up message to an existing task
          taskId = activeTaskId;
          isFollowUp = true;
          messages = await sendFollowUpMessage(taskId, token, requestContent);
        } else {
          // Create a new task
          const response = await fetch('https://api.pulumi.com/api/preview/agents/pulumi/tasks', {
            method: 'POST',
            headers: {
              Authorization: `token ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              content: requestContent
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            return {
              description: 'API request failed',
              content: [
                {
                  type: 'text' as const,
                  text: `Failed to launch Neo task. Status: ${response.status}, Error: ${errorText}`
                }
              ]
            };
          }

          const result = await response.json();
          taskId = result.taskId;
          activeTaskId = taskId; // Store for future follow-ups

          // Poll for task completion
          messages = await pollTaskEvents(taskId, token);
        }

        const content = [
          {
            type: 'text' as const,
            text: isFollowUp
              ? `Follow-up message sent to Neo task ${taskId}\n\nNeo's response:`
              : `Neo task launched at https://app.pulumi.com/pulumi/neo/tasks/${taskId}\n\nNeo's response:`
          }
        ];

        // Add each message as a separate content block
        messages.forEach((message) => {
          content.push({
            type: 'text' as const,
            text: message
          });
        });

        return {
          description: isFollowUp 
            ? 'Neo follow-up completed successfully' 
            : 'Neo task completed successfully',
          content: content
        };
      } catch (error) {
        return {
          description: 'Network error',
          content: [
            {
              type: 'text' as const,
              text: `Failed to ${activeTaskId ? 'send follow-up to' : 'launch'} Neo task due to network error: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          ]
        };
      }
    }
  },
  'neo-reset-conversation': {
    description: 'Reset the active Neo conversation to start fresh',
    schema: {},
    handler: async () => {
      activeTaskId = null;
      seenMessageIds.clear(); // Clear seen messages when resetting
      return {
        description: 'Neo conversation reset',
        content: [
          {
            type: 'text' as const,
            text: 'Neo conversation has been reset. The next "Ask Neo" request will start a new task.'
          }
        ]
      };
    }
  }
};
