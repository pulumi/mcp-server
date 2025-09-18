import { z } from 'zod';
import * as fs from 'node:fs';

type NeoTaskLauncherArgs = {
  query: string;
  context?: string;
  taskId?: string;
};

// Task state type
interface TaskState {
  lastShownSeq: number;
  pendingApprovalId: string | null;
}

// Global dictionary mapping taskId to task state
const taskStateMap = new Map<string, TaskState>();

function getTaskState(taskId: string): TaskState {
  if (!taskStateMap.has(taskId)) {
    taskStateMap.set(taskId, {
      lastShownSeq: 0,
      pendingApprovalId: null
    });
  }
  return taskStateMap.get(taskId)!;
}

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
// Pending approval request ID
let pendingApprovalId: string | null = null;
// Global watermark tracking the last message shown to user
let lastShownSeq: number = 0;

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

async function pollTaskEvents(
  taskId: string,
  token: string,
  sinceSeq: number
): Promise<{
  messages: string[];
  hasMore: boolean;
}> {
  debugLog(`Starting pollTaskEvents for task ${taskId} with sinceSeq: ${sinceSeq}`);
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

      // Get all relevant messages
      const allMessages: NeoEvent[] =
        data.events?.filter((event: unknown): event is NeoEvent => {
          return isRelevantMessage(event);
        }) || [];

      // Sort by timestamp to ensure consistent ordering
      allMessages.sort((a, b) => {
        const timeA = a.eventBody?.timestamp || '';
        const timeB = b.eventBody?.timestamp || '';
        return timeA.localeCompare(timeB);
      });

      // Find new messages since the given sequence number
      const newMessages = allMessages.slice(sinceSeq);

      debugLog(
        `Total messages: ${allMessages.length}, since seq ${sinceSeq}: ${newMessages.length}`
      );

      // If we have ANY new messages, return them immediately
      if (newMessages.length > 0) {
        const messages: string[] = [];

        // Process messages with content (assistant messages and other relevant content)
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
          // Store the approval ID in task state
          const taskState = getTaskState(taskId);
          taskState.pendingApprovalId = approvalRequest.eventBody.id || null;
          debugLog(`Stored pending approval ID: ${taskState.pendingApprovalId}`);

          // Format approval message for user
          let approvalMessage = approvalRequest.eventBody.message;
          approvalMessage += '\n\nNeo is waiting for your approval.';
          messages.push(approvalMessage);
        }

        // Find if there's a final message or approval request
        const hasFinalMessage = newMessages.some(
          (event) =>
            event.eventBody?.is_final === true || event.eventBody?.type === 'user_approval_request'
        );

        // Next sequence is the total count of messages
        const nextSeq = allMessages.length;

        // Log details for debugging
        newMessages.forEach((event, index) => {
          const eventId = event.id;
          const eventTimestamp = event.eventBody?.timestamp;
          const isFinal = event.eventBody?.is_final;
          const isApproval = event.eventBody?.type === 'user_approval_request';
          const hasContent = !!event.eventBody?.content;
          const isAssistantMsg = event.eventBody?.type === 'assistant_message';
          const seqNum = sinceSeq + index;
          debugLog(
            `Event ${seqNum}: ${eventId}, timestamp: ${eventTimestamp}, isFinal: ${isFinal}, isApproval: ${isApproval}, hasContent: ${hasContent}, isAssistant: ${isAssistantMsg}`
          );
        });

        debugLog(`Next seq: ${nextSeq}, has final: ${hasFinalMessage}`);
        debugLog(
          `Returning ${messages.length} messages (${messages.length > 0 ? 'with content' : 'empty, but continuing polling'})`
        );

        if (messages.length > 0) {
          // Update task state watermark when we return messages
          const taskState = getTaskState(taskId);
          taskState.lastShownSeq = nextSeq;
          return {
            messages,
            hasMore: !hasFinalMessage
          };
        }
      }

      // No new messages yet, wait before polling again
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      throw new Error(
        `Error polling task events: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Timeout reached - return timeout message
  debugLog('Task polling timed out after 5 minutes');
  return {
    messages: [
      `⚠️ Polling timed out after 5 minutes. Neo may still be working on your request.\n\nCheck the task status at: https://app.pulumi.com/pulumi/neo/tasks/${taskId}`
    ],
    hasMore: false
  };
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

async function sendFollowUpMessage(taskId: string, token: string, message: string): Promise<void> {
  try {
    // Send follow-up message to existing task
    const followUpTime = new Date().toISOString();
    debugLog(`Sending follow-up message "${message}" to task ${taskId} at ${followUpTime}`);
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
      debugLog(`Follow-up message API response not OK: ${response.status}`);
      if (response.status === 409) {
        throw new Error('Neo is currently busy processing. Please wait and try again.');
      }
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Follow-up API returned status ${response.status}: ${errorText}`);
    }

    debugLog(
      `Follow-up sent to task ${taskId}, polling for response from sequence ${lastShownSeq}`
    );
  } catch (error) {
    throw new Error(
      `Error sending follow-up message: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

async function pollAndFormatResults(activeTaskId: string, token: string, firstMessage: string) {
  debugLog(`Polling task ${activeTaskId}`);

  // Poll for new messages using task state watermark
  const taskState = getTaskState(activeTaskId);
  const result = await pollTaskEvents(activeTaskId, token, taskState.lastShownSeq);

  const content = result.messages.map((message) => ({
    type: 'text' as const,
    text: message
  }));

  const response = {
    description: `Neo task poll - ${result.messages.length} new messages`,
    content: [{ type: 'text' as const, text: firstMessage }, ...content],
    has_more: result.hasMore
  };
  debugLog(`Returning polling response: ${JSON.stringify(response)}`);
  return response;
}

export const neoBridgeCommands = {
  'neo-bridge': {
    description:
      'Launch and monitor Neo tasks step by step. Pulumi Neo is a purpose-built cloud infrastructure automation agent. ' +
      'If the JSON result has `has_more=true`, call this tool again to read more data. Continue calling until `has_more=false`. If you stop calling the tool, tell the user that the task continues running in Pulumi Console. ' +
      'When displaying messages to the user, try to return the data as-is with minimal summarization. ',
    schema: {
      query: z
        .string()
        .optional()
        .describe(
          'The task query to send to Neo (what the user wants Neo to do). Leave it empty when the tool is called again to read more data.'
        ),
      context: z
        .string()
        .optional()
        .describe(
          'Optional conversation context with details of work done so far. Include: 1) Summary of what the user has been working on, 2) For any files modified, provide git diff format showing the changes, 3) Textual explanation of what was changed and why. Example: "The user has been working on authentication. Files modified: src/auth.ts - Added token support: ```diff\\n- function login(user) {\\n+ function login(user, token) {\\n```\\nThis change adds token-based auth for better security."'
        ),
      taskId: z
        .string()
        .optional()
        .describe(
          'Task ID to continue an existing Neo conversation. Leave empty to start a new task. Use the taskId returned from previous calls.'
        )
    },
    handler: async (args: NeoTaskLauncherArgs) => {
      debugLog(`=== NEO TASK LAUNCHER CALLED ===`);
      debugLog(`Args received: ${JSON.stringify(args)}`);
      debugLog(`Active task ID: ${activeTaskId}`);

      const token = process.env.PULUMI_ACCESS_TOKEN;

      if (!token) {
        return {
          description: 'Missing PULUMI_ACCESS_TOKEN',
          content: [
            {
              type: 'text' as const,
              text: 'PULUMI_ACCESS_TOKEN environment variable is not set. Please set it to use the Neo task launcher.'
            }
          ],
          has_more: false
        };
      }

      try {
        // Check if this is a polling call or new task
        if (args.taskId && (!args.query || args.query.trim() === '')) {
          return pollAndFormatResults(args.taskId, token, `Polling task ${args.taskId}`);
        }

        const requestContent =
          args.context && args.context.trim() !== ''
            ? `Conversation context:

${args.context}

User request:

${args.query}`
            : args.query;

        if (!args.taskId) {
          // Create a new task (first conversation)
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
              ],
              has_more: false
            };
          }

          const result = await response.json();
          const newTaskId = result.taskId;

          debugLog(`Created new task ${newTaskId}`);

          return pollAndFormatResults(
            newTaskId,
            token,
            `Neo task launched at: https://app.pulumi.com/pulumi/neo/tasks/${newTaskId}`
          );
        }

        // Handle pending approval (user responding to approval)
        if (args.taskId) {
          const taskState = getTaskState(args.taskId);
          if (taskState.pendingApprovalId) {
            debugLog(`User approved with: "${args.query}"`);

            // Send approval
            await sendApproval(args.taskId, token, taskState.pendingApprovalId, true);

            // Clear the approval ID since it's been processed
            const approvedId = taskState.pendingApprovalId;
            taskState.pendingApprovalId = null;
            debugLog(`Cleared pending approval ID ${approvedId} after user approval`);

            return pollAndFormatResults(
              args.taskId,
              token,
              `Approval sent to task https://app.pulumi.com/pulumi/neo/tasks/${args.taskId}`
            );
          }
        }

        // Continue existing conversation as follow-up
        if (args.taskId) {
          debugLog(`Sending follow-up to existing task ${args.taskId}: "${args.query}"`);

          await sendFollowUpMessage(args.taskId, token, requestContent);

          return pollAndFormatResults(
            args.taskId,
            token,
            `Sent follow-up message to task https://app.pulumi.com/pulumi/neo/tasks/${args.taskId}`
          );
        }

        // Should not reach here - either taskId should be provided or new task should be created
        throw new Error('Invalid state: no taskId provided and not creating new task');
      } catch (error) {
        return {
          description: 'Network error',
          content: [
            {
              type: 'text' as const,
              text: `Failed to process Neo task: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          ],
          has_more: false
        };
      }
    }
  },
  'neo-reset-conversation': {
    description: 'Reset the Neo conversation for a specific task',
    schema: {
      taskId: z
        .string()
        .optional()
        .describe('Task ID to reset. If not provided, resets all tasks.')
    },
    handler: async (args: { taskId?: string }) => {
      if (args.taskId) {
        // Clear state for specific task
        taskStateMap.delete(args.taskId);
        return {
          description: 'Neo task reset',
          content: [
            {
              type: 'text' as const,
              text: `Neo task ${args.taskId} has been reset.`
            }
          ],
          has_more: false
        };
      } else {
        // Clear all task states
        taskStateMap.clear();
        return {
          description: 'Neo conversation reset',
          content: [
            {
              type: 'text' as const,
              text: 'All Neo task states have been cleared.'
            }
          ],
          has_more: false
        };
      }
    }
  }
};
