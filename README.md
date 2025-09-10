# Pulumi MCP Server

<a href="https://glama.ai/mcp/servers/@pulumi/mcp-server">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@pulumi/mcp-server/badge" />
</a>

The Pulumi Model Context Protocol Server enables advaced Infrastructure as Code development capabilities for connected agents.

## Features

### Available Tools

| Tool | Description |
|------|-------------|
| `pulumi-registry-list-resources` | Browse available cloud resources to discover what infrastructure components can be deployed |
| `pulumi-registry-list-functions` | Explore available provider functions for interacting with cloud resources |
| `pulumi-registry-get-resource` | Get code examples and documentation for specific resources that can be deployed |
| `pulumi-registry-get-function` | Access examples of provider functions for usage in your Pulumi program |
| `pulumi-registry-get-type` | Get schema definitions needed to properly set up complex resource properties and types |
| `pulumi-cli-preview` | Preview infrastructure changes before deployment, showing what resources will be created, updated, or deleted |
| `pulumi-cli-up` | Deploy infrastructure changes to the cloud, creating and updating resources as defined in your Pulumi program |
| `pulumi-cli-stack-output` | Retrieve deployment outputs like URLs and resource IDs from your infrastructure stacks |
| `pulumi-cli-refresh` | Sync your Pulumi state with actual cloud resources to detect drift and manual changes |
| `pulumi-resource-search` | Discover, count, and analyze your deployed infrastructure across all cloud providers. |

### Available Prompts

| Prompt | Description |
|--------|-------------|
| `deploy-to-aws` | Get step-by-step guidance for deploying already written applications to the cloud with Pulumi, including security and cost optimization tips |

## Installation

### Requirements

1. **[Pulumi CLI](https://www.pulumi.com/docs/cli/)** must be installed on the client machine
2. **[Docker](https://www.docker.com/)** (optional) - Required only for containerized deployment

### Usage with Claude Code

For [Claude Code](https://claude.ai/code), install the MCP server using:

```bash
claude mcp add -s user pulumi -- npx @pulumi/mcp-server@latest stdio
```

### Usage with Claude Desktop

For Claude Desktop, add the following configuration to your MCP config file:

```json
{
  "mcpServers": {
    "pulumi": {
      "command": "npx",
      "args": ["@pulumi/mcp-server@latest", "stdio"]
    }
  }
}
```

### Usage with VSCode

Create a file called `.vscode/mcp.json` in your workspace. Add the following section, and the MCP will become accessible to your assistant:

```json
{
  "servers": {
    "pulumi": {
      "command": "npx",
      "args": ["@pulumi/mcp-server@latest", "stdio"]
    }
  }
}
```

Alternatively, you can add the following to your user configuration and be able to use the MCP server everywhere. You can open the configuration by pressing `Ctrl + Shift + P` and typing `Preferences: Open User Settings (JSON)`:

```json
{
  "mcp": {
    "servers": {
      "pulumi": {
        "command": "npx",
        "args": ["@pulumi/mcp-server@latest", "stdio"]
      }
    }
  }
}
```

### Devin

For [Devin](https://app.devin.ai), you can set up the Pulumi MCP Server by:

1. Navigating to https://app.devin.ai/settings/mcp-marketplace/setup/pulumi
2. Providing your Pulumi access token, which can be obtained from the Access tokens section in the sidebar of the Pulumi dashboard
3. Clicking "Enable"

More about using the MCP server with other popular clients: [Pulumi MCP Server Documentation](https://www.pulumi.com/docs/iac/using-pulumi/mcp-server/).

## Docker Installation

The Pulumi MCP Server can additionally be run as a Docker container, eliminating the need to install Node.js and package dependencies directly on your host machine.

### Using the Official Image

Pull the official image built by Docker:

```bash
docker pull mcp/pulumi:latest
```

### Building Locally

Or build the container with local changes:

```bash
docker build -t pulumi/mcp-server:latest .
```

### Usage With Agents

**STDIO Mode**

Run the server in basic STDIO configuration:

```json
{
  "mcpServers": {
    "pulumi": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "PULUMI_ACCESS_TOKEN=your-access-token",
        "mcp/pulumi:latest", "stdio"
      ]
    }
  }
}
```

**With Local Project Access**

For Pulumi CLI operations that require access to local projects and their files, mount the project directory:

```json
{
  "mcpServers": {
    "pulumi": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-v", "~/projects/my-pulumi-app:/app/project",
        "-e", "PULUMI_ACCESS_TOKEN=your-access-token",
        "mcp/pulumi:latest", "stdio"
      ]
    }
  }
}
```

### Using with MCP Clients over HTTP

The Pulumi MCP server supports HTTP transport for web-based integrations. Since most MCP clients expect STDIO communication, you can use a transport bridge like [supergateway](https://github.com/supercorp-ai/supergateway) to connect STDIO-based clients to HTTP servers.

#### Quick Start Script

Use the provided script to build and run the HTTP server:

```bash
./scripts/docker-run-http.sh
```

This script builds the Docker image and starts the container in HTTP mode on port 3000.

#### Bridge Configuration for Claude Desktop

To connect Claude Desktop (which uses STDIO) to the HTTP server, copy the following configuration:

```json
{
  "mcpServers": {
    "pulumi": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "supercorp/supergateway",
        "--streamableHttp",
        "http://host.docker.internal:3000/mcp"
      ]
    }
  }
}
```

This configuration:
- Runs the MCP bridge in a Docker container
- Connects to your HTTP server using `host.docker.internal` (Docker's host machine reference)
- Bridges STDIO ↔ HTTP communication
- Handles session management automatically

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PULUMI_ACCESS_TOKEN` | Pulumi Cloud access token | `""` | For resource deployment & insights |

> **Notes:** 
> - When mounting local directories, reference the project as `/app/project` in your MCP tool requests
> - Mount `~/.pulumi` to preserve Pulumi CLI configuration and credentials
> - Add cloud provider credential volumes and environment variables as needed for your deployments

## Development

### Requirements
- Node.js and npm
- Pulumi CLI

### Build Commands

| Command | Description |
|---------|-------------|
| `make ensure` | Install dependencies |
| `make build` | Build the project |
| `make test` | Run all tests |
| `npm run build` | Build using npm |
| `npm run lint:fix` | Find and fix lint errors |

### Quick Start

1. Clone the repository
2. Install dependencies: `make ensure`
3. Build the project: `make build`
4. Test the project: `make test`

### How to Install Locally

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

For other MCP clients like Claude Desktop or Windsurf, you can manually configure the local server:

```json
{
  "mcpServers": {
    "pulumi-mcp-local": {
      "command": "node",
      "args": ["/path/to/your/mcp-server/dist/index.js", "stdio"]
    }
  }
}
```

Replace `/path/to/your/mcp-server` with the absolute path to your local repository directory.

### List existing tools

Use MCP Inspector to list the capabilities:

```bash
# List tools and their metadata
npm run inspector -- --method tools/list

# List prompts and their metadata
npm run inspector -- --method prompts/list
```

> **Note:** This MCP server is actively evolving with new features being added regularly. While we strive to maintain compatibility, some API changes may occur as we improve it. Please file an issue on [GitHub](https://github.com/pulumi/mcp-server/issues) if you encounter bugs or would like to request support for additional Pulumi commands.

## License

This project is licensed under the Apache-2.0 License. See the [LICENSE](LICENSE) file for details.
