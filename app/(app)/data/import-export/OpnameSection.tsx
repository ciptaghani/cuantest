'use client';

import { useState } from 'react';
import { Importer } from './Importer';
import { backendUrl } from '@/lib/api';

export function OpnameSection({ warehouses, brands, today }: { warehouses: { id: string; name: string }[]; brands: string[]; today: string }) {
  const [wh, setWh] = useState(warehouses[0]?.id ?? '');
  const [date, setDate] = useState(today);
  const [brand, setBrand] = useState('');
  const qs = new URLSearchParams({ warehouseId: wh, date, ...(brand ? { brand } : {}) }).toString();
  const ok = wh && /^\d{4}-\d{2}-\d{2}$/.test(date);
  return (
    <>
      <div className="mt-3 flex flex-wrap items-end gap-3">
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
        <label className="field">
          <span>Tanggal opname</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Brand (template)</span>
          <select value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">Semua brand</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b || '(tanpa brand)'}
              </option>
            ))}
          </select>
        </label>
        <a className={`btn-ghost ${ok ? '' : 'pointer-events-none opacity-50'}`} href={backendUrl(`/api/export/opname-template?${qs}`)}>
          Download template
        </a>
      </div>
      <Importer
        kind="opname"
        params={{ warehouseId: wh, date }}
        disabledReason={ok ? undefined : 'Pilih gudang dan tanggal.'}
        buttonLabel="Upload hasil opname"
        note={<p className="note">Qty yang diupload masuk ke opname draft gudang & tanggal ini (dibuat otomatis kalau belum ada). Opname yang sudah diselesaikan tidak bisa diubah.</p>}
      />
    </>
  );
}
