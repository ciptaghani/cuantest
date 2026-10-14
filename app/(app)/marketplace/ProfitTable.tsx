'use client';

import { Fragment, useEffect, useState } from 'react';
import { Msg, useAction } from '@/components/useAction';
import { pc, rp, xx } from '@/lib/format';
import { FEE_KEYS, FEE_LABELS } from '@/lib/marketplace/types';
import type { ProfitTotals } from '@/lib/marketplace/insights';
import { mpDetail, setSkuCogs } from './actions';
import type { CatalogDetail, FeeView, LineView, ProfitRow, SkuDetail } from './rows';

type Kind = 'kat' | 'sku';
type Col = { k: keyof ProfitRow; l: string; num?: boolean };

const COLS: Record<Kind, Col[]> = {
  kat: [
    { k: 'name', l: 'Katalog' },
    { k: 'qty', l: 'Qty', num: true },
    { k: 'omzet', l: 'Omzet', num: true },
    { k: 'hpp', l: 'HPP', num: true },
    { k: 'mp', l: 'Potongan', num: true },
    { k: 'ams', l: 'AMS', num: true },
    { k: 'ads', l: 'Iklan', num: true },
    { k: 'net', l: 'Laba bersih', num: true },
    { k: 'margin', l: 'Margin', num: true },
    { k: 'roasAd', l: 'ROAS iklan', num: true },
    { k: 'be', l: 'ROAS impas', num: true },
  ],
  sku: [
    { k: 'name', l: 'SKU' },
    { k: 'storeName', l: 'Toko' },
    { k: 'qty', l: 'Qty', num: true },
    { k: 'omzet', l: 'Omzet', num: true },
    { k: 'hpp', l: 'HPP', num: true },
    { k: 'mp', l: 'Potongan', num: true },
    { k: 'ams', l: 'AMS', num: true },
    { k: 'ads', l: 'Iklan', num: true },
    { k: 'net', l: 'Laba bersih', num: true },
    { k: 'margin', l: 'Margin', num: true },
  ],
};

const FEE_COLORS: Record<string, string> = { admin: '--c-fee', process: '--c-ord', freeShip: '--c-ong', service: '--c-lay', tax: '--c-tax', other: '--c-oth', ams: '--c-aff' };
const sortVal = (v: number) => (Number.isFinite(v) ? v : v === -Infinity ? -1e15 : 1e15);
const netCls = (n: number) => (n < 0 ? 'neg' : 'pos');

export function ProfitTable({ kind, rows, totals, query, open: initialOpen = [] }: { kind: Kind; rows: ProfitRow[]; totals: ProfitTotals; query: Record<string, string>; open?: string[] }) {
  const cols = COLS[kind];
  const [sort, setSort] = useState<{ k: keyof ProfitRow; dir: 1 | -1 }>({ k: 'net', dir: 1 });
  const [open, setOpen] = useState<Set<string>>(new Set(initialOpen));
  const sorted = [...rows].sort((a, b) => {
    const x = a[sort.k];
    const y = b[sort.k];
    return (typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : sortVal(x as number) - sortVal(y as number)) * sort.dir;
  });
  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const nc = cols.length + 1;
  const off = kind === 'kat' ? 1 : 2;

  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c.k}
                data-sort
                className={c.num ? 'r' : ''}
                aria-sort={sort.k === c.k ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}
                onClick={() => setSort((s) => (s.k === c.k ? { k: c.k, dir: s.dir === 1 ? -1 : 1 } : { k: c.k, dir: c.k === 'name' || c.k === 'storeName' ? 1 : -1 }))}
              >
                {c.l}
              </th>
            ))}
            <th>Catatan</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={nc} className="py-10 text-center text-muted">
                <b className="block text-ink">Tidak ada {kind === 'kat' ? 'katalog' : 'SKU'} yang cocok</b>
                Ubah kata kunci atau filter.
              </td>
            </tr>
          )}
          {sorted.map((p) => {
            const isOpen = open.has(p.key);
            const ch = <span className="chip chip-ch">{p.channel === 'shopee' ? 'Shopee' : 'TikTok'}</span>;
            return (
              <Fragment key={p.key}>
                <tr
                  className="row"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  onClick={() => toggle(p.key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggle(p.key);
                    }
                  }}
                >
                  <td>
                    <div className="pn">{p.name}</div>
                    <div className="ps">
                      {kind === 'kat' ? (
                        <>
                          {p.storeName} {ch} {p.sub}
                        </>
                      ) : (
                        p.sub
                      )}
                    </div>
                  </td>
                  {kind === 'sku' && (
                    <td>
                      {p.storeName} {ch}
                    </td>
                  )}
                  <td className="r">{p.qty}</td>
                  <td className="r">{rp(p.omzet)}</td>
                  <td className="r">{rp(p.hpp)}</td>
                  <td className="r">{rp(p.mp)}</td>
                  <td className="r">{rp(p.ams)}</td>
                  <td className="r">{rp(p.ads)}</td>
                  <td className={`r ${netCls(p.net)}`}>
                    <b>{rp(p.net)}</b>
                  </td>
                  <td className={`r ${p.mcls}`}>{pc(p.margin)}</td>
                  {kind === 'kat' && (
                    <>
                      <td className={`r ${Number.isFinite(p.roasAd) && Number.isFinite(p.be) ? (p.roasAd < p.be ? 'neg' : 'pos') : ''}`}>{xx(p.roasAd)}</td>
                      <td className="r">{Number.isFinite(p.be) ? xx(p.be) : p.ads ? <span className="neg">rugi</span> : '–'}</td>
                    </>
                  )}
                  <td>
                    {p.chips.map((c) => (
                      <span key={c.label} className={`chip chip-${c.cls} mr-0.5`}>
                        {c.label}
                      </span>
                    ))}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="detail">
                    <td colSpan={nc}>
                      <Detail kind={kind} rowKey={p.key} query={query} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {sorted.length > 0 && (
            <tr className="tot">
              <td colSpan={off}>
                Total {totals.n} {kind === 'kat' ? 'katalog' : 'SKU'}
              </td>
              <td className="r">{totals.qty}</td>
              <td className="r">{rp(totals.omzet)}</td>
              <td className="r">{rp(totals.hpp)}</td>
              <td className="r">{rp(totals.mp)}</td>
              <td className="r">{rp(totals.ams)}</td>
              <td className="r">{rp(totals.ads)}</td>
              <td className={`r ${netCls(totals.net)}`}>{rp(totals.net)}</td>
              <td className="r">{pc(totals.margin)}</td>
              <td colSpan={nc - off - 8} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Detail({ kind, rowKey, query }: { kind: Kind; rowKey: string; query: Record<string, string> }) {
  const [d, setD] = useState<CatalogDetail | SkuDetail | null>(null);
  const [err, setErr] = useState('');
  const q = JSON.stringify(query);
  useEffect(() => {
    let live = true;
    setD(null);
    mpDetail({ kind, key: rowKey, query: JSON.parse(q) }).then((r) => {
      if (!live) return;
      if (r.ok && r.data) setD(r.data);
      else setErr(r.ok ? 'Gagal memuat' : r.error);
    });
    return () => {
      live = false;
    };
  }, [kind, rowKey, q]);
  if (err) return <p className="px-4 py-3 text-loss">{err}</p>;
  if (!d) return <p className="px-4 py-3 text-muted">Memuat rincian…</p>;
  return (
    <div className="px-4 py-3">
      {d.kind === 'kat' ? (
        <>
          <p className="sub mb-1">
            {d.orderN} pesanan ·{' '}
            {d.ads
              ? `Iklan ${rp(d.ads)}${d.poolAds ? ` (termasuk ${rp(d.poolAds)} bagian iklan toko)` : ''} · penjualan dari iklan ${rp(d.adSales)} · ROAS iklan ${xx(d.roasAd)} · ROAS total ${xx(d.roas)} · ROAS impas ${Number.isFinite(d.be) ? xx(d.be) : 'tidak tercapai'}`
              : 'Tidak ada biaya iklan di periode ini.'}
          </p>
          {d.adNames.length > 0 && <p className="note !mt-0 mb-2.5">Iklan terhubung: {d.adNames.join('; ')}</p>}
          <h3 className="dh">Rincian per variasi</h3>
          <div className="tbl-wrap">
            <table className="tbl text-[13px]">
              <thead>
                <tr>
                  <th>Variasi / SKU</th>
                  <th className="r">Qty</th>
                  <th className="r">Omzet</th>
                  <th className="r">HPP</th>
                  <th className="r">Potongan</th>
                  <th className="r">AMS</th>
                  <th className="r">Iklan</th>
                  <th className="r">Laba bersih</th>
                  <th className="r">Margin</th>
                </tr>
              </thead>
              <tbody>
                {d.variations.map((r) => (
                  <tr key={r.sku}>
                    <td className="!whitespace-normal">
                      {r.name}
                      <div className="ps">
                        {r.sku}
                        {r.cogs !== null ? ' · HPP ' + rp(r.cogs) : <span className="neg"> · HPP kosong</span>}
                      </div>
                    </td>
                    <td className="r">{r.qty}</td>
                    <td className="r">{rp(r.omzet)}</td>
                    <td className="r">{rp(r.hpp)}</td>
                    <td className="r">{rp(r.mp)}</td>
                    <td className="r">{rp(r.ams)}</td>
                    <td className="r">{rp(r.ads)}</td>
                    <td className={`r ${netCls(r.net)}`}>{rp(r.net)}</td>
                    <td className={`r ${r.mcls}`}>{pc(r.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="dh">Rincian pengeluaran</h3>
          <Fees f={d.fees} />
          {d.worst.length > 0 && (
            <>
              <h3 className="dh">Pesanan dengan laba terendah</h3>
              <Lines ls={d.worst} />
            </>
          )}
        </>
      ) : (
        <>
          <p className="sub mb-2">
            {d.orderN} pesanan · iklan teralokasi {rp(d.ads)} · laba sebelum iklan {rp(d.preAds)}
          </p>
          <h3 className="dh">Dijual di katalog</h3>
          <div className="tbl-wrap">
            <table className="tbl text-[13px]">
              <thead>
                <tr>
                  <th>Katalog</th>
                  <th className="r">Qty</th>
                  <th className="r">Omzet</th>
                  <th className="r">Laba sblm iklan</th>
                </tr>
              </thead>
              <tbody>
                {d.catalogs.map((r, i) => (
                  <tr key={i}>
                    <td className="!whitespace-normal">{r.name}</td>
                    <td className="r">{r.qty}</td>
                    <td className="r">{rp(r.omzet)}</td>
                    <td className={`r ${r.pre < 0 ? 'neg' : ''}`}>{rp(r.pre)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="dh">Rincian pengeluaran</h3>
          <Fees f={d.fees} />
          <h3 className="dh">Pesanan{d.totalLines > 40 ? ' (40 laba terendah)' : ''}</h3>
          <Lines ls={d.lines} />
        </>
      )}
      {d.missingHpp.length > 0 && <HppFix skus={d.missingHpp} />}
    </div>
  );
}

function Fees({ f }: { f: FeeView }) {
  return (
    <div className="fee-mini">
      {FEE_KEYS.map((k) => (
        <div key={k} style={{ '--c': `var(${FEE_COLORS[k]})` } as React.CSSProperties}>
          <span className="dot" />
          <span className="min-w-0 flex-1">{FEE_LABELS[k]}</span>
          <b className="num whitespace-nowrap font-semibold">{rp(f[k])}</b>
          <small className="w-[46px] text-right text-muted">{pc(f.omzet ? f[k] / f.omzet : NaN)}</small>
        </div>
      ))}
    </div>
  );
}

function Lines({ ls }: { ls: LineView[] }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl text-[13px]">
        <thead>
          <tr>
            <th>No. pesanan</th>
            <th>Waktu</th>
            <th>SKU</th>
            <th className="r">Qty</th>
            <th className="r">Jual/pcs</th>
            <th className="r">HPP/pcs</th>
            <th className="r">Potongan</th>
            <th className="r">AMS</th>
            <th className="r">Laba sblm iklan</th>
            <th>Catatan</th>
          </tr>
        </thead>
        <tbody>
          {ls.map((l, i) => (
            <tr key={i} className={l.flags.some((f) => f[0] === 'bad') ? 'flag' : ''}>
              <td>{l.orderNo}</td>
              <td>{l.ts.replace('T', ' ')}</td>
              <td>{l.sku}</td>
              <td className="r">{l.qty}</td>
              <td className="r">{rp(l.unit)}</td>
              <td className="r">{l.cogs !== null ? rp(l.cogs) : '–'}</td>
              <td className="r">{rp(l.mp)}</td>
              <td className="r">{rp(l.ams)}</td>
              <td className={`r ${l.pre < 0 ? 'neg' : ''}`}>{rp(l.pre)}</td>
              <td>
                {l.flags.map((f) => (
                  <span key={f[1]} className={`chip mr-0.5 ${f[1] === 'Potongan estimasi' ? 'chip-ch' : `chip-${f[0]}`}`}>
                    {f[1]}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HppFix({ skus }: { skus: string[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      {skus.map((s) => (
        <HppInput key={s} sku={s} />
      ))}
    </div>
  );
}

function HppInput({ sku }: { sku: string }) {
  const [v, setV] = useState('');
  const { pending, msg, run } = useAction();
  return (
    <label className="field">
      <span>HPP {sku}</span>
      <span className="flex items-center gap-1.5">
        <input type="number" min={0} className="w-[120px]" value={v} onChange={(e) => setV(e.target.value)} onClick={(e) => e.stopPropagation()} />
        <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => setSkuCogs({ sku, cogs: v }))}>
          Simpan
        </button>
        <Msg msg={msg} />
      </span>
    </label>
  );
}
