import { useEffect, useRef, useState } from 'react';
import type { FormEvent, InputHTMLAttributes } from 'react';
import { validateEvents } from './events';
import type { CountdownEvent } from './events';
import './editor.css';

const defaultTimeZone = 'America/Chicago';
const timeZones = [...new Set([...Intl.supportedValuesOf('timeZone'), defaultTimeZone, 'UTC'])].sort();

export default function EventEditor({ events }: { events: CountdownEvent[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<CountdownEvent[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  function edit() {
    setDraft(events);
    setError('');
    setOpen(true);
  }

  function addEvent() {
    const event = { id: crypto.randomUUID(), name: '', date: '', timeZone: defaultTimeZone };
    setDraft((items) => [...items, event]);
  }

  function removeEvent(id: string) {
    setDraft((items) => items.filter((item) => item.id !== id));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setError('');
    setSaving(true);
    try {
      const clean = validateEvents(draft.map(({ id }) => {
        const time = fields.get(`time-${id}`);
        return {
          id,
          name: fields.get(`name-${id}`),
          date: fields.get(`date-${id}`),
          timeZone: fields.get(`timeZone-${id}`),
          ...(time ? { time } : {}),
        };
      }));
      const response = await fetch('/__local/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Local-Editor': '1' },
        body: JSON.stringify(clean),
      });
      if (!response.ok) {
        const result = await response.json() as { error: string };
        throw new Error(result.error);
      }
      // Reload from the saved source file, including when hot reload is disabled.
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save events.');
      setSaving(false);
    }
  }

  return (
    <>
      <button className="edit-trigger" type="button" onClick={edit}>Edit events</button>
      <dialog className="editor" ref={dialog} aria-labelledby="editor-title" onCancel={() => setOpen(false)}>
        <form onSubmit={save}>
          <h2 id="editor-title">Events</h2>
          <p className="editor-note">Commit and push to publish.</p>
          <fieldset className="editor-fields" disabled={saving}>
            {open && draft.map((event, index) => (
              <EventFields key={event.id} initialEvent={event} number={index + 1} onRemove={removeEvent} />
            ))}
            <button type="button" className="add-button" disabled={draft.length >= 100} onClick={addEvent}>+ Add event</button>
          </fieldset>
          {error && <p className="editor-error" role="alert">{error}</p>}
          <div className="editor-actions">
            <button type="button" className="quiet-button" onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
            <button className="save-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save events'}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function EventFields({ initialEvent, number, onRemove }: {
  initialEvent: CountdownEvent;
  number: number;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState(initialEvent.name);
  const [date, setDate] = useState(initialEvent.date);
  const { id, time, timeZone } = initialEvent;

  return (
    <fieldset className="event-fields">
      <legend>Event {number}</legend>
      <RequiredField label="Name" name={`name-${id}`} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
      <div className="date-fields">
        <RequiredField label="Date" name={`date-${id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <OptionalTimeField name={`time-${id}`} number={number} defaultValue={time} />
      </div>
      <label>
        Time zone
        <select name={`timeZone-${id}`} defaultValue={timeZone} required>
          {!timeZones.includes(timeZone) && <option value={timeZone}>{timeZone}</option>}
          {timeZones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
        </select>
      </label>
      <div className="event-field-footer">
        <button
          type="button"
          className="quiet-button remove-button"
          aria-label={`Remove ${name || `event ${number}`}`}
          onClick={() => onRemove(id)}
        >
          Remove
        </button>
      </div>
    </fieldset>
  );
}

function RequiredField({ label, value, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string; value: string }) {
  return (
    <label>
      {label}
      <input {...input} value={value} required aria-invalid={!value.trim()} />
    </label>
  );
}

function OptionalTimeField({ name, number, defaultValue }: { name: string; number: number; defaultValue?: string }) {
  const inputId = `event-time-${number}`;
  const hintId = `event-time-hint-${number}`;

  return (
    <div className="time-field">
      <label htmlFor={inputId}>
        <span>
          Time (<span className="tooltip-anchor" tabIndex={0} aria-describedby={hintId}>
            optional<span className="editor-tooltip" role="tooltip" id={hintId}>Blank time means midnight.</span>
          </span>)
        </span>
      </label>
      <input id={inputId} name={name} aria-describedby={hintId} type="time" defaultValue={defaultValue} />
    </div>
  );
}
