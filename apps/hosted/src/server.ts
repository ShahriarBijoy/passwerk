/**
 * One McpServer per HTTP request (revision 2026-07-28 is stateless); every request shares
 * the task registry. The SDK has no tasks helper, so the extension is wired here by hand.
 */
import { McpServer, ProtocolError, ProtocolErrorCode } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { ReadingConfig } from './series/types.js';
import {
  type Job,
  type Task,
  type TaskRegistry,
  type ToolResult,
  TooManyTasksError,
} from './tasks.js';
import { createUpload } from './tools/createUpload.js';
import { runSeries } from './tools/runSeries.js';
import { slowEcho } from './tools/slowEcho.js';
import type { UploadStore } from './uploads.js';

export const TASKS_EXTENSION = 'io.modelcontextprotocol/tasks';
export const SERVER_NAME = 'passwerk-hosted';
export const SERVER_VERSION = '0.0.0';

export interface ServerDeps {
  registry: TaskRegistry;
  /** Length of one slow_echo "second". Tests shorten it. */
  tickMs: number;
  /** Folder holding one subfolder per demo series. */
  seriesDir: string;
  clock: () => Date;
  uploads: UploadStore;
  /** On when a TypeSafe key is set and `PASSWERK_AI_READING` is not `off` (ADR D-048). */
  reading: ReadingConfig;
}

/** What one HTTP request contributes to its server instance. */
export interface RequestScope {
  /** Origin a client of this request reaches the server at, for URLs handed back to it. */
  origin: string;
}

/** A tool whose work runs as a task when the client allows it, inline otherwise. */
export interface TaskTool<S extends z.ZodType> {
  name: string;
  description: string;
  inputSchema: S;
  /** The job of a task, which may ask the client through `input_required`. */
  job(input: z.infer<S>, deps: ServerDeps): Job;
  /** The job of an inline run, which has no way to ask. */
  inline(input: z.infer<S>, deps: ServerDeps): Job<ToolResult>;
}

/** A tool that answers at once with a plain result, task extension or not. */
export interface PlainTool<S extends z.ZodType> {
  name: string;
  description: string;
  inputSchema: S;
  call(input: z.infer<S>, deps: ServerDeps, scope: RequestScope): ToolResult;
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

// Widened so registerTool sees one schema type rather than a union of tool shapes.
const TOOLS: TaskTool<z.ZodObject>[] = [slowEcho, runSeries];
const PLAIN_TOOLS: PlainTool<z.ZodObject>[] = [createUpload];

export function createServer(deps: ServerDeps, scope: RequestScope): McpServer {
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
        try {
          if (!clientAllowsTasks(ctx.mcpReq.envelope)) {
            const job = tool.inline(input as never, deps);
            return (await deps.registry.runInline(job, ctx.mcpReq.signal)) as never;
          }
          const task = deps.registry.start(tool.name, tool.job(input as never, deps));
          // The SDK checks every tools/call result for `content`; the task answer has none.
          return { content: [], resultType: 'task', ...wireTask(task) } as never;
        } catch (e) {
          if (e instanceof TooManyTasksError) return errorResult(e.message) as never;
          throw e;
        }
      },
    );
  }

  for (const tool of PLAIN_TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (input): Promise<never> => tool.call(input as never, deps, scope) as never,
    );
  }

  server.server.setRequestHandler('tasks/get', { params: TaskIdParams }, async ({ taskId }) => {
    const task = deps.registry.get(taskId) ?? unknownTask(taskId);
    return { resultType: 'complete', ...wireTask(task) } as never;
  });

  // The SDK lifts `inputResponses` off the params, as for a multi-round-trip retry, and drops
  // entries that are not bare results. The values stay untrusted: each job parses its own. The
  // extension's UpdateTaskResult is an empty acknowledgement; the client polls tasks/get.
  server.server.setRequestHandler(
    'tasks/update',
    { params: TaskIdParams },
    async ({ taskId }, ctx) => {
      const responses = ctx.mcpReq.inputResponses ?? {};
      if (deps.registry.update(taskId, responses) === undefined) unknownTask(taskId);
      return { resultType: 'complete' } as never;
    },
  );

  server.server.setRequestHandler('tasks/cancel', { params: TaskIdParams }, async ({ taskId }) => {
    const task = deps.registry.cancel(taskId) ?? unknownTask(taskId);
    return { resultType: 'complete', ...wireTask(task) } as never;
  });

  return server;
}
