/** Raw JSON-RPC over fetch: the 2.3.1 client cannot read a task answer (ADR D-047). */
export const TOKEN = 'a'.repeat(64);
export const TASKS = 'io.modelcontextprotocol/tasks';
export const MODERN = '2026-07-28';

export interface RpcOptions {
  tasks?: boolean;
  token?: string | null;
  name?: string;
  headers?: Record<string, string>;
}

/** `url` is read per call, so a client can be built before the server listens. */
export function client(url: () => string) {
  async function rpc(method: string, params: Record<string, unknown>, o: RpcOptions = {}) {
    const capabilities = o.tasks === false ? {} : { extensions: { [TASKS]: {} } };
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': MODERN,
      'mcp-method': method,
      ...o.headers,
    };
    if (o.name !== undefined) headers['mcp-name'] = o.name;
    if (o.token !== null) headers['authorization'] = `Bearer ${o.token ?? TOKEN}`;
    const res = await fetch(`${url()}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params: {
          ...params,
          _meta: {
            'io.modelcontextprotocol/protocolVersion': MODERN,
            'io.modelcontextprotocol/clientCapabilities': capabilities,
            'io.modelcontextprotocol/clientInfo': { name: 'wire-test', version: '0.0.0' },
          },
        },
      }),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined };
  }

  const getTask = (taskId: string) => rpc('tasks/get', { taskId }, { name: taskId });

  async function pollUntil(taskId: string, done: (status: string) => boolean, timeoutMs = 2000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const r = await getTask(taskId);
      if (done(r.body.result.status)) return r.body.result;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`task ${taskId} never settled`);
  }

  return { rpc, getTask, pollUntil };
}
