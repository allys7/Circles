import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

export const project = fileURLToPath(new URL('../../', import.meta.url));

export function origin(server: Pick<Server, 'address'> | null) {
  const address = server?.address();
  if (!address || typeof address === 'string') throw new Error('Expected a listening TCP server');
  return `http://127.0.0.1:${address.port}`;
}

export async function workspace(events: unknown) {
  // Stay under the project so Vite resolves dependencies from its node_modules.
  const output = join(project, 'test-results');
  await mkdir(output, { recursive: true });
  const root = await mkdtemp(join(output, 'circles-'));
  const close = () => rm(root, { recursive: true, force: true });
  const file = join(root, 'src', 'events.json');
  try {
    for (const entry of ['src', 'scripts', 'public', 'index.html', 'vite.config.ts', 'package.json']) {
      await cp(join(project, entry), join(root, entry), { recursive: true });
    }
    await writeFile(file, JSON.stringify(events));
    return { root, file, close, configFile: join(root, 'vite.config.ts') };
  } catch (error) {
    await close();
    throw error;
  }
}

export async function withDev(events: unknown, run: (url: string, file: string) => Promise<void>) {
  const { root, file, configFile, close } = await workspace(events);
  try {
    const server = await createServer({ root, configFile, server: { port: 0, ws: false, watch: null } });
    try {
      await server.listen();
      await run(origin(server.httpServer), file);
    } finally {
      await server.close();
    }
  } finally {
    await close();
  }
}
