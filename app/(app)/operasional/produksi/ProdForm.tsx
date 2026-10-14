'use client';

import { useEffect, useState } from 'react';
import { Msg, useAction } from '@/components/useAction';
import { formatNumber as NF, n0, pc } from '@/lib/format';
import type { SkuSnapshot } from '../logic';
import { saveProduction, skuSnapshot } from '../actions';

type PType = 'PRODUCTION' | 'SHIFT';
interface Extra {
  code: string;
  label: string;
  ml: number;
  stock: number;
}

export interface ProdInit {
  type: PType;
  date: string;
  warehouseId: string;
  src: string;
  bottles: string;
}

/** Input produksi decant / geser decant. Info SKU (stok, rasio, ml) diambil dari server. */
export function ProdForm({ warehouses, init }: { warehouses: { id: string; name: string }[]; init: ProdInit }) {
  const [type, setType] = useState<PType>(init.type);
  const [date, setDate] = useState(init.date);
  const [wh, setWh] = useState(init.warehouseId);
  const [src, setSrc] = useState(init.src);
  const [bottles, setBottles] = useState(init.bottles);
  const [outs, setOuts] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<Extra[]>([]);
  const [extraIn, setExtraIn] = useState('');
  const [note, setNote] = useState('');
  const [snap, setSnap] = useState<SkuSnapshot | null>(null);
  const [snapErr, setSnapErr] = useState('');
  const [refresh, setRefresh] = useState(0);
  const { pending, msg, setMsg, run } = useAction();
  const gs = type === 'SHIFT';

  useEffect(() => {
    const code = src.trim();
    setSnapErr('');
    if (!code) {
      setSnap(null);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      const r = await skuSnapshot({ sku: code, mode: type, warehouseId: wh });
      if (!alive) return;
      if (r.ok && r.data) setSnap(r.data);
      else {
        setSnap(null);
        setSnapErr(r.ok ? '' : r.error);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [src, type, wh, refresh]);

  const bad = snap && (gs ? !(snap.category === 'Decant' || snap.category === 'Fullsize') : snap.category !== 'Fullsize');
  const stockHere = snap?.stock.find((s) => s.id === wh)?.now ?? 0;
  const targets = snap?.targets ?? [];
  const rows = [...targets.map((t) => ({ code: t.code, label: t.label, ml: t.ml, ratio: t.ratio, stock: t.stock })), ...extra.filter((x) => !targets.some((t) => t.code === x.code)).map((x) => ({ ...x, ratio: 0 }))];
  const mlOf = (code: string) => rows.find((r) => r.code === code)?.ml ?? 0;
  const mlIn = (Number(bottles.replace(',', '.')) || 0) * (snap?.ml ?? 0);
  const mlOut = Object.entries(outs).reduce((a, [c, q]) => a + Math.max(0, Number(q) || 0) * mlOf(c), 0);
  const y = mlIn ? mlOut / mlIn : NaN;

  function switchType(t: PType) {
    if (t === type) return;
    setType(t);
    setSrc('');
    setBottles('');
    setOuts({});
    setExtra([]);
    setMsg(null);
  }

  async function addExtra() {
    const code = extraIn.trim();
    if (!code) return;
    const r = await skuSnapshot({ sku: code, mode: 'io' });
    if (!r.ok || !r.data) return setMsg({ ok: false, text: r.ok ? 'SKU tidak ada di master' : r.error });
    const d = r.data;
    setExtra((x) => [...x.filter((e) => e.code !== d.code), { code: d.code, label: d.label, ml: d.ml, stock: d.stock.find((s) => s.id === wh)?.now ?? 0 }]);
    setExtraIn('');
  }

  function save() {
    const list = Object.entries(outs)
      .map(([sku, q]) => ({ sku, qty: Number(q) || 0 }))
      .filter((o) => o.qty > 0 && rows.some((r) => r.code === o.sku));
    const b = Number(bottles.replace(',', '.')) || 0;
    if (snap && list.length) {
      if (!gs && !b && !window.confirm('Botol terpakai 0 (melanjutkan botol yang sudah terbuka). Lanjut simpan?')) return;
      if (b && mlOut > mlIn * 1.02 && !window.confirm(gs ? 'Hasil melebihi isi sumber. Tetap simpan?' : 'Hasil decant melebihi isi botol. Tetap simpan?')) return;
    }
    run(
      () => saveProduction({ type, date, warehouseId: wh, src: src.trim(), bottles: b, outs: list, note }),
      () => {
        setOuts({});
        setBottles('');
        setNote('');
        setRefresh((n) => n + 1);
      },
    );
  }

  return (
    <>
      <div className="seg mt-4">
        <button type="button" aria-pressed={type === 'PRODUCTION'} onClick={() => switchType('PRODUCTION')}>
          Produksi decant
        </button>
        <button type="button" aria-pressed={type === 'SHIFT'} onClick={() => switchType('SHIFT')}>
          Geser decant
        </button>
      </div>
      {gs && <p className="sub mt-3">Pindahkan isi dari satu ukuran ke ukuran lain dalam varian yang sama, mis. 10ml dipecah jadi 2ml. Sumber boleh decant atau fullsize.</p>}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <label className="field">
          <span>Tanggal</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
        <label className="field">
          <span>{gs ? 'SKU sumber (decant / fullsize)' : 'SKU fullsize sumber'}</span>
          <input
            list={gs ? 'dl-gs' : 'dl-fs'}
            value={src}
            onChange={(e) => {
              setSrc(e.target.value);
              setOuts({});
              setExtra([]);
            }}
            placeholder={gs ? 'mis. HMNS-PHILEA-10' : 'mis. HMNS-PHILEA-100'}
          />
        </label>
        <label className="field">
          <span>{gs ? 'Qty sumber dipakai (pcs)' : 'Botol terpakai'}</span>
          <input type="number" inputMode="decimal" step={gs ? 1 : 0.5} min={0} value={bottles} onChange={(e) => setBottles(e.target.value)} />
        </label>
      </div>
      {snap ? (
        <p className="note">
          {snap.label} · {snap.category} · stok di {warehouses.find((w) => w.id === wh)?.name}: {n0(stockHere)}
          {bad && <span className="neg"> · {gs ? 'hanya decant atau fullsize' : 'bukan SKU fullsize'}</span>}
        </p>
      ) : (
        src.trim() && snapErr && <p className="note neg">{snapErr}</p>
      )}
      {snap && (
        <>
          <div className="tbl-wrap mt-3">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{gs ? 'Hasil geser' : 'Decant dihasilkan'}</th>
                  <th className="r">Qty aktual</th>
                  <th className="r">Rasio/{gs && snap.category !== 'Fullsize' ? 'pcs' : 'botol'}</th>
                  <th className="r">Stok sekarang</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code}>
                    <td>
                      <div className="pn">{r.label}</div>
                      <div className="ps">{r.code}</div>
                    </td>
                    <td className="r">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        className="qin"
                        aria-label={`Qty ${r.code}`}
                        value={outs[r.code] ?? ''}
                        onChange={(e) => setOuts({ ...outs, [r.code]: e.target.value })}
                      />
                    </td>
                    <td className="r">{r.ratio || '–'}</td>
                    <td className="r">{n0(r.stock)}</td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={4} className="text-muted">
                      Tidak ada ukuran lain di varian ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!gs && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="field">
                <span>Tambah SKU hasil lain</span>
                <input list="dl-all" value={extraIn} onChange={(e) => setExtraIn(e.target.value)} style={{ width: 220 }} />
              </label>
              <button type="button" className="btn-ghost" onClick={addExtra}>
                Tambah
              </button>
            </div>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="yl">
              <span>ml sumber terpakai</span>
              <b className="num">{NF(mlIn)} ml</b>
            </div>
            <div className="yl">
              <span>ml hasil</span>
              <b className="num">{NF(mlOut)} ml</b>
            </div>
            <div className="yl">
              <span>Yield</span>
              <b className={`num ${y > 1.02 ? 'neg' : y < 0.85 ? 'wrn' : 'pos'}`}>{Number.isFinite(y) ? pc(y, 0) : '–'}</b>
            </div>
          </div>
          {y > 1.02 && <p className="note neg">Hasil lebih banyak dari isi sumber. Cek lagi qty.</p>}
        </>
      )}
      <label className="field mt-3">
        <span>Catatan</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="opsional" />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn" disabled={pending} onClick={save}>
          Simpan
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setSrc('');
            setBottles('');
            setOuts({});
            setExtra([]);
            setNote('');
            setMsg(null);
          }}
        >
          Kosongkan
        </button>
        <Msg msg={msg} />
      </div>
    </>
  );
}
