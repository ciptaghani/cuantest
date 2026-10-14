'use client';

import { useState, useTransition } from 'react';
import type { ActionResult } from '@/lib/auth/guard';
import { createStore, deleteStore, updateStore } from './actions';

export interface StoreView {
  id: string;
  name: string;
  channel: 'SHOPEE' | 'TIKTOK';
  brand: string;
  fees: { feeAdmin: number; feeFreeShip: number; feeService: number; feeTax: number; feeAms: number; feeProcess: number };
  /** Tarif efektif dipakai (≥ 5 pesanan aktual). */
  effective: { n: number; admin: number; freeShip: number; service: number; tax: number; ams: number; process: number } | null;
  actualOrders: number;
}

const FEE_COLS: [keyof StoreView['fees'], string, boolean][] = [
  ['feeAdmin', 'Admin', true],
  ['feeFreeShip', 'Gratis Ongkir', true],
  ['feeService', 'Layanan', true],
  ['feeTax', 'Pajak', true],
  ['feeAms', 'AMS', true],
  ['feeProcess', 'Proses/pesanan', false],
];
const EFF_KEY: Record<keyof StoreView['fees'], keyof NonNullable<StoreView['effective']>> = {
  feeAdmin: 'admin',
  feeFreeShip: 'freeShip',
  feeService: 'service',
  feeTax: 'tax',
  feeAms: 'ams',
  feeProcess: 'process',
};
const pct = (x: number) => (x * 100).toFixed(2).replace('.', ',') + '%';
const rp = (x: number) => 'Rp' + new Intl.NumberFormat('id-ID').format(Math.round(x));

function useAct() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<ActionResult>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message || 'Tersimpan' } : { ok: false, text: r.error });
      if (r.ok) onOk?.();
    });
  return { pending, msg, run };
}

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <span role="status" className={`text-[13px] ${msg.ok ? 'text-profit' : 'text-loss'}`}>
      {msg.text}
    </span>
  );
}

function StoreRow({ s }: { s: StoreView }) {
  const [f, setF] = useState({ name: s.name, brand: s.brand, ...s.fees });
  const { pending, msg, run } = useAct();
  const dirty = JSON.stringify(f) !== JSON.stringify({ name: s.name, brand: s.brand, ...s.fees });
  return (
    <tr className="align-top">
      <td>
        <input className="w-44 rounded-md border border-line bg-surf px-2 py-1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Nama toko" />{' '}
        <span className="chip chip-ch">{s.channel === 'SHOPEE' ? 'Shopee' : 'TikTok'}</span>
      </td>
      <td>
        <input className="w-28 rounded-md border border-line bg-surf px-2 py-1" list="brand-list" value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} aria-label="Brand toko" />
      </td>
      <td>
        {s.effective ? <span className="chip chip-ok">Otomatis dari {s.effective.n} pesanan</span> : <span className="chip chip-mid">Cadangan ({s.actualOrders}/5 pesanan aktual)</span>}
      </td>
      {FEE_COLS.map(([k, , isPct]) => (
        <td key={k} className="text-right">
          {s.effective ? (
            <span className="tabular-nums" title="Tarif efektif dari laporan penghasilan">
              {isPct ? pct(s.effective[EFF_KEY[k]]) : rp(s.effective[EFF_KEY[k]])}
            </span>
          ) : (
            <input
              type="number"
              step={isPct ? 0.1 : 50}
              min={0}
              className="w-20 rounded-md border border-line bg-surf px-2 py-1 text-right"
              value={f[k]}
              onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })}
              aria-label={k}
            />
          )}
        </td>
      ))}
      <td className="!whitespace-normal">
        <span className="flex flex-wrap items-center gap-2">
          {dirty && (
            <button className="btn btn-sm" disabled={pending} onClick={() => run(() => updateStore({ storeId: s.id, ...f }))}>
              Simpan
            </button>
          )}
          <button
            className="linkbtn !text-loss"
            disabled={pending}
            onClick={() => {
              const typed = prompt(`Hapus toko "${s.name}" beserta SEMUA pesanan, potongan, dan iklannya? Ketik nama toko untuk konfirmasi:`);
              if (typed !== null) run(() => deleteStore({ storeId: s.id, confirmName: typed }));
            }}
          >
            Hapus
          </button>
          <Msg msg={msg} />
        </span>
      </td>
    </tr>
  );
}

export function StoreManager({ stores, brands }: { stores: StoreView[]; brands: string[] }) {
  const [open, setOpen] = useState(stores.length === 0);
  const [nf, setNf] = useState({ name: '', channel: 'SHOPEE' as 'SHOPEE' | 'TIKTOK', brand: '' });
  const { pending, msg, run } = useAct();
  return (
    <>
      <datalist id="brand-list">
        {brands.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      {stores.length > 0 && (
        <div className="tbl-wrap mt-3">
          <table className="tbl">
            <thead>
              <tr>
                <th>Toko</th>
                <th>Brand</th>
                <th>Sumber tarif</th>
                {FEE_COLS.map(([k, l]) => (
                  <th key={k} className="!text-right">
                    {l}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <StoreRow key={s.id} s={s} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="note">Tarif cadangan (persen, proses dalam Rupiah) dipakai sampai toko punya minimal 5 pesanan di laporan penghasilan. Setelah itu tarif efektif dihitung otomatis.</p>
      {open ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => createStore(nf),
              () => {
                setNf({ name: '', channel: nf.channel, brand: '' });
                setOpen(false);
              },
            );
          }}
        >
          <label className="field">
            <span>Nama toko</span>
            <input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} placeholder="mis. ngado.kado Shopee" required />
          </label>
          <label className="field">
            <span>Channel</span>
            <select value={nf.channel} onChange={(e) => setNf({ ...nf, channel: e.target.value as 'SHOPEE' | 'TIKTOK' })}>
              <option value="SHOPEE">Shopee</option>
              <option value="TIKTOK">TikTok</option>
            </select>
          </label>
          <label className="field">
            <span>Brand</span>
            <input list="brand-list" value={nf.brand} onChange={(e) => setNf({ ...nf, brand: e.target.value })} placeholder="ngado.kado" />
          </label>
          <button className="btn" type="submit" disabled={pending}>
            Buat toko
          </button>
          <button className="btn-ghost" type="button" onClick={() => setOpen(false)}>
            Batal
          </button>
          <Msg msg={msg} />
        </form>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <button className="btn-ghost" onClick={() => setOpen(true)}>
            + Tambah toko
          </button>
          <Msg msg={msg} />
        </div>
      )}
    </>
  );
}
