import { writeFile } from 'node:fs/promises';
import { normalizePath, type Plugin } from 'vite';
import { validateEvents } from '../src/events.ts';

export function eventEditorPlugin(eventsFile: string): Plugin {
  return {
    name: 'event-editor',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__local/events', async (request, response) => {
        const send = (status: number, body: unknown) => {
          response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          response.end(JSON.stringify(body));
        };
        const peer = request.socket.remoteAddress;
        const host = request.headers.host;
        // Permit only a local, same-origin editor request with a custom header.
        // A foreign website cannot set the header without a rejected CORS preflight.
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer ?? '') ||
          !host || !/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host) ||
          request.headers.origin !== `http://${host}` || request.headers['x-local-editor'] !== '1') {
          send(403, { error: 'Editing is available only from this local development page.' });
          return;
        }
        if (request.method !== 'PUT') { send(405, { error: 'Use PUT to save events.' }); return; }
        if (request.headers['content-type'] !== 'application/json') { send(415, { error: 'Use application/json.' }); return; }

        try {
          const chunks: Buffer[] = [];
          let bytes = 0;
          for await (const chunk of request) {
            bytes += Buffer.byteLength(chunk);
            if (bytes > 65536) { send(413, { error: 'The event file is too large.' }); return; }
            chunks.push(Buffer.from(chunk));
          }
          const events = validateEvents(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          await writeFile(eventsFile, `${JSON.stringify(events, null, 2)}\n`, 'utf8');
          // The editor reloads immediately; do not wait for the file watcher.
          const graph = server.environments.client.moduleGraph;
          for (const module of graph.getModulesByFile(normalizePath(eventsFile)) ?? []) {
            graph.invalidateModule(module);
          }
          send(200, { saved: true });
        } catch (cause) {
          send(400, { error: cause instanceof Error ? cause.message : 'Could not save events.' });
        }
      });
    },
  };
}
