import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { connectStdioTransport } from '../server/stdio/transport.js';
import { startMcpHttpServer } from '../server/http/httpServer.js';

export const cmd = () => {
  const exe = yargs(hideBin(process.argv));

  exe.command(
    'stdio',
    'Start Pulumi MCP server using stdio transport.',
    () => {},
    () => connectStdioTransport()
  );

  exe.command(
    'http',
    'Start Pulumi MCP server using Streaming HTTP transport.',
    (yargs) => {
      return yargs.option('port', {
        type: 'number',
        default: 3000
      });
    },
    ({ port }) => {
      try {
        startMcpHttpServer(port);
      } catch (error) {
        console.error('Failed to start HTTP server:', error);
        process.exit(1);
      }
    }
  );

  exe.demandCommand().parseSync();
};
