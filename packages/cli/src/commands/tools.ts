import { type AnyToolDefinition, TOOLS } from '@passwerk/server';
import { printJson } from '../format.js';
import { registerCommand } from '../program.js';

export interface ToolListing {
  name: string;
  title: string;
  description: string;
  inputKeys: string[];
  annotations: AnyToolDefinition['annotations'];
}

/** What an MCP host sees, minus the JSON schemas: the wrapper adds `lang` to every tool. */
export function toolListing(): ToolListing[] {
  return TOOLS.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputKeys: [...Object.keys(t.inputSchema), 'lang'],
    annotations: t.annotations,
  }));
}

registerCommand((program, io, exit) => {
  program
    .command('tools')
    .description('list the MCP tools of @passwerk/server (the same registry the CLI runs)')
    .option('--json', 'print the listing as canonical JSON')
    .action((options: { json?: boolean }) => {
      const listing = toolListing();
      if (options.json) {
        printJson(io, listing);
      } else {
        const lines = listing.flatMap((t) => [
          `${t.name} (${t.title})${t.annotations.readOnlyHint ? '' : ' [writes]'}`,
          `  input: ${t.inputKeys.join(', ')}`,
          `  ${t.description}`,
          '',
        ]);
        io.stdout.write(`${lines.join('\n')}`);
      }
      exit(0);
    });
});
