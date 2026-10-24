/**
 * MCP tasks (extension `io.modelcontextprotocol/tasks`, revision 2026-07-28) held in memory.
 * The registry owns every task's state; jobs only report progress and return a result.
 */
import { randomBytes } from 'node:crypto';

export type TaskId = string & { readonly __brand: 'TaskId' };

/** A finished tool call, in the shape of a `tools/call` result. */
export interface ToolResult {
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface TaskError {
  code: number;
  message: string;
}

interface TaskBase {
  taskId: TaskId;
  tool: string;
  statusMessage?: string;
  createdAt: string;
  lastUpdatedAt: string;
  ttlMs: number;
  pollIntervalMs: number;
}

export type Task =
  | (TaskBase & { status: 'working' })
  | (TaskBase & { status: 'completed'; result: ToolResult })
  | (TaskBase & { status: 'failed'; error: TaskError })
  | (TaskBase & { status: 'cancelled' });

export interface JobContext {
  signal: AbortSignal;
  progress(statusMessage: string): void;
}

export type Job = (ctx: JobContext) => Promise<ToolResult>;

export class TooManyTasksError extends Error {}

export interface TaskRegistryOptions {
  now?: () => Date;
  newId?: () => TaskId;
  /** How long a task stays readable after it was created. Default one hour. */
  ttlMs?: number;
  /** Poll interval asked for while the task is young. Default 2000. */
  pollIntervalMs?: number;
  /** Poll interval once the task is older than `slowPollAfterMs`. Default 5000. */
  slowPollIntervalMs?: number;
  /** Default 30 000. */
  slowPollAfterMs?: number;
  /** Tasks held at once, finished ones included. Default 200. */
  maxTasks?: number;
  /** Tasks running at once. Default 4. */
  maxRunning?: number;
}

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** `ser_` plus 26 base32 characters (130 random bits). */
export function randomTaskId(): TaskId {
  const bytes = randomBytes(26);
  let id = 'ser_';
  for (const b of bytes) id += BASE32[b & 31];
  return id as TaskId;
}

const isTerminal = (t: Task) => t.status !== 'working';

export class TaskRegistry {
  private readonly tasks = new Map<string, Task>();
  private readonly controllers = new Map<string, AbortController>();
  private inline = 0;
  private readonly now: () => Date;
  private readonly newId: () => TaskId;
  private readonly ttlMs: number;
  private readonly pollIntervalMs: number;
  private readonly slowPollIntervalMs: number;
  private readonly slowPollAfterMs: number;
  private readonly maxTasks: number;
  private readonly maxRunning: number;

  constructor(o: TaskRegistryOptions = {}) {
    this.now = o.now ?? (() => new Date());
    this.newId = o.newId ?? randomTaskId;
    this.ttlMs = o.ttlMs ?? 60 * 60 * 1000;
    this.pollIntervalMs = o.pollIntervalMs ?? 2000;
    this.slowPollIntervalMs = o.slowPollIntervalMs ?? 5000;
    this.slowPollAfterMs = o.slowPollAfterMs ?? 30_000;
    this.maxTasks = o.maxTasks ?? 200;
    this.maxRunning = o.maxRunning ?? 4;
  }

  /** Accepts the job and returns its task at once; the job runs after this returns. */
  start(tool: string, job: Job): Task {
    this.purgeExpired();
    if (this.running() >= this.maxRunning) {
      throw new TooManyTasksError(`${this.maxRunning} tasks are already running; try again later`);
    }
    this.makeRoom();
    const at = this.now().toISOString();
    const task: Task = {
      taskId: this.newId(),
      tool,
      status: 'working',
      createdAt: at,
      lastUpdatedAt: at,
      ttlMs: this.ttlMs,
      pollIntervalMs: this.pollIntervalMs,
    };
    const controller = new AbortController();
    this.tasks.set(task.taskId, task);
    this.controllers.set(task.taskId, controller);
    queueMicrotask(() => void this.run(task.taskId, job, controller.signal));
    return task;
  }

  /**
   * Runs a job inside the caller's request, for clients without the tasks extension. It counts
   * against the same running cap as tasks, and the caller's signal stops it.
   */
  async runInline(job: Job, signal: AbortSignal): Promise<ToolResult> {
    if (this.running() >= this.maxRunning) {
      throw new TooManyTasksError(`${this.maxRunning} tasks are already running; try again later`);
    }
    this.inline += 1;
    try {
      return await job({ signal, progress: () => {} });
    } finally {
      this.inline -= 1;
    }
  }

  private running(): number {
    return this.controllers.size + this.inline;
  }

  get(id: string): Task | undefined {
    this.purgeExpired();
    const task = this.tasks.get(id);
    if (task === undefined) return undefined;
    // Claude Code re-reads the interval from every tasks/get, so a long run is polled less.
    const age = this.now().getTime() - Date.parse(task.createdAt);
    const pollIntervalMs =
      age < this.slowPollAfterMs ? this.pollIntervalMs : this.slowPollIntervalMs;
    return { ...task, pollIntervalMs };
  }

  /** Cancelling a finished task changes nothing. */
  cancel(id: string): Task | undefined {
    const task = this.get(id);
    if (task === undefined || isTerminal(task)) return task;
    this.controllers.get(id)?.abort();
    return this.settle(id, { status: 'cancelled' });
  }

  private async run(id: string, job: Job, signal: AbortSignal): Promise<void> {
    const progress = (statusMessage: string) => {
      const task = this.tasks.get(id);
      if (task?.status !== 'working') return;
      this.tasks.set(id, { ...task, statusMessage, lastUpdatedAt: this.now().toISOString() });
    };
    try {
      const result = await job({ signal, progress });
      this.settle(id, { status: 'completed', result });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.settle(id, { status: 'failed', error: { code: -32603, message } });
    }
  }

  private settle(
    id: string,
    outcome:
      | { status: 'completed'; result: ToolResult }
      | { status: 'failed'; error: TaskError }
      | { status: 'cancelled' },
  ): Task | undefined {
    const task = this.tasks.get(id);
    if (task === undefined || isTerminal(task)) return task;
    this.controllers.delete(id);
    const { statusMessage: _dropped, ...base } = task;
    const next: Task = { ...base, ...outcome, lastUpdatedAt: this.now().toISOString() };
    this.tasks.set(id, next);
    return next;
  }

  private purgeExpired(): void {
    const now = this.now().getTime();
    for (const [id, task] of this.tasks) {
      if (isTerminal(task) && Date.parse(task.createdAt) + task.ttlMs <= now) this.tasks.delete(id);
    }
  }

  /** Drops the oldest finished tasks until one more fits. */
  private makeRoom(): void {
    for (const [id, task] of this.tasks) {
      if (this.tasks.size < this.maxTasks) return;
      if (isTerminal(task)) this.tasks.delete(id);
    }
    if (this.tasks.size >= this.maxTasks) {
      throw new TooManyTasksError(`${this.maxTasks} tasks are held; try again later`);
    }
  }
}
