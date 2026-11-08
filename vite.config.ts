import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { eventEditorPlugin } from './scripts/event-editor.ts';
import { validateEvents } from './src/events.ts';

const eventsFile = fileURLToPath(new URL('./src/events.json', import.meta.url));

export default defineConfig(async () => {
  // Fail the build early if a hand-edited event is invalid.
  validateEvents(JSON.parse(await readFile(eventsFile, 'utf8')));

  return {
    // Relative assets work at both / and /any-github-repository-name/.
    base: './',
    plugins: [react(), eventEditorPlugin(eventsFile)],
    server: { host: '127.0.0.1' },
    preview: { host: '127.0.0.1' },
  };
});
