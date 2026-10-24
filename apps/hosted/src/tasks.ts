/**
 * MCP tasks (extension `io.modelcontextprotocol/tasks`, revision 2026-07-28) held in memory.
 * The registry owns every task's state; jobs only report progress and return a result or a
 * question for the client.
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

/** One server-to-client request carried in a task, e.g. an `elicitation/create`. */
export interface InputRequest {
  method: string;
  params: Record<string, unknown>;
}

/** Keyed by ids the server picks; Claude Code answers each key once. */
export type InputRequests = Record<string, InputRequest>;

/** The client's bare result per key, e.g. an elicitation result. Untrusted until parsed. */
export type InputResponses = Record<string, unknown>;

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
  | (TaskBase & { status: 'input_required'; inputRequests: InputRequests })
  | (TaskBase & { status: 'completed'; result: ToolResult })
  | (TaskBase & { status: 'failed'; error: TaskError })
  | (TaskBase & { status: 'cancelled' });

export interface JobContext {
  signal: AbortSignal;
  progress(statusMessage: string): void;
}

/**
 * What a job asks the client before it can finish. `resume` is called once, with one response
 * per key, and its job runs as the same task.
 */
export interface Question {
  inputRequests: InputRequests;
  resume(responses: InputResponses): Job;
}

/** `Job<ToolResult>` is a job that never asks, as an inline run needs. */
export type Job<Out extends ToolResult | Question = ToolResult | Question> = (
  ctx: JobContext,
) => Promise<Out>;

export class TooManyTasksError extends Error {}

export interface TaskRegistryOptions {
  now?: () => Date;
  newId?: () => TaskId;
  /** How long a finished or unanswered task stays readable after it was created. Default one hour. */
  ttlMs?: number;
  /** Poll interval asked for while the task is young. Default 2000. */
  pollIntervalMs?: number;
  /** Poll interval once the task is older than `slowPollAfterMs`. Default 5000. */
  slowPollIntervalMs?: number;
  /** Default 30 000. */
  slowPollAfterMs?: number;
  /** Tasks held at once, finished ones included. Default 200. */
  maxTasks?: number;
  /** Tasks running at once. A task waiting for input is not running. Default 4. */
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

/** A task's state plus what the registry needs to drive it; `Task` is what the wire sees. */
type Entry =
  | (TaskBase & { status: 'working'; controller: AbortController })
  | (TaskBase & {
      status: 'input_required';
      question: Question;
      answers: Map<string, unknown>;
    })
  | (TaskBase & { status: 'completed'; result: ToolResult })
  | (TaskBase & { status: 'failed'; error: TaskError })
  | (TaskBase & { status: 'cancelled' });

type Outcome =
  | { status: 'completed'; result: ToolResult }
  | { status: 'failed'; error: TaskError }
  | { status: 'cancelled' };

const isTerminal = (e: Entry) => e.status !== 'working' && e.status !== 'input_required';

const isQuestion = (out: ToolResult | Question): out is Question => 'inputRequests' in out;

/** The fields every status shares, without the status message, which belongs to one run. */
const baseOf = ({ taskId, tool, createdAt, ttlMs, pollIntervalMs }: Entry) => ({
  taskId,
  tool,
  createdAt,
  ttlMs,
  pollIntervalMs,
});

function taskOf(entry: Entry): Task {
  switch (entry.status) {
    case 'working': {
      const { controller: _controller, ...task } = entry;
      return task;
    }
    case 'input_required': {
      const { question, answers: _answers, ...task } = entry;
      return { ...task, inputRequests: question.inputRequests };
    }
    default:
      return entry;
  }
}

export class TaskRegistry {
  private readonly entries = new Map<string, Entry>();
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
    const base = {
      taskId: this.newId(),
      tool,
      createdAt: at,
      lastUpdatedAt: at,
      ttlMs: this.ttlMs,
      pollIntervalMs: this.pollIntervalMs,
    };
    this.entries.set(base.taskId, this.launch(base, job));
    return { ...base, status: 'working' };
  }

  /**
   * Runs a job inside the caller's request, for clients without the tasks extension. It counts
   * against the same running cap as tasks, and the caller's signal stops it.
   */
  async runInline(job: Job<ToolResult>, signal: AbortSignal): Promise<ToolResult> {
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
    let n = this.inline;
    for (const e of this.entries.values()) if (e.status === 'working') n += 1;
    return n;
  }

  get(id: string): Task | undefined {
    this.purgeExpired();
    const entry = this.entries.get(id);
    if (entry === undefined) return undefined;
    // Claude Code re-reads the interval from every tasks/get, so a long run is polled less.
    const age = this.now().getTime() - Date.parse(entry.createdAt);
    const pollIntervalMs =
      age < this.slowPollAfterMs ? this.pollIntervalMs : this.slowPollIntervalMs;
    return { ...taskOf(entry), pollIntervalMs };
  }

  /** Cancelling a finished task changes nothing. */
  cancel(id: string): Task | undefined {
    if (this.get(id) === undefined) return undefined;
    const entry = this.entries.get(id);
    if (entry?.status === 'working') entry.controller.abort();
    return this.settle(id, { status: 'cancelled' });
  }

  /**
   * Records the first response to each key the task asked; anything else changes nothing,
   * including any update to a task that is not waiting for input. Once every key has a response
   * the resumed job starts. It counts against the running cap from then on, and starts even when
   * the cap is reached: the client has answered and will not ask again.
   */
  update(id: string, responses: InputResponses): Task | undefined {
    if (this.get(id) === undefined) return undefined;
    const entry = this.entries.get(id);
    if (entry?.status !== 'input_required') return this.get(id);
    const asked = Object.keys(entry.question.inputRequests);
    const fresh = Object.entries(responses).filter(
      ([key]) => asked.includes(key) && !entry.answers.has(key),
    );
    if (fresh.length === 0) return this.get(id);
    for (const [key, value] of fresh) entry.answers.set(key, value);
    const at = this.now().toISOString();
    if (entry.answers.size < asked.length) {
      this.entries.set(id, { ...entry, lastUpdatedAt: at });
      return this.get(id);
    }
    const resumed = entry.question.resume(Object.fromEntries(entry.answers));
    this.entries.set(id, this.launch({ ...baseOf(entry), lastUpdatedAt: at }, resumed));
    return this.get(id);
  }

  /** A working entry for `job`, which starts after the caller stored the entry. */
  private launch(base: Omit<TaskBase, 'statusMessage'>, job: Job): Entry {
    const controller = new AbortController();
    queueMicrotask(() => void this.run(base.taskId, job, controller));
    return { ...base, status: 'working', controller };
  }

  /** The entry is still this run's, neither cancelled nor replaced by a resume. */
  private current(id: string, controller: AbortController) {
    const entry = this.entries.get(id);
    return entry?.status === 'working' && entry.controller === controller ? entry : undefined;
  }

  private async run(id: string, job: Job, controller: AbortController): Promise<void> {
    const progress = (statusMessage: string) => {
      const entry = this.current(id, controller);
      if (entry === undefined) return;
      this.entries.set(id, { ...entry, statusMessage, lastUpdatedAt: this.now().toISOString() });
    };
    let out: ToolResult | Question;
    try {
      out = await job({ signal: controller.signal, progress });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (this.current(id, controller)) {
        this.settle(id, { status: 'failed', error: { code: -32603, message } });
      }
      return;
    }
    const entry = this.current(id, controller);
    if (entry === undefined) return;
    if (!isQuestion(out)) {
      this.settle(id, { status: 'completed', result: out });
      return;
    }
    this.entries.set(id, {
      ...baseOf(entry),
      status: 'input_required',
      question: out,
      answers: new Map(),
      lastUpdatedAt: this.now().toISOString(),
    });
  }

  private settle(id: string, outcome: Outcome): Task | undefined {
    const entry = this.entries.get(id);
    if (entry === undefined || isTerminal(entry)) return entry && taskOf(entry);
    const next: Entry = { ...baseOf(entry), ...outcome, lastUpdatedAt: this.now().toISOString() };
    this.entries.set(id, next);
    return taskOf(next);
  }

  /** Finished and unanswered tasks go once their ttl has passed; working ones stay. */
  private purgeExpired(): void {
    const now = this.now().getTime();
    for (const [id, entry] of this.entries) {
      if (entry.status !== 'working' && Date.parse(entry.createdAt) + entry.ttlMs <= now) {
        this.entries.delete(id);
      }
    }
  }

  /** Drops the oldest finished tasks until one more fits. */
  private makeRoom(): void {
    for (const [id, entry] of this.entries) {
      if (this.entries.size < this.maxTasks) return;
      if (isTerminal(entry)) this.entries.delete(id);
    }
    if (this.entries.size >= this.maxTasks) {
      throw new TooManyTasksError(`${this.maxTasks} tasks are held; try again later`);
    }
  }
}
