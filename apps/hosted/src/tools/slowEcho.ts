import { z } from 'zod';
import type { TaskTool } from '../server.js';
import type { Job, ToolResult } from '../tasks.js';

const Input = z.object({
  text: z.string().max(500),
  seconds: z.number().int().min(1).max(120).default(5),
});

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

const echo =
  ({ text, seconds }: z.infer<typeof Input>, { tickMs }: { tickMs: number }): Job<ToolResult> =>
  async ({ signal, progress }) => {
    for (let s = 1; s <= seconds; s++) {
      progress(`${s} of ${seconds} s`);
      await sleep(tickMs, signal);
    }
    return { content: [{ type: 'text', text }] };
  };

/** Spike tool: proves a call travels as a task. Waits, then echoes the text. */
export const slowEcho: TaskTool<typeof Input> = {
  name: 'slow_echo',
  description:
    'Wait the given number of seconds (1 to 120), then return the text. Runs as an MCP task.',
  inputSchema: Input,
  job: echo,
  inline: echo,
};
