# @pulumi/mcp-server

A server implementing the [Model Context Protocol](https://modelcontextprotocol.io) (MCP) for interacting with Pulumi CLI using the Pulumi Automation API and Pulumi Cloud API.

This package allows MCP clients to perform Pulumi operations like retrieving package information, previewing changes, deploying updates, and retrieving stack outputs programmatically without needing the Pulumi CLI installed directly in the client environment.

## Usage

The Pulumi CLI has to be installed on you machine.

This package is primarily intended to be integrated into applications that can use MCP servers as AI tools. For example, here is how you can include Pulumi MCP Server in Claude desktop's MCP configuration file:

```json
{
  "mcpServers": {
    "pulumi": {
      "command": "npx",
      "args": ["@pulumi/mcp-server"]
    }
  }
}
```

## Available Commands

The server exposes handlers for the following Pulumi operations, callable via MCP requests:

*   **`preview`**: Runs `pulumi preview` on a specified stack.
    *   `workDir` (string, required): The working directory containing the `Pulumi.yaml` project file.
    *   `stackName` (string, optional): The stack name to operate on (defaults to 'dev').
*   **`up`**: Runs `pulumi up` to deploy changes for a specified stack.
    *   `workDir` (string, required): The working directory containing the `Pulumi.yaml` project file.
    *   `stackName` (string, optional): The stack name to operate on (defaults to 'dev').
*   **`stack-output`**: Retrieves outputs from a specified stack after a successful deployment.
    *   `workDir` (string, required): The working directory containing the `Pulumi.yaml` project file.
    *   `stackName` (string, optional): The stack name to retrieve outputs from (defaults to 'dev').
    *   `outputName` (string, optional): The specific stack output name to retrieve. If omitted, all outputs for the stack are returned.
*   **`getResource`**: Returns information about a specific Pulumi Registry resource, including its inputs and outputs.
    *   `provider` (string, required): The cloud provider (e.g., 'aws', 'azure', 'gcp', 'random') or `github.com/org/repo` for Git-hosted components.
    *   `module` (string, optional): The module to query (e.g., 's3', 'ec2', 'lambda').
    *   `resource` (string, required): The resource type name (e.g., 'Bucket', 'Function', 'Instance').
*   **`listResources`**: Lists available resources within a Pulumi provider package, optionally filtered by module.
    *   `provider` (string, required): The cloud provider (e.g., 'aws', 'azure', 'gcp', 'random') or `github.com/org/repo` for Git-hosted components.
    *   `module` (string, optional): The module to filter by (e.g., 's3', 'ec2', 'lambda').

## Development

1.  Clone the repository.
2.  Install dependencies: `npm install`
3.  Build the project: `npm run build`

## License

This project is licensed under the Apache-2.0 License. See the [LICENSE](LICENSE) file for details. 