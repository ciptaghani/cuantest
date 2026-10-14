'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Msg, useAction } from '@/components/useAction';
import { opnameCreate } from '../actions';

/** Mulai sesi opname baru (atau buka sesi yang sudah ada di gudang & tanggal itu). */
export function OpnameNew({ warehouses, mainWarehouseId, today }: { warehouses: { id: string; name: string }[]; mainWarehouseId: string; today: string }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [wh, setWh] = useState(mainWarehouseId);
  const { pending, msg, run } = useAction();
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => opnameCreate({ date, warehouseId: wh }),
          (r) => r.data && router.replace(`/operasional/opname?id=${r.data.id}`, { scroll: false }),
        );
      }}
    >
      <label className="field">
        <span>Tanggal opname baru</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label className="field">
        <span>Gudang</span>
        <select value={wh} onChange={(e) => setWh(e.target.value)}>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <button className="btn" disabled={pending}>
        Mulai opname
      </button>
      <Msg msg={msg} />
    </form>
  );
}
