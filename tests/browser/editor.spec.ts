import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { withDev } from './workspace';

const events = [
  { id: 'first', name: 'First event', date: '2027-06-06', timeZone: 'Etc/GMT+5' },
  { id: 'second', name: 'Second event', date: '2027-06-07', time: '00:00', timeZone: 'UTC' },
];

test('opens by keyboard, keeps edits across row changes, and discards them on close', async ({ page }) => {
  await withDev(events, async (url) => {
    await page.goto(url);
    const trigger = page.getByRole('button', { name: 'Edit events' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Events' });
    const names = dialog.getByRole('textbox', { name: 'Name' });
    await expect(dialog).toBeVisible();
    await expect(names.first()).toBeFocused();
    await expect(names.first()).toHaveValue('First event');
    await expect(names.nth(1)).toHaveValue('Second event');
    await expect(dialog.getByLabel('Time zone').first()).toHaveValue('Etc/GMT+5');
    await trigger.evaluate((button) => button.focus());
    await expect(names.first()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByLabel('Date').first()).toBeFocused();

    await names.first().fill('Draft edit');
    await dialog.getByRole('button', { name: 'Add event' }).click();
    await expect(names).toHaveCount(3);
    await expect(dialog.getByLabel('Time zone').last()).toHaveValue('America/Chicago');
    await dialog.getByRole('button', { name: 'Remove Second event' }).click();
    await expect(names).toHaveCount(2);
    await expect(names.first()).toHaveValue('Draft edit');

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Space');
    await expect(names.first()).toHaveValue('First event');
    await expect(names.nth(1)).toHaveValue('Second event');
    await names.nth(1).fill('Another draft');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(names.nth(1)).toHaveValue('Second event');
  });
});

test('rejects blank names, preserves edits on failure, and saves on retry', async ({ page }) => {
  await withDev(events, async (url, file) => {
    const initial = await readFile(file, 'utf8');
    await page.goto(url);
    await page.getByRole('button', { name: 'Edit events' }).click();
    const dialog = page.getByRole('dialog');
    const name = dialog.getByRole('textbox', { name: 'Name' }).first();
    const save = dialog.getByRole('button', { name: 'Save events' });
    const writes: unknown[] = [];
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/__local/events', async (route) => {
      writes.push(route.request().postDataJSON());
      if (writes.length === 1) {
        await pending;
        await route.fulfill({ status: 500, json: { error: 'Could not save events. Please retry.' } });
      } else {
        await route.continue();
      }
    });
    try {
      await name.fill('');
      await save.click();
      await expect(name).toHaveAttribute('aria-invalid', 'true');
      await expect(name).toBeFocused();
      await name.fill('   ');
      await save.click();
      await expect(dialog.getByRole('alert')).toContainText('needs a name');
      expect(writes).toHaveLength(0);
      expect(await readFile(file, 'utf8')).toBe(initial);

      await name.fill('  Updated event  ');
      await save.click();
      await expect(dialog.getByRole('button', { name: /Saving/ })).toBeDisabled();
      await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      await expect(name).toBeDisabled();
      release();
      await expect(dialog.getByRole('alert')).toHaveText('Could not save events. Please retry.');
      await expect(name).toBeEnabled();
      await expect(name).toHaveValue('  Updated event  ');
      expect(await readFile(file, 'utf8')).toBe(initial);

      const expected = [{ ...events[0], name: 'Updated event' }, events[1]];
      await save.click();
      await expect(page.getByRole('heading', { name: 'Updated event' })).toBeVisible();
      await expect(dialog).toBeHidden();
      expect(writes).toEqual([expected, expected]);
      expect(await readFile(file, 'utf8')).toBe(`${JSON.stringify(expected, null, 2)}\n`);
    } finally {
      release();
    }
  });
});
