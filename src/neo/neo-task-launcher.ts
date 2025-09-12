import { z } from 'zod';
import * as fs from 'node:fs';

type NeoTaskLauncherArgs = {
  query: string;
  context?: string;
};

interface NeoEvent {
  type: string;
  id: string;
  eventBody?: {
    type?: string;
    timestamp?: string;
    content?: string;
    is_final?: boolean;
    // Approval request fields
    id?: string; // Approval request ID (different from event ID)
    message?: string;
    buttons?: string[];
    approval_type?: string;
    source?: string;
    context?: {
      tool_call_id?: string;
      tool_name?: string;
    };
  };
}

// Global storage for the active Neo task ID to enable follow-up conversations
let activeTaskId: string | null = null;
// Timestamp watermark to filter out old messages (ISO string format)
let messageWatermark: string | null = null;
// Pending approval request ID
let pendingApprovalId: string | null = null;

function debugLog(message: string) {
  const logFile = process.env.MCP_LOG_FILE;
  if (!logFile) {
    return;
  }

  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync(logFile, logMessage);
  } catch {
    // Silently ignore logging errors
  }
}

function isRelevantMessage(event: unknown): event is NeoEvent {
  if (
    !event ||
    typeof event !== 'object' ||
    event === null ||
    !('type' in event) ||
    typeof (event as Record<string, unknown>).type !== 'string' ||
    !('id' in event) ||
    typeof (event as Record<string, unknown>).id !== 'string' ||
    (event as Record<string, unknown>).type !== 'agentResponse' ||
    !('eventBody' in event) ||
    !(event as Record<string, unknown>).eventBody ||
    typeof (event as Record<string, unknown>).eventBody !== 'object' ||
    (event as Record<string, unknown>).eventBody === null ||
    !('type' in ((event as Record<string, unknown>).eventBody as Record<string, unknown>)) ||
    !('timestamp' in ((event as Record<string, unknown>).eventBody as Record<string, unknown>)) ||
    typeof ((event as Record<string, unknown>).eventBody as Record<string, unknown>).timestamp !==
      'string'
  ) {
    return false;
  }

  const eventBodyType = ((event as Record<string, unknown>).eventBody as Record<string, unknown>)
    .type;

  // Accept both assistant messages and approval requests
  return eventBodyType === 'assistant_message' || eventBodyType === 'user_approval_request';
}

async function pollTaskEvents(taskId: string, token: string): Promise<string[]> {
  debugLog(`Starting pollTaskEvents for task ${taskId}`);
  const startTime = Date.now();
  const maxTimeout = 5 * 60 * 1000; // 5 minutes

  while (Date.now() - startTime < maxTimeout) {
    try {
      const response = await fetch(
        `https://api.pulumi.com/api/preview/agents/pulumi/tasks/${taskId}/events?pageSize=100`,
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

      // Filter out all old messages first
      const newMessages: NeoEvent[] =
        data.events?.filter((event: unknown): event is NeoEvent => {
          if (!isRelevantMessage(event)) return false;
          const eventTimestamp = event.eventBody!.timestamp!;
          return !messageWatermark || eventTimestamp > messageWatermark;
        }) || [];

      debugLog(`Found ${newMessages.length} new messages with watermark: ${messageWatermark}`);

      // Find the final message or approval request (if any) in one pass
      const finalMessage = newMessages.find(
        (event) =>
          event.eventBody?.is_final === true || event.eventBody?.type === 'user_approval_request'
      );

      // If final found or approval request, return all new messages and update watermark
      if (finalMessage) {
        const messages: string[] = [];

        // Process regular messages
        newMessages.forEach((event) => {
          if (event.eventBody?.content) {
            messages.push(event.eventBody.content);
          }
        });

        // Check for approval request
        const approvalRequest = newMessages.find(
          (event) => event.eventBody?.type === 'user_approval_request'
        );

        if (approvalRequest && approvalRequest.eventBody?.message) {
          // Store the approval ID from the eventBody (not the event ID)
          pendingApprovalId = approvalRequest.eventBody.id || null;
          debugLog(`Stored pending approval ID: ${pendingApprovalId}`);

          // Format approval message for user
          let approvalMessage = approvalRequest.eventBody.message;

          approvalMessage += '\n\nNeo is waiting for your approval.';

          messages.push(approvalMessage);
        }

        // Log details for debugging
        newMessages.forEach((event) => {
          const eventId = event.id;
          const eventTimestamp = event.eventBody?.timestamp;
          const isFinal = event.eventBody?.is_final;
          const isApproval = event.eventBody?.type === 'user_approval_request';
          const hasContent = !!event.eventBody?.content;
          debugLog(
            `Event ${eventId}, timestamp: ${eventTimestamp}, isFinal: ${isFinal}, isApproval: ${isApproval}, hasContent: ${hasContent}`
          );
        });

        // Update watermark to final message timestamp
        messageWatermark = finalMessage.eventBody?.timestamp || null;
        debugLog(`Updated watermark to: ${messageWatermark}`);
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

async function sendApproval(
  taskId: string,
  token: string,
  approvalId: string,
  approved: boolean
): Promise<void> {
  try {
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
            type: 'user_confirmation',
            timestamp: new Date().toISOString(),
            approval_request_id: approvalId,
            ok: approved
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Approval API returned status ${response.status}: ${errorText}`);
    }

    debugLog(`Sent approval response: ${approved} for request ${approvalId}`);
  } catch (error) {
    throw new Error(
      `Error sending approval: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
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

      // If there's a pending approval and user wants to approve
      if (pendingApprovalId && activeTaskId) {
        debugLog(`User approved with: "${args.query}"`);

        try {
          // Set watermark to current time before sending approval
          const approvalTime = new Date().toISOString();
          messageWatermark = approvalTime;
          debugLog(`Set watermark to ${messageWatermark} before sending approval`);

          await sendApproval(activeTaskId, token, pendingApprovalId, true);

          // Clear the approval ID since it's been processed
          const approvedId = pendingApprovalId;
          pendingApprovalId = null;
          debugLog(`Cleared pending approval ID ${approvedId} after user approval`);

          // Continue polling for Neo's response after approval
          const messages = await pollTaskEvents(activeTaskId, token);

          const content = [
            {
              type: 'text' as const,
              text: `Approval sent to Neo task ${activeTaskId}\n\nNeo's response:`
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
            description: 'Approval sent and Neo response received',
            content: content
          };
        } catch (error) {
          return {
            description: 'Approval failed',
            content: [
              {
                type: 'text' as const,
                text: `Failed to send approval: ${error instanceof Error ? error.message : 'Unknown error'}`
              }
            ]
          };
        }
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
      pendingApprovalId = null; // Clear pending approval when resetting
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
