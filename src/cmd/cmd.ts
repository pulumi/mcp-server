import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { connectSSETransport, connectStdioTransport } from '../server/transport.js';

export const cmd = () => {
  const exe = yargs(hideBin(process.argv));

  exe.command(
    'stdio',
    'Start Pulumi MCP server using stdio transport.',
    () => {},
    () => connectStdioTransport()
  );

  exe.command(
    'sse',
    'Start Pulumi MCP server using SSE transport.',
    (yargs) => {
      return yargs.option('port', {
        type: 'number',
        default: 3000
      });
    },
    ({ port }) => connectSSETransport(port)
  );

  exe.demandCommand().parseSync();
};
