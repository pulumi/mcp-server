import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';

type NeoTaskLauncherArgs = {
  query: string;
  context?: string;
};

// Global storage for the active Neo task ID to enable follow-up conversations
let activeTaskId: string | null = null;
// Timestamp watermark to filter out old messages (ISO string format)
let messageWatermark: string | null = null;

function debugLog(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync(path.join(process.env.HOME || '~', 'test/mcp.log'), logMessage);
  } catch {
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

      // Check if we found a NEW final message (newer than our watermark)
      let foundNewFinalMessage = false;
      if (data.events) {
        for (const event of data.events) {
          if (event.type === 'agentResponse' && event.eventBody?.type === 'assistant_message') {
            const eventTimestamp = event.eventBody.timestamp;
            const isNewMessage =
              !messageWatermark || (eventTimestamp && eventTimestamp > messageWatermark);

            if (event.eventBody.is_final === true && isNewMessage) {
              foundNewFinalMessage = true;
              break;
            }
          }
        }
      }

      // If we found a new final message, collect all new messages since watermark and return
      if (foundNewFinalMessage) {
        const messages: string[] = [];
        debugLog(`Found final message, processing events with watermark: ${messageWatermark}`);
        for (const event of data.events) {
          if (event.type === 'agentResponse' && event.eventBody?.type === 'assistant_message') {
            const eventId = event.id;
            const content = event.eventBody.content;
            const eventTimestamp = event.eventBody.timestamp;
            const isFinal = event.eventBody.is_final;

            // Check if this message is newer than our watermark
            const isNewMessage =
              !messageWatermark || (eventTimestamp && eventTimestamp > messageWatermark);

            debugLog(
              `Event ${eventId}, timestamp: ${eventTimestamp}, isFinal: ${isFinal}, isNewMessage: ${isNewMessage}, hasContent: ${!!content}`
            );

            if (content && eventId && isNewMessage) {
              debugLog(`Adding message ${eventId} to result`);
              messages.push(content);
            } else if (content && eventId) {
              debugLog(`Skipping message ${eventId} - older than watermark`);
            }
          }
        }

        // Update watermark to the latest timestamp of messages we're returning
        let latestReturnedTimestamp = messageWatermark;
        for (const event of data.events) {
          if (event.type === 'agentResponse' && event.eventBody?.type === 'assistant_message') {
            const eventTimestamp = event.eventBody.timestamp;
            const isNewMessage =
              !messageWatermark || (eventTimestamp && eventTimestamp > messageWatermark);

            if (
              isNewMessage &&
              eventTimestamp &&
              (!latestReturnedTimestamp || eventTimestamp > latestReturnedTimestamp)
            ) {
              latestReturnedTimestamp = eventTimestamp;
            }
          }
        }

        if (latestReturnedTimestamp && latestReturnedTimestamp !== messageWatermark) {
          messageWatermark = latestReturnedTimestamp;
          debugLog(`Updated watermark to: ${messageWatermark}`);
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

async function sendFollowUpMessage(
  taskId: string,
  token: string,
  message: string
): Promise<string[]> {
  try {
    // Set watermark to current time before sending follow-up
    // This ensures we only get messages that come after this point
    const followUpTime = new Date().toISOString();
    messageWatermark = followUpTime;
    debugLog(`Set watermark to ${messageWatermark} before sending follow-up`);

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
            timestamp: followUpTime
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

    debugLog(`Follow-up message sent, polling for responses newer than ${messageWatermark}`);

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
      messageWatermark = null; // Clear watermark when resetting
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
