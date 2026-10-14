'use client';

import { useState } from 'react';
import { Msg, useAction } from '@/components/useAction';
import { setTargetMargin } from './actions';

/** Target margin bersih (%) untuk warna margin di Marketplace dan saran Marketing. */
export function TargetMargin({ value }: { value: number }) {
  const [v, setV] = useState(String(value));
  const { pending, msg, run } = useAction();
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setTargetMargin({ targetMargin: v }));
      }}
    >
      <label className="field">
        <span>Target margin bersih (%)</span>
        <input type="number" step="0.5" min={0} max={100} className="w-[120px]" value={v} onChange={(e) => setV(e.target.value)} />
      </label>
      {v !== String(value) && (
        <button className="btn" disabled={pending}>
          Simpan
        </button>
      )}
      <Msg msg={msg} />
    </form>
  );
}
