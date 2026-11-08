import { DateTime, IANAZone } from 'luxon';

export interface CountdownEvent {
  id: string;
  name: string;
  date: string;
  time?: string;
  timeZone: string;
}

export function eventDateTime(event: CountdownEvent): DateTime {
  const date = DateTime.fromISO(`${event.date}T${event.time || '00:00'}`, {
    zone: event.timeZone,
  });
  // On the autumn clock change, use the first occurrence of a repeated time.
  return date.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis())[0] ?? date;
}

export function validateEvents(input: unknown): CountdownEvent[] {
  if (!Array.isArray(input) || input.length > 100) {
    throw new Error('Events must be an array containing at most 100 events.');
  }

  const ids = new Set<string>();
  return input.map((value: unknown, index) => {
    if (!value || typeof value !== 'object') throw new Error(`Event ${index + 1} is invalid.`);
    const item = value as Record<string, unknown>;
    if (typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id.trim())) {
      throw new Error(`Event ${index + 1} needs a unique id.`);
    }
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.trim().length > 120) {
      throw new Error(`Event ${index + 1} needs a name of 1 to 120 characters.`);
    }
    if (typeof item.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
      throw new Error(`${item.name}: use a date in YYYY-MM-DD format.`);
    }
    if (item.time !== undefined && (typeof item.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time))) {
      throw new Error(`${item.name}: use a 24-hour time in HH:mm format, or omit time.`);
    }
    // Newer Intl versions also accept numeric offsets; event zones must be named.
    if (typeof item.timeZone !== 'string' || /^[+-]/.test(item.timeZone) || !IANAZone.isValidZone(item.timeZone)) {
      throw new Error(`${item.name}: use a time zone such as America/Chicago.`);
    }

    const event: CountdownEvent = {
      id: item.id.trim(),
      name: item.name.trim(),
      date: item.date,
      ...(item.time ? { time: item.time as string } : {}),
      timeZone: item.timeZone,
    };
    const date = eventDateTime(event);
    if (!date.isValid || date.toISODate() !== event.date || date.toFormat('HH:mm') !== (event.time ?? '00:00')) {
      throw new Error(`${event.name}: that date or time does not exist in ${event.timeZone}.`);
    }
    ids.add(event.id);
    return event;
  });
}

function formatDate(date: DateTime, hasTime: boolean, showZone: boolean) {
  date = date.setLocale('en-US');
  const day = date.toLocaleString({ month: 'long', day: 'numeric', year: 'numeric' });
  if (!hasTime) return { label: day, dateTime: date.toISODate() ?? undefined };

  const time = date.toLocaleString({
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: showZone ? 'short' : undefined,
  });
  return { label: `${day} · ${time}`, dateTime: date.toISO() ?? undefined };
}

export function formatEventDates(original: DateTime, hasTime: boolean, displayZone: string) {
  const local = original.setZone(displayZone);
  const differs = hasTime ? local.offset !== original.offset : local.toISODate() !== original.toISODate();
  return {
    local: formatDate(local, hasTime, true),
    original: differs ? formatDate(original, hasTime, false) : undefined,
  };
}

export function countdown(target: number, now: number) {
  // Round up so zero means the event has actually arrived.
  return splitSeconds(Math.max(0, Math.ceil((target - now) / 1000)));
}

export function elapsedSince(target: number, now: number) {
  return splitSeconds(Math.max(0, Math.floor((now - target) / 1000)));
}

function splitSeconds(total: number) {
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}
