import { expect, test } from '@playwright/test';
import { withDev } from './workspace';

test.use({ timezoneId: 'America/Los_Angeles' });

const events = [
  { id: 'la', name: 'Explicit midnight', date: '2027-06-06', time: '00:00', timeZone: 'America/Los_Angeles' },
  { id: 'our wedding', name: 'Date only', date: '2027-06-06', timeZone: 'America/Chicago' },
];

test('orders and labels events and keeps the clock current through arrival', async ({ page }) => {
  await withDev(events, async (url) => {
    await page.clock.install({ time: new Date('2027-06-06T04:58:00Z') });
    await page.clock.pauseAt(new Date('2027-06-06T04:59:58Z'));
    await page.goto(url);

    const cards = page.getByRole('article');
    await expect(cards.getByRole('heading')).toHaveText(['Date only', 'Explicit midnight']);
    const first = page.getByRole('article', { name: 'Date only', exact: true });
    const second = page.getByRole('article', { name: 'Explicit midnight', exact: true });
    await expect(first.locator('.event-date')).toHaveText(/Local · June 5, 2027\s*Event · June 6, 2027 \(America\/Chicago\)/);
    await expect(first.locator('time')).toHaveText(['June 5, 2027', 'June 6, 2027']);
    await expect(first.locator('time').first()).toHaveAttribute('datetime', '2027-06-05');
    await expect(first.locator('time').last()).toHaveAttribute('datetime', '2027-06-06');
    await expect(second.locator('time')).toHaveText(/June 6, 2027.*12:00 AM/);

    const timer = first.getByRole('timer');
    const values = timer.locator('.clock-number');
    const elapsed = first.getByText('Time since', { exact: true });
    await expect(timer).toHaveAccessibleName('Date only countdown');
    await expect(values).toHaveText(['00', '00', '00', '02']);
    await page.clock.runFor(1000);
    await expect(values).toHaveText(['00', '00', '00', '01']);
    await expect(elapsed).toHaveCount(0);
    await page.clock.runFor(1000);
    await expect(elapsed).toBeVisible();
    await expect(timer).toHaveAccessibleName('Time since Date only');
    await expect(values).toHaveText(['00', '00', '00', '00']);
    const hours = second.locator('.clock-number').nth(1);
    await expect(hours).toHaveText('02');

    await page.clock.runFor(1000);
    await expect(values).toHaveText(['00', '00', '00', '01']);

    await page.clock.setSystemTime(new Date('2027-06-06T05:30:00Z'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(hours).toHaveText('01');
    await page.clock.setSystemTime(new Date('2027-06-06T06:30:00Z'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(hours).toHaveText('00');
    await expect(values).toHaveText(['00', '01', '30', '00']);
    await page.reload();
    await expect(timer).toHaveAccessibleName('Time since Date only');
    await expect(values).toHaveText(['00', '01', '30', '00']);

    await page.clock.setSystemTime(new Date('2027-06-06T04:59:59.500Z'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(timer).toHaveAccessibleName('Date only countdown');
    await expect(elapsed).toHaveCount(0);
    await expect(values).toHaveText(['00', '00', '00', '01']);
  });
});

test('shows the empty state when there are no events', async ({ page }) => {
  await withDev([], async (url) => {
    await page.goto(url);
    await expect(page.getByText('No upcoming moments, just yet.')).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
  });
});
