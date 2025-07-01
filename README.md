# Pulumi MCP Server

<a href="https://glama.ai/mcp/servers/@pulumi/mcp-server">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@pulumi/mcp-server/badge" />
</a>

> **Note:** This MCP server is currently under active development. Its API (including available commands and their arguments) is experimental and may introduce breaking changes without notice. Please file an issue on [GitHub](https://github.com/pulumi/mcp-server/issues) if you encounter bugs or need support for additional Pulumi commands.

A server implementing the [Model Context Protocol](https://modelcontextprotocol.io) (MCP) for interacting with Pulumi CLI using the Pulumi Automation API and Pulumi Cloud API.

This package allows MCP clients to perform Pulumi operations like retrieving package information, previewing changes, deploying updates, and retrieving stack outputs programmatically without needing the Pulumi CLI installed directly in the client environment.

## Usage

The Pulumi CLI has to be installed on you machine.

This package is primarily intended to be integrated into applications that can use MCP servers as AI tools.

### Claude Code

For [Claude Code](https://claude.ai/code), you can install this MCP server using:

```bash
claude mcp add -s user pulumi -- npx @pulumi/mcp-server@latest stdio
```

### Claude Desktop

For Claude Desktop, you can include Pulumi MCP Server in the MCP configuration file:

```json
{
  "mcpServers": {
    "pulumi": {
      "command": "npx",
      "args": ["@pulumi/mcp-server@latest","stdio"]
    }
  }
}
```

Or if you prefer HTTP with Server-Sent Events (SSE) instead of `stdio`:

```json
{
  "mcpServers": {
    "pulumi": {
      "command": "npx",
      "args": ["@pulumi/mcp-server@latest","sse"]
    }
  }
}
```

## Docker Container

You can also run the Pulumi MCP Server as a Docker container. This approach eliminates the need to install Node.js and the package dependencies directly on your host machine.

### Building the Container

To build the container:

```bash
docker build -t pulumi/mcp-server:latest .
```

### Using with MCP Clients

To use the containerized server with MCP clients, you'll need to configure the client to use the Docker container. For example, in Claude desktop's MCP configuration:

```json
{
  "mcpServers": {
    "pulumi": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "pulumi/mcp-server:latest", "stdio"]
    }
  }
}
```

### Using with MCP Clients over HTTP (SSE)

To use the containerized server with MCP clients over HTTP (SSE), you can run the container with the following command:

```json
{
  "mcpServers": {
    "pulumi": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-p", "3000:3000", "pulumi/mcp-server:latest", "sse"]
    }
  }
}
```



For Pulumi operations that require access to local Pulumi projects, you'll need to mount the appropriate directories. For example, if your Pulumi project is in `~/projects/my-pulumi-app`:

```json
{
  "mcpServers": {
    "pulumi": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-v", "~/projects/my-pulumi-app:/app/project", "pulumi/mcp-server:latest"]
    }
  }
}
```

Then when using the MCP tools, you would reference the project directory as `/app/project` in your requests.

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
*   **`get-resource`**: Returns information about a specific Pulumi Registry resource, including its inputs and outputs.
    *   `provider` (string, required): The cloud provider (e.g., 'aws', 'azure', 'gcp', 'random') or `github.com/org/repo` for Git-hosted components.
    *   `module` (string, optional): The module to query (e.g., 's3', 'ec2', 'lambda').
    *   `resource` (string, required): The resource type name (e.g., 'Bucket', 'Function', 'Instance').
*   **`list-resources`**: Lists available resources within a Pulumi provider package, optionally filtered by module.
    *   `provider` (string, required): The cloud provider (e.g., 'aws', 'azure', 'gcp', 'random') or `github.com/org/repo` for Git-hosted components.
    *   `module` (string, optional): The module to filter by (e.g., 's3', 'ec2', 'lambda').
*   **`deploy-to-aws`**: Deploy application code to AWS by generating Pulumi infrastructure. Automatically provisions AWS resources (S3, Lambda, EC2, etc.) based on application type.
    *   No parameters required - the tool analyzes the current working directory to understand the application structure and generate appropriate infrastructure code.

## Available Prompts

The server also provides prompts that can be used by MCP clients:

*   **`deploy-to-aws`**: AWS deployment guidance prompt that provides comprehensive instructions for analyzing application code and generating Pulumi infrastructure-as-code for AWS deployments. Includes best practices for security, cost optimization, and multi-environment setups.

## Development

1.  Clone the repository.
2.  Install dependencies: `make ensure`
3.  Build the project: `make build`
4.  Test the project: `make test`

### Local Testing

For local testing using Claude Code, you can use the provided scripts:

```bash
# Build the project
npm run build

# Install the MCP server locally for testing
./scripts/install-mcp.sh

# Or install from a packed .tgz file (created with npm pack)
npm pack
./scripts/install-mcp.sh pulumi-mcp-server-0.1.2.tgz

# Remove the local installation
./scripts/uninstall-mcp.sh
```

The install script will remove any existing `pulumi-mcp-local` installation and install the current version from your local directory. Optionally, you can provide a `.tgz` file created with `npm pack` to test the packaged version. Run Claude Code and type the `/mcp` command to see it.

### List existing tools

Use MCP Inspector to list the existing tools and their metadata:

```bash
npm run inspector -- --method tools/list
```

Use MCP Inspector to list the existing prompts and their metadata:

```bash
npm run inspector -- --method prompts/list
```

## License

This project is licensed under the Apache-2.0 License. See the [LICENSE](LICENSE) file for details.
