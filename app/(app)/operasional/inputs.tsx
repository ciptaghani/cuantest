'use client';

import { useRef, useState } from 'react';
import type { ActionResult } from '@/lib/auth/guard';
import { Msg, useAction } from '@/components/useAction';

type Act = (input: never) => Promise<ActionResult<unknown>>;

/**
 * Sel yang langsung tersimpan ke server saat diubah (input: saat blur / Enter, select & checkbox: saat berubah).
 * Hanya baris ini yang dikirim, jadi beberapa orang bisa mengisi bersamaan tanpa saling menimpa.
 */
export function SaveField({
  action,
  input,
  field,
  value,
  type = 'number',
  options,
  emptyNull = false,
  className,
  placeholder,
  step = 'any',
  min,
  label,
  style,
}: {
  action: Act;
  /** Bagian input yang tetap (id, kode SKU, …). */
  input: object;
  field: string;
  value: string | number | boolean | null;
  type?: 'number' | 'text' | 'select' | 'checkbox';
  options?: [value: string, label: string][];
  /** Input kosong dikirim sebagai null (mis. qty opname yang belum dihitung). */
  emptyNull?: boolean;
  className?: string;
  placeholder?: string;
  step?: string;
  min?: number;
  /** aria-label */
  label?: string;
  style?: React.CSSProperties;
}) {
  const { pending, msg, setMsg, run } = useAction();
  const [flash, setFlash] = useState(false);
  const last = useRef(value === null ? '' : String(value));

  function save(raw: string | boolean) {
    const s = typeof raw === 'boolean' ? String(raw) : raw.trim();
    if (s === last.current) return;
    const v = typeof raw === 'boolean' ? raw : s === '' && emptyNull ? null : s;
    run(
      () => (action as (i: unknown) => Promise<ActionResult<unknown>>)({ ...input, [field]: v }),
      () => {
        last.current = s;
        setMsg(null);
        setFlash(true);
        setTimeout(() => setFlash(false), 1200);
      },
    );
  }

  const ring = flash ? { outline: '2px solid var(--profit)', outlineOffset: '1px' } : undefined;
  const common = { 'aria-label': label, disabled: pending, style: { ...style, ...ring } };

  let el: React.ReactNode;
  if (type === 'checkbox')
    el = <input type="checkbox" defaultChecked={!!value} onChange={(e) => save(e.target.checked)} {...common} />;
  else if (type === 'select')
    el = (
      <select className={className ?? 'txtin'} defaultValue={value === null ? '' : String(value)} onChange={(e) => save(e.target.value)} {...common}>
        {options?.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    );
  else
    el = (
      <input
        type={type}
        inputMode={type === 'number' ? 'decimal' : undefined}
        step={type === 'number' ? step : undefined}
        min={min}
        className={className ?? (type === 'number' ? 'qin' : 'txtin')}
        defaultValue={value === null ? '' : String(value)}
        placeholder={placeholder}
        onBlur={(e) => save(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        {...common}
      />
    );
  return (
    <>
      {el}
      {msg && !msg.ok && (
        <div>
          <Msg msg={msg} />
        </div>
      )}
    </>
  );
}

export interface AddFieldDef {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select';
  /** id datalist untuk saran isian. */
  list?: string;
  options?: [value: string, label: string][];
  placeholder?: string;
  defaultValue?: string;
  width?: number;
  /** Lebarkan mengisi sisa baris. */
  grow?: boolean;
  required?: boolean;
}

/** Form satu baris untuk menambah data (SKU, gudang, kemasan, …). Dikosongkan setelah berhasil. */
export function AddForm({ action, fields, fixed = {}, submit = 'Tambah', ghost = true }: { action: Act; fields: AddFieldDef[]; fixed?: Record<string, unknown>; submit?: string; ghost?: boolean }) {
  const { pending, msg, run } = useAction();
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data: Record<string, unknown> = { ...fixed };
        for (const [k, v] of new FormData(form)) data[k] = typeof v === 'string' ? v.trim() : v;
        run(
          () => (action as (i: unknown) => Promise<ActionResult<unknown>>)(data),
          () => form.reset(),
        );
      }}
    >
      {fields.map((f) => (
        <label key={f.name} className={`field ${f.grow ? 'min-w-[140px] flex-1' : ''}`}>
          <span>{f.label}</span>
          {f.type === 'select' ? (
            <select name={f.name} defaultValue={f.defaultValue} style={f.width ? { width: f.width } : undefined}>
              {f.options?.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          ) : (
            <input
              name={f.name}
              type={f.type ?? 'text'}
              step={f.type === 'number' ? 'any' : undefined}
              list={f.list}
              placeholder={f.placeholder}
              defaultValue={f.defaultValue}
              required={f.required}
              style={f.width ? { width: f.width } : undefined}
            />
          )}
        </label>
      ))}
      <button className={ghost ? 'btn-ghost' : 'btn'} disabled={pending}>
        {submit}
      </button>
      <Msg msg={msg} />
    </form>
  );
}
