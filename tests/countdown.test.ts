import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countdown, elapsedSince, eventDateTime, formatEventDates, validateEvents } from '../src/events.ts';

const wedding = { id: 'wedding', name: 'Our wedding', date: '2027-06-06', timeZone: 'America/Chicago' };

test('date-only events mean midnight in Chicago, independent of visitor zone', () => {
  const target = eventDateTime(wedding);
  assert.equal(target.toUTC().toISO(), '2027-06-06T05:00:00.000Z');
  assert.deepEqual(formatEventDates(target, false, 'America/Los_Angeles'), {
    local: { label: 'June 5, 2027', dateTime: '2027-06-05' },
    original: { label: 'June 6, 2027', dateTime: '2027-06-06' },
  });
  for (const zone of ['America/Chicago', 'Asia/Tokyo', 'UTC']) {
    assert.deepEqual(formatEventDates(target, false, zone), {
      local: { label: 'June 6, 2027', dateTime: '2027-06-06' },
      original: undefined,
    });
  }
});

test('timed events show both wall times across date boundaries, including explicit midnight', () => {
  const midnight = eventDateTime({ ...wedding, date: '2028-01-01', time: '00:00' });
  const losAngeles = formatEventDates(midnight, true, 'America/Los_Angeles');
  assert.equal(losAngeles.local.dateTime, '2027-12-31T22:00:00.000-08:00');
  assert.match(losAngeles.local.label, /December 31, 2027 · 10:00 PM/);
  assert.deepEqual(losAngeles.original, {
    label: 'January 1, 2028 · 12:00 AM',
    dateTime: '2028-01-01T00:00:00.000-06:00',
  });
  for (const zone of ['America/Chicago', 'Etc/GMT+6']) {
    const sameTime = formatEventDates(midnight, true, zone);
    assert.match(sameTime.local.label, /12:00 AM/);
    assert.equal(sameTime.original, undefined);
  }

  const summer = eventDateTime({ ...wedding, date: '2027-06-30', time: '15:30' });
  const tokyo = formatEventDates(summer, true, 'Asia/Tokyo');
  const utc = formatEventDates(summer, true, 'UTC');
  assert.equal(tokyo.local.dateTime, '2027-07-01T05:30:00.000+09:00');
  assert.equal(utc.local.dateTime, '2027-06-30T20:30:00.000Z');
  assert.deepEqual(tokyo.original, {
    label: 'June 30, 2027 · 3:30 PM',
    dateTime: '2027-06-30T15:30:00.000-05:00',
  });
  assert.deepEqual(utc.original, tokyo.original);
});

test('specific times and winter daylight saving offsets are respected', () => {
  assert.equal(eventDateTime({ ...wedding, time: '15:30' }).toUTC().toISO(), '2027-06-06T20:30:00.000Z');
  assert.equal(eventDateTime({ ...wedding, date: '2027-01-01' }).toUTC().toISO(), '2027-01-01T06:00:00.000Z');
});

test('countdown rolls over correctly and never goes negative', () => {
  assert.deepEqual(countdown(90061000, 0), { days: 1, hours: 1, minutes: 1, seconds: 1 });
  assert.deepEqual(countdown(86400000, 1), { days: 1, hours: 0, minutes: 0, seconds: 0 });
  assert.deepEqual(countdown(1000, 999), { days: 0, hours: 0, minutes: 0, seconds: 1 });
  assert.deepEqual(countdown(1000, 1000), { days: 0, hours: 0, minutes: 0, seconds: 0 });
  assert.deepEqual(countdown(1000, 2000), { days: 0, hours: 0, minutes: 0, seconds: 0 });
});

test('elapsed time starts at zero and counts only completed seconds', () => {
  const zero = { days: 0, hours: 0, minutes: 0, seconds: 0 };
  assert.deepEqual(elapsedSince(1000, 999), zero);
  assert.deepEqual(elapsedSince(1000, 1000), zero);
  assert.deepEqual(elapsedSince(1000, 1999), zero);
  assert.deepEqual(elapsedSince(1000, 2000), { ...zero, seconds: 1 });
  assert.deepEqual(elapsedSince(1000, 86400999), { days: 0, hours: 23, minutes: 59, seconds: 59 });
  assert.deepEqual(elapsedSince(1000, 86401000), { ...zero, days: 1 });
  assert.deepEqual(elapsedSince(1000, 90062000), { days: 1, hours: 1, minutes: 1, seconds: 1 });
});

test('invalid dates, nonexistent DST times, duplicate ids, and invalid zones are rejected', () => {
  assert.throws(() => validateEvents([{ ...wedding, date: '2027-02-30' }]), /does not exist/);
  assert.throws(() => validateEvents([{ ...wedding, date: '2027-03-14', time: '02:30' }]), /does not exist/);
  assert.throws(() => validateEvents([wedding, wedding]), /unique id/);
  assert.throws(() => validateEvents([{ ...wedding, timeZone: 'invalid' }]), /time zone/);
  assert.throws(() => validateEvents([{ ...wedding, time: '24:00' }]), /24-hour/);
  assert.deepEqual(validateEvents([]), []);
});

test('repeated autumn times consistently use the first occurrence', () => {
  const autumn = { ...wedding, date: '2027-11-07', time: '01:30' };
  assert.equal(eventDateTime(autumn).toUTC().toISO(), '2027-11-07T06:30:00.000Z');
});

test('event list accepts 100 unique entries and rejects invalid shapes or a 101st entry', () => {
  const full = Array.from({ length: 100 }, (_, index) => ({ ...wedding, id: String(index) }));
  assert.deepEqual(validateEvents(full), full);
  for (const input of [null, {}, '[]', [...full, wedding]]) {
    assert.throws(() => validateEvents(input), /array containing at most 100/);
  }
  for (const entry of [null, 'event', 42]) {
    assert.throws(() => validateEvents([entry]), /Event 1 is invalid/);
  }
});

test('event normalization trims IDs and names without altering the source', () => {
  const name = 'a'.repeat(120);
  const raw = Object.freeze({ ...wedding, id: '  our wedding  ', name: ` ${name} `, extra: true });
  assert.deepEqual(validateEvents([raw]), [{ ...wedding, id: 'our wedding', name }]);
  assert.throws(() => validateEvents([wedding, { ...wedding, id: ' wedding ' }]), /unique id/);
});

test('invalid event fields are rejected at their documented boundaries', () => {
  const cases = [
    ['id', ['', '  ', 1], /unique id/],
    ['name', ['', '  ', false, 'a'.repeat(121)], /1 to 120/],
    ['date', [null, '2028-2-29', '2028-02-29T00:00'], /YYYY-MM-DD/],
    ['date', ['2027-02-29'], /does not exist/],
    ['time', ['', null, 0, '0:00', '23:60', '23:59:00'], /HH:mm/],
    ['timeZone', [null, 0, '+05:00'], /time zone/],
  ] as const;
  for (const [field, values, error] of cases) {
    for (const value of values) {
      assert.throws(() => validateEvents([{ ...wedding, [field]: value }]), error, `${field}: ${value}`);
    }
  }
});

test('leap day accepts omitted time and both ends of the 24-hour clock', () => {
  const leapDay = { ...wedding, date: '2028-02-29', timeZone: 'UTC' };
  const midnight = { ...leapDay, time: '00:00', timeZone: 'Asia/Kolkata' };
  const lastMinute = { ...leapDay, time: '23:59', timeZone: 'Pacific/Auckland' };
  for (const event of [leapDay, midnight, lastMinute]) {
    assert.deepEqual(validateEvents([event]), [event]);
  }
});

test('rounded countdowns carry across minute, hour and day boundaries', () => {
  for (const [seconds, at, below] of [
    [60, { days: 0, hours: 0, minutes: 1, seconds: 0 }, { days: 0, hours: 0, minutes: 0, seconds: 59 }],
    [3600, { days: 0, hours: 1, minutes: 0, seconds: 0 }, { days: 0, hours: 0, minutes: 59, seconds: 59 }],
    [86400, { days: 1, hours: 0, minutes: 0, seconds: 0 }, { days: 0, hours: 23, minutes: 59, seconds: 59 }],
  ] as const) {
    assert.deepEqual(countdown(seconds * 1000, 999), at);
    assert.deepEqual(countdown(seconds * 1000, 1000), below);
  }
});
