'use client';

import { useState, useTransition } from 'react';
import { setAdMatch } from '../actions';

const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function AdMatchRow({
  storeId,
  adName,
  amount,
  value,
  manual,
  catalogs,
}: {
  storeId: string;
  adName: string;
  amount: string;
  value: string;
  manual: boolean;
  catalogs: { key: string; name: string }[];
}) {
  const [v, setV] = useState(value);
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  return (
    <tr>
      <td className="max-w-[360px] !whitespace-normal">{adName}</td>
      <td className="text-right tabular-nums">{amount}</td>
      <td>
        <select
          className={`max-w-[420px] rounded-md border bg-surf px-2 py-1 ${v ? 'border-line' : 'border-warn'}`}
          value={v}
          disabled={pending}
          aria-label={`Katalog untuk ${adName}`}
          onChange={(e) => {
            const next = e.target.value;
            setV(next);
            start(async () => {
              const r = await setAdMatch({ storeId, adName, catalogKey: next });
              setErr(r.ok ? '' : r.error);
            });
          }}
        >
          <option value="">Belum cocok: bagi ke semua katalog toko</option>
          {catalogs.map((c) => (
            <option key={c.key} value={c.key}>
              {short(c.name, 80)}
            </option>
          ))}
        </select>
        {manual && <span className="chip chip-ch ml-1">manual</span>}
        {err && <span className="ml-1 text-[13px] text-loss">{err}</span>}
      </td>
    </tr>
  );
}
