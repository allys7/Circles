import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { build, preview } from 'vite';
import { origin, workspace } from './workspace';

const event = { id: 'launch', name: 'Launch day', date: '2027-06-06', timeZone: 'UTC' };

test('invalid event data stops the build', async () => {
  const { root, configFile, close } = await workspace([{ ...event, date: '2027-02-30' }]);
  try {
    await expect(build({ root, configFile, logLevel: 'silent' })).rejects.toThrow(/date or time does not exist/);
  } finally {
    await close();
  }
});

test('production is read-only and serves relative assets at a repository path', async ({ page }) => {
  const { root, file, configFile, close } = await workspace([event]);
  try {
    await build({ root, configFile, logLevel: 'silent' });
    const dist = join(root, 'dist');
    const assets = await readdir(join(dist, 'assets'));
    expect(assets).not.toEqual(expect.arrayContaining([expect.stringMatching(/editor/i)]));
    const files = new Map([['index.html', await readFile(join(dist, 'index.html'))]]);
    const publicAssets = new Map([
      ['favicon.svg', 'image/svg+xml'],
      ['sharing-card.png', 'image/png'],
    ]);
    for (const asset of publicAssets.keys()) {
      files.set(asset, await readFile(join(dist, asset)));
    }
    for (const asset of assets) {
      const content = await readFile(join(dist, 'assets', asset));
      expect(content.toString()).not.toMatch(/__local\/events|X-Local-Editor|Edit events|\.edit-trigger|\.editor-fields/);
      files.set(`assets/${asset}`, content);
    }

    const prefix = '/circles-test/';
    const host = createServer((request, response) => {
      const url = request.url ?? '';
      const key = url === prefix ? 'index.html' : url.startsWith(prefix) ? url.slice(prefix.length) : '';
      const content = files.get(key);
      if (!content) {
        response.writeHead(404).end();
        return;
      }
      const mime = publicAssets.get(key) ?? (key.endsWith('.css') ? 'text/css' : key.endsWith('.js') ? 'text/javascript' : 'text/html');
      response.writeHead(200, { 'Content-Type': mime }).end(content);
    });
    const server = await preview({ root, configFile, preview: { port: 0 } });
    try {
      await new Promise<void>((resolve, reject) => {
        host.once('error', reject);
        host.listen(0, '127.0.0.1', resolve);
      });
      const previewUrl = origin(server.httpServer);
      const original = await readFile(file);
      const save = await page.request.put(`${previewUrl}/__local/events`, {
        headers: { Origin: previewUrl, 'X-Local-Editor': '1', 'Content-Type': 'application/json' },
        data: '[]',
      });
      expect(save.headers()['content-type'] ?? '').not.toContain('application/json');
      expect(await readFile(file)).toEqual(original);

      const failures: string[] = [];
      page.on('pageerror', (error) => failures.push(error.message));
      page.on('requestfailed', (request) => failures.push(request.url()));
      page.on('response', (response) => {
        if (!response.ok() && response.status() !== 304) failures.push(`${response.status()} ${response.url()}`);
      });
      const checkPage = async () => {
        await expect(page.getByRole('article', { name: event.name })).toBeVisible();
        await expect(page.getByRole('timer')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Edit events' })).toHaveCount(0);
        await expect(page.locator('dialog')).toHaveCount(0);
        await expect(page.locator('.clock')).toHaveCSS('display', 'flex');
        await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', './favicon.svg');
        for (const [asset, mime] of publicAssets) {
          const response = await page.request.get(new URL(asset, page.url()).href);
          await expect(response).toBeOK();
          expect(response.headers()['content-type']).toContain(mime);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
        expect(failures).toEqual([]);
      };
      await page.goto(previewUrl);
      await checkPage();
      await page.setViewportSize({ width: 320, height: 720 });
      await page.goto(`${origin(host)}${prefix}`);
      await checkPage();
      await page.reload();
      await checkPage();
    } finally {
      try {
        if (host.listening) await new Promise<void>((resolve) => host.close(() => resolve()));
      } finally {
        await server.close();
      }
    }
  } finally {
    await close();
  }
});
