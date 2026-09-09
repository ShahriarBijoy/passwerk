#!/usr/bin/env node
// A minimal newline-delimited JSON-RPC peer for testing the shared stdio client.
// `boom` answers with an error, `silent` never answers, anything else echoes.
let buf = '';
process.stdin.on('data', (d) => {
  buf += d.toString();
  const lines = buf.split('\n');
  buf = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.id === undefined) continue; // a notification
    if (msg.method === 'initialize') {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} })}\n`);
    } else if (msg.method === 'boom') {
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -1, message: 'boom' } })}\n`,
      );
    } else if (msg.method === 'silent') {
      // deliberately no reply
    } else {
      const result = { echoed: msg.method };
      if (msg.params !== undefined) result.params = msg.params;
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result })}\n`);
    }
  }
});
