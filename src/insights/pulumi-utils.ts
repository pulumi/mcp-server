/**
 * Shared utilities for Pulumi operations
 */

type TextContent = {
  type: 'text';
  text: string;
};

/**
 * Creates a standardized MCP response with JSON content
 */
export function createMcpJsonResponse(
  description: string,
  data: unknown
): {
  description: string;
  content: TextContent[];
} {
  return {
    description,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}

export async function getDefaultOrg(): Promise<string> {
  try {
    // Use execFileSync for security - avoids shell interpretation
    const { execFileSync } = await import('child_process');

    const stdout = execFileSync('pulumi', ['org', 'get-default'], { encoding: 'utf8' });
    const defaultOrg = stdout.trim();

    if (!defaultOrg) {
      throw new Error('No default organization set');
    }

    return defaultOrg;
  } catch (error) {
    throw new Error(
      `Could not determine Pulumi default organization. Please specify 'org' parameter. Error: ${error}`
    );
  }
}
