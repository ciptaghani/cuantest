'use client';

import { useState } from 'react';
import { Msg, useAction } from '@/components/useAction';
import { addPlan, setPlanDone } from '../actions';
import { PLAN_CATS } from '../constants';

export function PlanForm({ date, stores }: { date: string; stores: { id: string; name: string }[] }) {
  const [f, setF] = useState({ title: '', category: PLAN_CATS[0] as string, storeId: '', note: '' });
  const { pending, msg, run } = useAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addPlan({ ...f, date }), () => setF({ ...f, title: '', note: '' }));
      }}
    >
      <label className="field">
        <span>Judul</span>
        <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="mis. Live TikTok jam 19.00" required />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <label className="field">
          <span>Kategori</span>
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {PLAN_CATS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Toko</span>
          <select value={f.storeId} onChange={(e) => setF({ ...f, storeId: e.target.value })}>
            <option value="">Semua toko</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field mt-3">
        <span>Catatan</span>
        <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="btn" disabled={pending}>
          Simpan rencana
        </button>
        <Msg msg={msg} />
      </div>
    </form>
  );
}

export function DoneToggle({ id, done, title }: { id: string; done: boolean; title: string }) {
  const { pending, run } = useAction();
  return (
    <label className="chk">
      <input type="checkbox" defaultChecked={done} disabled={pending} onChange={(e) => run(() => setPlanDone({ id, done: e.target.checked }))} />
      <b className={`font-semibold ${done ? 'text-muted line-through' : ''}`}>{title}</b>
    </label>
  );
}
