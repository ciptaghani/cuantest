'use client';

import { useRef, useState } from 'react';
import { Msg, useAction } from '@/components/useAction';
import { returCreate } from '../actions';

/** Scanner barcode mengetik kode lalu menekan Enter, jadi tiap scan langsung tersimpan. */
export function ScanBox({ today }: { today: string }) {
  const [matches, setMatches] = useState(true);
  const [date, setDate] = useState(today);
  const input = useRef<HTMLInputElement>(null);
  const { pending, msg, run } = useAction();

  function save(code: string, force = false) {
    run(
      () => returCreate({ date, code, matches, force }),
      (r) => {
        if (r.data?.duplicate && window.confirm(`${code} sudah tercatat tanggal ${r.data.duplicate}. Simpan lagi?`)) save(code, true);
        input.current?.focus();
      },
    );
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <input
          ref={input}
          className="scan"
          placeholder="Scan / ketik no. resi lalu Enter"
          aria-label="No. resi atau pesanan"
          autoComplete="off"
          autoFocus
          aria-busy={pending}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const code = e.currentTarget.value.trim();
            e.currentTarget.value = '';
            if (code) save(code);
          }}
        />
        <div className="seg">
          {[true, false].map((v) => (
            <button key={String(v)} type="button" aria-pressed={matches === v} onClick={() => setMatches(v)}>
              {v ? 'Sesuai' : 'Tidak sesuai'}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Tanggal diterima</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <div className="mt-2 min-h-5">
        <Msg msg={msg} />
      </div>
    </>
  );
}
