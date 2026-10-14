'use client';

import { useState } from 'react';
import { Msg, useAction } from '@/components/useAction';
import { addAdLog } from '../actions';
import { LOG_TYPES } from '../constants';

export interface LogInit {
  date: string;
  storeId: string;
  catalogKey: string;
  type: string;
  note: string;
}

/** Catat perubahan iklan (budget, target ROAS, status, …). */
export function LogForm({ stores, catalogs, init }: { stores: { id: string; name: string }[]; catalogs: { storeId: string; key: string; name: string }[]; init: LogInit }) {
  const [f, setF] = useState({ ...init, from: '', to: '', type: (LOG_TYPES as readonly string[]).includes(init.type) ? init.type : LOG_TYPES[0] });
  const { pending, msg, run } = useAction();
  const cats = catalogs.filter((c) => c.storeId === f.storeId);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value, ...(k === 'storeId' ? { catalogKey: '' } : {}) });
  return (
    <form
      className="mt-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addAdLog(f), () => setF({ ...f, from: '', to: '', note: '' }));
      }}
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <label className="field">
          <span>Tanggal</span>
          <input type="date" value={f.date} onChange={set('date')} required />
        </label>
        <label className="field">
          <span>Toko</span>
          <select value={f.storeId} onChange={set('storeId')} required>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field col-span-2">
          <span>Katalog / iklan</span>
          <select value={f.catalogKey} onChange={set('catalogKey')}>
            <option value="">Semua iklan toko</option>
            {cats.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name.length > 70 ? c.name.slice(0, 69) + '…' : c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Yang diubah</span>
          <select value={f.type} onChange={set('type')}>
            {LOG_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Dari</span>
          <input value={f.from} onChange={set('from')} placeholder="mis. 50.000" />
        </label>
        <label className="field">
          <span>Menjadi</span>
          <input value={f.to} onChange={set('to')} placeholder="mis. 65.000" />
        </label>
      </div>
      <label className="field mt-3">
        <span>Catatan / alasan</span>
        <input value={f.note} onChange={set('note')} />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="btn" disabled={pending || !f.storeId}>
          Simpan log
        </button>
        <Msg msg={msg} />
      </div>
    </form>
  );
}
