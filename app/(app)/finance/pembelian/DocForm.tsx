'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Msg, useAction } from '@/components/useAction';
import { invTotals } from '@/lib/finance/invoice';
import { rp } from '@/lib/format';
import { saveDoc } from '../actions';

export interface DraftLine {
  kind: 'SKU' | 'OTHER';
  sku: string;
  name: string;
  account: string;
  qty: string;
  unit: string;
  price: string;
  disc: string;
}

export interface Draft {
  id: string;
  number: string;
  poId: string;
  supplier: string;
  date: string;
  dueDate: string;
  lines: DraftLine[];
  discIsPct: boolean;
  discValue: string;
  extra: string;
  received: boolean;
  warehouseId: string;
  note: string;
}

const n = (s: string) => Number(s) || 0;

/** Form PO / faktur pembelian (fnBuy di HTML). Total dihitung langsung; nilai final dihitung ulang di server. */
export function DocForm({
  type,
  init,
  skus,
  suppliers,
  accounts,
  warehouses,
}: {
  type: 'PO' | 'INV';
  init: Draft;
  skus: { code: string; label: string; price: number }[];
  suppliers: string[];
  accounts: [string, string][];
  warehouses: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [d, setD] = useState(init);
  const [pick, setPick] = useState('');
  const [pickErr, setPickErr] = useState('');
  const { pending, msg, run } = useAction();
  const isInv = type === 'INV';
  const skuOf = new Map(skus.map((s) => [s.code, s]));
  const t = invTotals({
    discIsPct: d.discIsPct,
    discValue: n(d.discValue),
    extra: isInv ? n(d.extra) : 0,
    lines: d.lines.map((l) => ({ kind: l.kind, sku: l.kind === 'SKU' ? l.sku : null, name: l.name, account: l.account, qty: n(l.qty), price: n(l.price), disc: n(l.disc) })),
  });
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setLine = (i: number, patch: Partial<DraftLine>) => setD((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const back = `/finance/pembelian?tab=${isInv ? 'inv' : 'po'}`;

  function addSku() {
    const s = skuOf.get(pick.trim());
    if (!s) return setPickErr('SKU tidak ada di master');
    setPickErr('');
    setPick('');
    set({ lines: [...d.lines, { kind: 'SKU', sku: s.code, name: '', account: '', qty: '1', unit: 'pcs', price: String(Math.round(s.price)), disc: '' }] });
  }

  function save() {
    run(
      () =>
        saveDoc({
          type,
          id: d.id,
          poId: d.poId,
          supplier: d.supplier,
          date: d.date,
          dueDate: isInv ? d.dueDate : '',
          lines: d.lines.map((l) => ({ ...l, qty: n(l.qty), price: n(l.price), disc: n(l.disc) })),
          discIsPct: d.discIsPct,
          discValue: n(d.discValue),
          extra: isInv ? n(d.extra) : 0,
          received: d.received,
          warehouseId: d.warehouseId,
          note: d.note,
        }),
      () => router.replace(back, { scroll: false }),
    );
  }

  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg">
          {d.id ? 'Ubah' : 'Buat'} {isInv ? 'faktur pembelian' : 'pesanan pembelian'}
          {d.number && ` · ${d.number}`}
        </h2>
        <button type="button" className="btn-ghost" onClick={() => router.replace(back, { scroll: false })}>
          Batal
        </button>
      </div>
      <datalist id="dl-sup">
        {suppliers.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="dl-fsku">
        {skus.map((s) => (
          <option key={s.code} value={s.code}>
            {s.label}
          </option>
        ))}
      </datalist>
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <label className="field col-span-2">
          <span>Pemasok *</span>
          <input list="dl-sup" value={d.supplier} onChange={(e) => set({ supplier: e.target.value })} placeholder="Nama pemasok" required />
        </label>
        <label className="field">
          <span>Tanggal *</span>
          <input type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} required />
        </label>
        {isInv && (
          <label className="field">
            <span>Jatuh tempo</span>
            <input type="date" value={d.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
          </label>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2.5">
        <label className="field">
          <span>Cari/pilih SKU terdaftar</span>
          <input
            list="dl-fsku"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSku();
              }
            }}
            placeholder="Ketik SKU"
            className="w-[260px] max-w-full"
          />
        </label>
        <button type="button" className="btn-ghost" onClick={addSku}>
          Tambah SKU
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => set({ lines: [...d.lines, { kind: 'OTHER', sku: '', name: '', account: '6-300', qty: '1', unit: 'pcs', price: '', disc: '' }] })}
        >
          Tambah barang lain (perlengkapan, peralatan, dll)
        </button>
        {pickErr && <span className="text-[13px] text-loss">{pickErr}</span>}
      </div>
      <div className="tbl-wrap mt-3">
        <table className="tbl">
          <thead>
            <tr>
              <th>Nama barang</th>
              <th className="r">Kuantitas</th>
              <th>Satuan</th>
              <th className="r">@Harga</th>
              <th className="r">Diskon</th>
              <th className="r">Total harga</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l, i) => (
              <tr key={i} className="align-top">
                <td className="min-w-[220px] !whitespace-normal">
                  {l.kind === 'SKU' ? (
                    <>
                      {skuOf.get(l.sku)?.label ?? <span className="neg">SKU tidak ada di master</span>}
                      <div className="ps">{l.sku} · persediaan</div>
                    </>
                  ) : (
                    <>
                      <input className="txtin" aria-label="Nama barang" value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} placeholder="Nama barang" />
                      {isInv && (
                        <select className="txtin mt-1" aria-label="Akun" value={l.account} onChange={(e) => setLine(i, { account: e.target.value })}>
                          {accounts.map(([v, lbl]) => (
                            <option key={v} value={v}>
                              {lbl}
                            </option>
                          ))}
                        </select>
                      )}
                    </>
                  )}
                </td>
                <td>
                  <input type="number" inputMode="decimal" min={0} step="any" className="qin" aria-label="Kuantitas" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
                </td>
                <td>
                  <input className="qin !w-[70px] !text-left" aria-label="Satuan" value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} />
                </td>
                <td>
                  <input type="number" inputMode="decimal" min={0} step="any" className="qin !w-[110px]" aria-label="Harga" value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} />
                </td>
                <td>
                  <input type="number" inputMode="decimal" min={0} step="any" className="qin" aria-label="Diskon (Rp)" placeholder="Rp" value={l.disc} onChange={(e) => setLine(i, { disc: e.target.value })} />
                </td>
                <td className="r">{rp(n(l.qty) * n(l.price) - n(l.disc))}</td>
                <td>
                  <button type="button" className="linkbtn" onClick={() => set({ lines: d.lines.filter((_, j) => j !== i) })}>
                    Hapus
                  </button>
                </td>
              </tr>
            ))}
            {!d.lines.length && (
              <tr>
                <td colSpan={7} className="text-muted">
                  Belum ada barang.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="buytot mt-3">
        <div>
          <span>Sub total</span>
          <b>{rp(t.sub)}</b>
        </div>
        <div>
          <span>
            Diskon{' '}
            <button type="button" className="chip chip-ch cursor-pointer" onClick={() => set({ discIsPct: !d.discIsPct })} aria-label="Ganti diskon Rp / %">
              {d.discIsPct ? '%' : 'Rp'}
            </button>
          </span>
          <input type="number" inputMode="decimal" min={0} step="any" className="qin !w-[120px]" aria-label="Diskon" value={d.discValue} onChange={(e) => set({ discValue: e.target.value })} />
        </div>
        {isInv && (
          <div>
            <span>Ongkir / biaya lain (masuk ke persediaan)</span>
            <input type="number" inputMode="decimal" min={0} step="any" className="qin !w-[120px]" aria-label="Ongkir" value={d.extra} onChange={(e) => set({ extra: e.target.value })} />
          </div>
        )}
        <div>
          <span>Total</span>
          <b>{rp(t.total)}</b>
        </div>
      </div>
      {isInv && d.lines.some((l) => l.kind === 'SKU') && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="chk">
            <input type="checkbox" checked={d.received} onChange={(e) => set({ received: e.target.checked })} /> Barang SKU sudah diterima, catat sebagai barang masuk di Operasional
            (stok & HPP ikut terupdate)
          </label>
          {d.received && (
            <label className="field">
              <span>Diterima di gudang</span>
              <select value={d.warehouseId} onChange={(e) => set({ warehouseId: e.target.value })}>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      <label className="field mt-3">
        <span>Catatan</span>
        <input value={d.note} onChange={(e) => set({ note: e.target.value })} />
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
