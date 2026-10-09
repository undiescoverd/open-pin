import { useId, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { cx, focusRing } from './cx';
import { Icon } from './Icon';

/* Form controls for the inspector. Every control takes its accessible name as `label`. */

const inputBase = cx(
  'w-full rounded-sm border border-line-strong bg-raised px-2 text-base text-fg placeholder:text-fg-muted',
  'hover:border-fg-muted disabled:cursor-not-allowed disabled:text-fg-disabled',
  focusRing,
);

export interface FieldProps {
  /** the visible label, also the accessible name */
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
  className?: string;
}

/** A label above a control, wired together. */
export function Field({ label, hint, children, className }: FieldProps) {
  const id = useId();
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-medium text-fg-muted">
        {label}
      </label>
      {children(id)}
      {hint && <p className="m-0 text-sm text-fg-muted">{hint}</p>}
    </div>
  );
}

export function TextField({ label, hint, className, ...rest }: Omit<ComponentProps<'input'>, 'children'> & { label: string; hint?: string }) {
  return (
    <Field label={label} hint={hint} className={className}>
      {id => <input id={id} type="text" className={cx(inputBase, 'h-8')} {...rest} />}
    </Field>
  );
}

export function TextArea({ label, hint, className, ...rest }: Omit<ComponentProps<'textarea'>, 'children'> & { label: string; hint?: string }) {
  return (
    <Field label={label} hint={hint} className={className}>
      {id => <textarea id={id} rows={3} className={cx(inputBase, 'resize-y py-1.5 leading-snug')} {...rest} />}
    </Field>
  );
}

export interface SelectFieldProps extends Omit<ComponentProps<'select'>, 'children' | 'onChange'> {
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}

export function SelectField({ label, options, onChange, className, ...rest }: SelectFieldProps) {
  return (
    <Field label={label} className={className}>
      {id => (
        <select id={id} className={cx(inputBase, 'h-8')} onChange={e => onChange(e.target.value)} {...rest}>
          {options.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export interface TimecodeFieldProps {
  label: string;
  /** seconds */
  value: number;
  /** m:ss.cc text for a value */
  format: (seconds: number) => string;
  /** seconds, or null when the text isn't a time */
  parse: (text: string) => number | null;
  /** return false (or a message) to refuse a value that doesn't fit; the field then reverts */
  onCommit: (seconds: number) => boolean | string;
  onRefuse?: (message: string) => void;
}

/**
 * A time typed as `3`, `3.5` or `0:03.50`. Enter commits and leaves the field (so Undo then undoes the edit); a value that is
 * invalid or doesn't fit is refused with a message and the field reverts.
 */
export function TimecodeField({ label, value, format, parse, onCommit, onRefuse }: TimecodeFieldProps) {
  /* while the field is being edited `draft` holds what was typed; otherwise it shows the formatted value */
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const commit = (el: HTMLInputElement) => {
    const text = draft ?? format(value);
    const seconds = parse(text);
    if (seconds === null) onRefuse?.(`"${text}" isn't a time. Try 3.5 or 0:03.50.`);
    else {
      const result = onCommit(seconds);
      if (result !== true) onRefuse?.(typeof result === 'string' ? result : "That time doesn't fit here.");
    }
    setDraft(null);
    el.blur();
  };
  return (
    <Field label={label}>
      {id => (
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          className={cx(inputBase, 'h-8 font-mono tabular-nums')}
          value={draft ?? format(value)}
          onFocus={e => {
            cancelled.current = false;
            setDraft(format(value));
            e.currentTarget.select();
          }}
          onChange={e => setDraft(e.target.value)}
          onBlur={e => {
            if (draft !== null && !cancelled.current) commit(e.currentTarget);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(e.currentTarget);
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              cancelled.current = true;
              setDraft(null);
              e.currentTarget.blur();
            }
          }}
        />
      )}
    </Field>
  );
}

export interface ParamRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  /** a default shows the reset button; double-clicking the label resets too */
  defaultValue?: number;
  /** a slider can't go beyond the box: let the number box accept values past `max` */
  onChange: (value: number) => void;
}

/** One numeric value: label, reset, slider and a number box with its unit. Typing is clamped when you leave the box. */
export function ParamRow({ label, value, min, max, step = 1, unit, defaultValue, onChange }: ParamRowProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Math.round(value * 1000) / 1000);
  const clampTo = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1">
      <div className="flex items-center gap-1">
        <label htmlFor={id} className="text-sm font-medium text-fg-muted select-none" onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}>
          {label}
        </label>
        {defaultValue !== undefined && (
          <button
            type="button"
            aria-label={`Reset ${label}`}
            disabled={value === defaultValue}
            onClick={() => onChange(defaultValue)}
            className={cx('grid size-5 place-items-center rounded-sm text-fg-muted hover:text-fg disabled:invisible', focusRing)}
          >
            <Icon icon={RotateCcw} size={14} />
          </button>
        )}
      </div>
      <div className="row-span-2 flex items-center gap-1">
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          step={step}
          value={shown}
          onChange={e => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value !== '' && Number.isFinite(n)) onChange(clampTo(n));
          }}
          onBlur={() => setDraft(null)}
          className={cx(inputBase, 'h-7 w-[68px] text-right font-mono tabular-nums')}
        />
        {unit && <span className="w-5 text-sm text-fg-muted">{unit}</span>}
      </div>
      <input
        type="range"
        aria-label={`${label} slider`}
        min={min}
        max={max}
        step={step}
        value={clampTo(value)}
        onChange={e => {
          setDraft(null);
          onChange(Number(e.target.value));
        }}
        className={cx('h-4 w-full accent-[var(--wp-sel)]', focusRing)}
      />
    </div>
  );
}

export interface SwatchProps {
  label: string;
  colors: ReadonlyArray<{ id: string; name: string; value: string }>;
  value: string;
  onChange: (value: string) => void;
}

/** The annotation palette as a row of round swatches. */
export function ColorSwatchPicker({ label, colors, value, onChange }: SwatchProps) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1">
      <span className="text-sm font-medium text-fg-muted">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {colors.map(c => (
          <button
            key={c.id}
            type="button"
            aria-label={c.name}
            aria-pressed={c.value.toLowerCase() === value.toLowerCase()}
            onClick={() => onChange(c.value)}
            style={{ background: c.value }}
            className={cx('size-6 rounded-pill border border-line-strong aria-pressed:outline-2 aria-pressed:outline-offset-2 aria-pressed:outline-sel', focusRing)}
          />
        ))}
      </div>
    </div>
  );
}

const collapsed = new Set<string>();

export interface InspectorSectionProps {
  /** also remembers whether the group is collapsed while you work */
  id: string;
  title: string;
  children: ReactNode;
}

/** A collapsible titled group in the inspector. */
export function InspectorSection({ id, title, children }: InspectorSectionProps) {
  return (
    <details
      open={!collapsed.has(id)}
      onToggle={e => (e.currentTarget.open ? collapsed.delete(id) : collapsed.add(id))}
      className="group border-b border-line py-3 last:border-b-0"
    >
      <summary className={cx('cursor-default list-none text-xs font-semibold tracking-[0.08em] text-fg-muted uppercase select-none', focusRing)}>
        <span className="mr-1 inline-block transition-transform group-open:rotate-90" aria-hidden="true">
          ›
        </span>
        {title}
      </summary>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </details>
  );
}
