/**
 * One McpServer per HTTP request (revision 2026-07-28 is stateless); every request shares
 * the task registry. The SDK has no tasks helper, so the extension is wired here by hand.
 */
import { McpServer, ProtocolError, ProtocolErrorCode } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  type Job,
  type Task,
  type TaskRegistry,
  type ToolResult,
  TooManyTasksError,
} from './tasks.js';
import { slowEcho } from './tools/slowEcho.js';

export const TASKS_EXTENSION = 'io.modelcontextprotocol/tasks';
export const SERVER_NAME = 'passwerk-hosted';
export const SERVER_VERSION = '0.0.0';

export interface ServerDeps {
  registry: TaskRegistry;
  /** Length of one slow_echo "second". Tests shorten it. */
  tickMs: number;
}

/** A tool whose work runs as a task when the client allows it, inline otherwise. */
export interface TaskTool<S extends z.ZodType> {
  name: string;
  description: string;
  inputSchema: S;
  job(input: z.infer<S>, deps: ServerDeps): Job;
}

const TaskIdParams = z.object({ taskId: z.string().max(128) });

const CLIENT_CAPABILITIES = 'io.modelcontextprotocol/clientCapabilities';

/** The request `_meta` envelope is untyped in the SDK; read only the one flag we need. */
function clientAllowsTasks(envelope: unknown): boolean {
  const parsed = z
    .object({
      [CLIENT_CAPABILITIES]: z.object({ extensions: z.record(z.string(), z.unknown()).optional() }),
    })
    .safeParse(envelope);
  return (
    parsed.success && parsed.data[CLIENT_CAPABILITIES].extensions?.[TASKS_EXTENSION] !== undefined
  );
}

function wireTask(task: Task) {
  const { tool: _tool, ...wire } = task;
  return wire;
}

function unknownTask(taskId: string): never {
  throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Unknown task: ${taskId}`);
}

function errorResult(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

const TOOLS = [slowEcho];

export function createServer(deps: ServerDeps): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    // `extensions` is valid on the 2026-07-28 wire but missing from the SDK's capability type.
    { capabilities: { tools: {}, extensions: { [TASKS_EXTENSION]: {} } } as never },
  );

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      // Every return is cast: ToolResult and the task answer are valid wire results that the
      // SDK's CallToolResult union cannot express.
      async (input, ctx): Promise<never> => {
        const job = tool.job(input as never, deps);
        if (!clientAllowsTasks(ctx.mcpReq.envelope)) {
          const controller = new AbortController();
          return (await job({ signal: controller.signal, progress: () => {} })) as never;
        }
        try {
          const task = deps.registry.start(tool.name, job);
          // The SDK checks every tools/call result for `content`; the task answer has none.
          return { content: [], resultType: 'task', ...wireTask(task) } as never;
        } catch (e) {
          if (e instanceof TooManyTasksError) return errorResult(e.message) as never;
          throw e;
        }
      },
    );
  }

  server.server.setRequestHandler('tasks/get', { params: TaskIdParams }, async ({ taskId }) => {
    const task = deps.registry.get(taskId) ?? unknownTask(taskId);
    return { resultType: 'complete', ...wireTask(task) } as never;
  });

  server.server.setRequestHandler('tasks/cancel', { params: TaskIdParams }, async ({ taskId }) => {
    const task = deps.registry.cancel(taskId) ?? unknownTask(taskId);
    return { resultType: 'complete', ...wireTask(task) } as never;
  });

  return server;
}
