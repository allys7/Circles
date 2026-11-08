import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { request, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createServer, type ViteDevServer } from 'vite';
import { eventEditorPlugin } from '../scripts/event-editor.ts';

test('the editor saves normalized JSON and preserves the file after each rejected write', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'countdown-test-'));
  const file = join(directory, 'events.json');
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(file, '[]\n');
  const server = await createServer({
    configFile: false,
    server: { host: '127.0.0.1', port: 0, ws: false },
    plugins: [eventEditorPlugin(file)],
  });
  try {
    await server.listen();
    const address = server.httpServer!.address();
    assert.ok(address && typeof address === 'object');
    const origin = `http://127.0.0.1:${address.port}`;
    const endpoint = `${origin}/__local/events`;
    const send = (body: string, overrides: Record<string, string | null> = {}, method = 'PUT') => {
      const headers = Object.fromEntries(Object.entries({
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(body)),
        'X-Local-Editor': '1',
        Origin: origin,
        ...overrides,
      }).filter(([, value]) => value !== null));
      // Use node:http so the Host header on the wire is the one the test supplies.
      return new Promise<number | undefined>((resolve, reject) => {
        const outgoing = request(endpoint, { method, headers }, (response) => {
          response.on('error', reject);
          response.on('end', () => resolve(response.statusCode));
          response.resume();
        });
        outgoing.on('error', reject);
        outgoing.end(body);
      });
    };
    const date = '2027-06-06';
    const timeZone = 'America/Chicago';
    const events = [
      { id: 'test', name: 'Test event', date, time: '00:00', timeZone },
      { id: 'other', name: 'Other event', date, timeZone },
    ];
    const body = (extra: string) => JSON.stringify([
      { ...events[0], id: ' test ', name: ' Test event ', extra },
      events[1],
    ]);
    const remaining = 65_536 - Buffer.byteLength(body(''));
    const atLimit = body('é'.repeat(Math.floor(remaining / 2)) + 'a'.repeat(remaining % 2));
    assert.equal(Buffer.byteLength(atLimit), 65_536);
    assert.equal(await send(atLimit), 200);
    const saved = Buffer.from(`${JSON.stringify(events, null, 2)}\n`);
    assert.deepEqual(await readFile(file), saved);

    const cases: { label: string; status: number; headers?: Record<string, string | null>; method?: string; body?: string }[] = [
      { label: 'missing editor header', status: 403, headers: { 'X-Local-Editor': null } },
      { label: 'wrong editor header', status: 403, headers: { 'X-Local-Editor': '0' } },
      { label: 'missing origin', status: 403, headers: { Origin: null } },
      { label: 'foreign origin', status: 403, headers: { Origin: 'https://example.com' } },
      { label: 'invalid host with matching origin', status: 403, headers: { Host: 'example.com', Origin: 'http://example.com' } },
      { label: 'wrong method', status: 405, method: 'POST' },
      { label: 'wrong content type', status: 415, headers: { 'Content-Type': 'text/plain' } },
      { label: 'malformed JSON', status: 400, body: '{' },
      { label: 'invalid events', status: 400, body: JSON.stringify([{ ...events[0], date: '2027-02-30' }]) },
      { label: 'one UTF-8 byte over the limit', status: 413, body: `${atLimit} ` },
    ];
    for (const item of cases) {
      await t.test(item.label, async () => {
        assert.equal(await send(item.body ?? '[]', item.headers, item.method), item.status);
        assert.deepEqual(await readFile(file), saved);
      });
    }
    assert.equal(await send('[]'), 200);
    assert.equal(await readFile(file, 'utf8'), '[]\n');
  } finally {
    await server.close();
  }
});

test('the save middleware rejects a synthetic non-loopback peer before reading the body', async () => {
  const plugin = eventEditorPlugin('unused-events.json');
  assert.equal(typeof plugin.configureServer, 'function');
  type Middleware = (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  let handler: Middleware | undefined;
  const server = {
    middlewares: { use: (_path: string, middleware: Middleware) => { handler = middleware; } },
  } as unknown as ViteDevServer;
  if (typeof plugin.configureServer !== 'function') throw new Error('Expected a configureServer hook');
  await plugin.configureServer.call({} as ThisParameterType<typeof plugin.configureServer>, server);
  assert.ok(handler);

  const req = {
    method: 'PUT',
    headers: { host: 'localhost', origin: 'http://localhost', 'x-local-editor': '1', 'content-type': 'application/json' },
    socket: { remoteAddress: '192.0.2.1' },
    [Symbol.asyncIterator]() { assert.fail('The rejected request body must not be read'); },
  } as unknown as IncomingMessage;
  let status: number | undefined;
  let ended = false;
  const res = {
    writeHead(code: number) { status = code; },
    end() { ended = true; },
  } as unknown as ServerResponse;
  await handler(req, res);
  assert.equal(status, 403);
  assert.ok(ended);
});
