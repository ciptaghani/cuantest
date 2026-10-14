'use client';

import { useEffect, useState } from 'react';
import { Msg, useAction } from '@/components/useAction';
import { n0, rp } from '@/lib/format';
import type { SkuSnapshot } from '../logic';
import { saveIO, skuSnapshot } from '../actions';
import { IO_LABEL, OUT_REASONS } from '../constants';

type IOType = keyof typeof IO_LABEL;

/** Barang masuk / keluar / pindah gudang (satu SKU per catatan, sama seperti versi HTML). */
export function IOForm({ warehouses, mainWarehouseId, today }: { warehouses: { id: string; name: string }[]; mainWarehouseId: string; today: string }) {
  const [T, setT] = useState<IOType>('IN');
  const [date, setDate] = useState(today);
  const [wh, setWh] = useState(mainWarehouseId);
  const [toWh, setToWh] = useState(warehouses.find((w) => w.id !== mainWarehouseId)?.id ?? '');
  const [sku, setSku] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState<string>(OUT_REASONS[0]);
  const [note, setNote] = useState('');
  const [snap, setSnap] = useState<SkuSnapshot | null>(null);
  const [snapErr, setSnapErr] = useState('');
  const { pending, msg, run } = useAction();

  useEffect(() => {
    const code = sku.trim();
    setSnapErr('');
    if (!code) return setSnap(null);
    let alive = true;
    const t = setTimeout(async () => {
      const r = await skuSnapshot({ sku: code, mode: 'io' });
      if (!alive) return;
      setSnap(r.ok && r.data ? r.data : null);
      if (!r.ok) setSnapErr(r.error);
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [sku, pending]);

  const toList = warehouses.filter((w) => w.id !== wh);
  const dest = toList.some((w) => w.id === toWh) ? toWh : (toList[0]?.id ?? '');

  function save() {
    const q = Number(qty) || 0;
    const have = snap?.stock.find((s) => s.id === wh)?.now ?? 0;
    const whName = warehouses.find((w) => w.id === wh)?.name;
    if (T === 'OUT' && snap && q > have && !window.confirm(`Stok di ${whName} hanya ${n0(have)}. Tetap catat barang keluar ${q}?`)) return;
    run(
      () => saveIO({ type: T, date, warehouseId: wh, toWarehouseId: T === 'TRANSFER' ? dest : '', sku: sku.trim(), qty, price: T === 'IN' ? price : '', reason: T === 'OUT' ? reason : '', note }),
      () => {
        setSku('');
        setQty('');
        setPrice('');
        setNote('');
      },
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="seg mt-4">
        {(Object.keys(IO_LABEL) as IOType[]).map((k) => (
          <button key={k} type="button" aria-pressed={T === k} onClick={() => setT(k)}>
            {IO_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <label className="field">
          <span>Tanggal</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>{T === 'IN' ? 'Masuk ke gudang' : T === 'OUT' ? 'Keluar dari gudang' : 'Dari gudang'}</span>
          <select value={wh} onChange={(e) => setWh(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        {T === 'TRANSFER' && (
          <label className="field col-span-2 sm:col-span-1">
            <span>Ke gudang</span>
            <select value={dest} onChange={(e) => setToWh(e.target.value)}>
              {toList.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field col-span-2">
          <span>SKU</span>
          <input list="dl-io" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Ketik SKU atau nama" />
        </label>
        <label className="field">
          <span>Qty</span>
          <input type="number" inputMode="numeric" min={0} step={1} value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        {T === 'IN' && (
          <label className="field">
            <span>Harga beli per pcs (Rp)</span>
            <input type="number" inputMode="decimal" min={0} step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="untuk HPP" />
          </label>
        )}
        {T === 'OUT' && (
          <label className="field">
            <span>Alasan</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {OUT_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {snap ? (
        <p className="note">
          {snap.label} · {snap.category} · stok{' '}
          {snap.stock.map((s, i) => (
            <span key={s.id}>
              {i > 0 && ' · '}
              {s.name} <b>{n0(s.now)}</b>
            </span>
          ))}
          {T === 'IN' && ` · HPP sekarang ${rp(snap.hpp)}`}
        </p>
      ) : (
        sku.trim() && snapErr && <p className="note neg">{snapErr}</p>
      )}
      <p className="note">
        {T === 'IN'
          ? 'Kosongkan harga kalau barang masuk tanpa pembelian (mis. retur dari pembeli). Pembelian dengan faktur sebaiknya lewat Finance → Pembelian barang supaya otomatis tercatat di sini.'
          : T === 'OUT'
            ? 'Barang keluar mengurangi stok gudang, mis. salah kirim (kelebihan atau salah varian) yang tidak tercatat di export pesanan.'
            : 'Stok berkurang di gudang asal dan bertambah di gudang tujuan. Tidak mengubah HPP.'}
      </p>
      <label className="field mt-3">
        <span>Catatan</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={T === 'OUT' ? 'mis. no. pesanan yang salah kirim' : 'opsional'} />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="btn" disabled={pending}>
          Simpan
        </button>
        <Msg msg={msg} />
      </div>
    </form>
  );
}
