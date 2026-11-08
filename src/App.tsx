import { lazy, Suspense, useEffect, useId, useMemo, useState } from 'react';
import eventData from './events.json';
import { countdown, elapsedSince, eventDateTime, formatEventDates, validateEvents, type CountdownEvent } from './events';

// Vite removes this import and the entire editor from production builds.
const EventEditor = import.meta.env.DEV ? lazy(() => import('./EventEditor')) : null;

export default function App() {
  const [now, setNow] = useState(Date.now);
  const displayZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const events = useMemo(() => validateEvents(eventData).map((event) => {
    const date = eventDateTime(event);
    return {
      ...event,
      target: date.toMillis(),
      dates: formatEventDates(date, event.time !== undefined, displayZone),
    };
  }).sort((a, b) => a.target - b.target), [eventData, displayZone]);

  useEffect(() => {
    const update = () => setNow(Date.now());
    const interval = window.setInterval(update, 1000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  return (
    <>
      <main className="countdowns" aria-label="Circles">
        {events.map((event) => <CountdownCard key={event.id} event={event} now={now} />)}
        {events.length === 0 && <p className="empty">No upcoming moments, just yet.</p>}
      </main>
      {EventEditor && <Suspense fallback={null}><EventEditor events={events} /></Suspense>}
    </>
  );
}

interface CountdownCardProps {
  event: CountdownEvent & { target: number; dates: ReturnType<typeof formatEventDates> };
  now: number;
}

function CountdownCard({ event, now }: CountdownCardProps) {
  const headingId = useId();
  const { local, original } = event.dates;
  const reached = now >= event.target;
  const duration = reached ? elapsedSince(event.target, now) : countdown(event.target, now);

  return (
    <article className="event" aria-labelledby={headingId}>
      <h1 id={headingId}>{event.name}</h1>
      <div className="event-date">
        <div>
          {original && 'Local · '}
          <time dateTime={local.dateTime}>{local.label}</time>
        </div>
        {original && (
          <div className="event-source-date">
            Event · <time dateTime={original.dateTime}>{original.label}</time> ({event.timeZone})
          </div>
        )}
      </div>
      <div className="clock" role="timer" aria-label={reached ? `Time since ${event.name}` : `${event.name} countdown`}>
        {Object.entries(duration).map(([unit, value]) => (
          <div className="clock-unit" key={unit}>
            <span className="clock-number">{String(value).padStart(2, '0')}</span>
            <span className="clock-label">{unit}</span>
          </div>
        ))}
      </div>
      {reached && <p className="elapsed">Time since</p>}
    </article>
  );
}
