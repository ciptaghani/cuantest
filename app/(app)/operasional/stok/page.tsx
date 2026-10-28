'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoadState, useOpsModel } from '@/components/useApi';
import Link from 'next/link';
import { AutoForm } from '@/components/AutoForm';
import { Kpi } from '@/components/Kpi';
import { Modal } from '@/components/Modal';
import { all, one, qs, type SP } from '@/components/qs';
import { addDays, isValidDateKey } from '@/lib/date';
import { n0, rp, rpS } from '@/lib/format';
import { brandsOf, bySkuOrder, hppCalc, mutasi, skuLabel, stockCalc, type OpsModel } from '@/lib/ops';
import { PageHead } from '../../marketing/ui';
import { BrandField, CatField, CATS, fdate, limitOf, matchQ, MoreLink, NoMaster, SearchField, SkuCell, SkuDatalist, skuOptions } from '../ui';

const SHOW: [string, string][] = [
  ['', 'Semua stok'],
  ['ready', 'Stok ready'],
  ['habis', 'Stok habis'],
  ['minus', 'Stok minus'],
];
const HIST_KEYS = { hist: null, hf: null, ht: null };

export default function Page() {
  return (
    <Suspense fallback={<p className="note mt-4">Memuat…</p>}>
      <Content />
    </Suspense>
  );
}

function Content() {
  const usp = useSearchParams();
  const sp: SP = Object.fromEntries(usp.entries());
  const { m, error, loading } = useOpsModel();
  if (loading || error || !m) return <LoadState loading={loading} error={error} what="stok" />;
  return <Stok sp={sp} m={m} />;
}

function Stok({ sp, m }: { sp: SP; m: OpsModel }) {
  if (!Object.keys(m.skuMap).length) return <NoMaster />;

  const picked = all(sp, 'wh').filter((id) => m.warehouses.some((w) => w.id === id));
  const sel = picked.length ? m.warehouses.map((w) => w.id).filter((id) => picked.includes(id)) : m.warehouses.map((w) => w.id);
  const multi = sel.length > 1;
  const { st, per, bases } = stockCalc(m, undefined, sel);
  const H = hppCalc(m);
  const blank = { base: 0, in: 0, use: 0, sold: 0, out: 0, now: 0 };
  let rows = Object.values(m.skuMap).map((s) => ({ ...s, ...(st[s.code] ?? blank), hpp: H[s.code]?.now ?? s.cogs }));
  const val = rows.reduce((a, r) => a + Math.max(0, r.now) * r.hpp, 0);
  const minus = rows.filter((r) => r.now < 0).length;
  const ready = rows.filter((r) => r.now > 0).length;
  const habis = rows.length - ready;
  const orphan = Object.keys(st).filter((s) => !m.skuMap[s]);

  const cat = (CATS as readonly string[]).includes(one(sp, 'cat')) ? one(sp, 'cat') : '';
  const brand = one(sp, 'brand');
  const show = SHOW.some(([k]) => k === one(sp, 'show')) ? one(sp, 'show') : '';
  const q = one(sp, 'q');
  rows = rows
    .filter(
      (r) =>
        (!cat || r.category === cat) &&
        (!brand || r.brand === brand) &&
        (show !== 'ready' || r.now > 0) &&
        (show !== 'habis' || r.now <= 0) &&
        (show !== 'minus' || r.now < 0) &&
        matchQ(q, r.code, r.product, r.brand),
    )
    .sort(bySkuOrder);
  const lim = limitOf(sp);
  const hist = one(sp, 'hist').trim();

  return (
    <div className="panel">
      <SkuDatalist id="dl-hist" opts={skuOptions(m)} />
      <PageHead
        title="Stok real-time"
        sub={`Stok per gudang = opname terakhir gudang itu + produksi & barang masuk − botol terpakai − barang keluar − terjual. Penjualan marketplace mengurangi ${m.whName(m.config.salesWarehouseId)}. HPP memakai HPP sekarang.`}
      />
      <AutoForm className="mt-4 flex flex-wrap items-center gap-2" reset={['lim']}>
        <span className="text-[12.5px] text-muted">Gudang ditampilkan</span>
        {m.warehouses.map((w) => {
          const on = sel.includes(w.id);
          const b = bases[w.id];
          return (
            <label key={w.id} className={`whchip ${on ? 'on' : ''}`}>
              <input type="checkbox" name="wh" value={w.id} defaultChecked={on} /> {w.name}
              <small>{b ? `opname ${fdate(b.date, { day: 'numeric', month: 'short' })}` : on ? 'belum opname' : ''}</small>
            </label>
          );
        })}
      </AutoForm>
      <div className="kps">
        <Kpi label="Nilai stok (HPP)" value={rpS(val)} />
        <Kpi label="SKU stok ready" value={ready} cls="ok" href={qs(sp, { show: 'ready', lim: null })} on={show === 'ready'} />
        <Kpi label="SKU stok habis" value={habis} href={qs(sp, { show: 'habis', lim: null })} on={show === 'habis'} />
        <Kpi label="SKU stok minus" value={minus} cls={minus ? 'bad' : ''} href={qs(sp, { show: 'minus', lim: null })} on={show === 'minus'} />
        <Kpi label="SKU di log tapi tidak di master" value={orphan.length} cls={orphan.length ? 'mid' : ''} />
      </div>

      <div className="toolbar">
        <div>
          <b>Riwayat stok</b>
          <div className="text-[13px] text-muted">Lihat mutasi masuk, keluar, dan saldo per SKU untuk gudang yang dicentang.</div>
        </div>
        <form method="get" className="flex flex-wrap items-center gap-2">
          {Object.entries(sp).flatMap(([k, v]) =>
            k in HIST_KEYS ? [] : (Array.isArray(v) ? v : v ? [v] : []).map((x, i) => <input key={`${k}${i}`} type="hidden" name={k} value={x} />),
          )}
          <input name="hist" list="dl-hist" className="txtin" style={{ width: 240 }} placeholder="Ketik SKU" aria-label="SKU" required />
          <button className="btn">Riwayat</button>
        </form>
      </div>

      <AutoForm reset={['lim']}>
        <CatField value={cat} />
        <BrandField value={brand} brands={brandsOf(m)} />
        <label className="field">
          <span>Tampilkan</span>
          <select name="show" defaultValue={show}>
            {SHOW.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <SearchField value={q} />
      </AutoForm>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Produk</th>
              <th>Kategori</th>
              <th className="r">Stok{multi ? ' total' : ''}</th>
              {multi &&
                sel.map((w) => (
                  <th key={w} className="r">
                    {m.whName(w)}
                  </th>
                ))}
              <th className="r">Opname</th>
              <th className="r">+ Masuk</th>
              <th className="r">− Terpakai</th>
              <th className="r">− Terjual</th>
              <th className="r">− Keluar</th>
              <th className="r">HPP</th>
              <th className="r">Nilai stok</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, lim).map((r) => (
              <tr key={r.code}>
                <td>
                  <SkuCell s={r} />
                </td>
                <td>{r.category}</td>
                <td className={`r ${r.now < 0 ? 'neg' : ''}`}>
                  <b>{n0(r.now)}</b>
                </td>
                {multi &&
                  sel.map((w) => {
                    const v = per[w]?.[r.code]?.now ?? 0;
                    return (
                      <td key={w} className={`r ${v < 0 ? 'neg' : v ? '' : 'text-muted'}`}>
                        {n0(v)}
                      </td>
                    );
                  })}
                <td className="r">{n0(r.base)}</td>
                <td className="r">{n0(r.in)}</td>
                <td className="r">{n0(r.use)}</td>
                <td className="r">{n0(r.sold)}</td>
                <td className="r">{n0(r.out)}</td>
                <td className="r">{rp(r.hpp)}</td>
                <td className="r">{rp(Math.max(0, r.now) * r.hpp)}</td>
                <td>
                  <Link className="btn-ghost btn-sm" href={qs(sp, { hist: r.code, hf: null, ht: null })} scroll={false}>
                    Riwayat
                  </Link>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={11 + (multi ? sel.length : 0)} className="text-muted">
                  Tidak ada SKU di filter ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <MoreLink total={rows.length} limit={lim} href={qs(sp, { lim: 'all' })} />
      {orphan.length > 0 && (
        <p className="note">
          SKU di penjualan/produksi tapi belum ada di master: {orphan.slice(0, 30).join(', ')}
          {orphan.length > 30 ? '…' : ''}
        </p>
      )}
      {hist && <HistModal m={m} sp={sp} sku={hist} whs={sel} />}
    </div>
  );
}

function HistModal({ m, sp, sku, whs }: { m: OpsModel; sp: SP; sku: string; whs: string[] }) {
  const s = m.skuMap[sku];
  const multi = whs.length > 1;
  const t = m.today;
  let from = one(sp, 'hf');
  let to = one(sp, 'ht');
  if (!isValidDateKey(from)) {
    const bs = whs
      .map((w) => m.opnames.filter((o) => o.final && o.warehouseId === w && o.date <= t).pop())
      .filter((o): o is NonNullable<typeof o> => !!o)
      .map((o) => o.date)
      .sort();
    from = bs.length ? addDays(bs[bs.length - 1], 1) : t.slice(0, 8) + '01';
    if (from > t) from = t;
  }
  if (!isValidDateKey(to)) to = t;
  const { open, rows } = mutasi(m, sku, from, to, whs);
  const tin = rows.reduce((a, r) => a + r.in, 0);
  const tout = rows.reduce((a, r) => a + r.out, 0);
  const fd = (d: string) => fdate(d, { day: '2-digit', month: 'short', year: 'numeric' });
  return (
    <Modal closeHref={qs(sp, HIST_KEYS)} labelledBy="histT">
      <h2 id="histT" className="pr-10 text-lg">
        Mutasi per barang
      </h2>
      <p className="sub">
        Dari {fd(from)} s/d {fd(to)} · {whs.map((w) => m.whName(w)).join(', ')}
      </p>
      <div className="mut-head">
        <div>
          <span>Kode barang</span>
          <b>{sku}</b>
        </div>
        <div>
          <span>Nama barang</span>
          <b>{s ? skuLabel(s) : 'Tidak ada di master'}</b>
        </div>
        <div>
          <span>Kategori</span>
          <b>{s ? s.category : '–'}</b>
        </div>
      </div>
      <AutoForm>
        <label className="field">
          <span>Dari</span>
          <input type="date" name="hf" defaultValue={from} />
        </label>
        <label className="field">
          <span>Sampai</span>
          <input type="date" name="ht" defaultValue={to} />
        </label>
        <p className="note !mb-2">Gudang mengikuti centang di halaman Stok real-time.</p>
      </AutoForm>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Tanggal</th>
              {multi && <th>Gudang</th>}
              <th>Deskripsi</th>
              <th className="r">Masuk</th>
              <th className="r">Keluar</th>
              <th className="r">Saldo</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td />
              {multi && <td />}
              <td>Saldo barang per {fd(addDays(from, -1))}</td>
              <td />
              <td />
              <td className="r">
                <b>{n0(open)}</b>
              </td>
            </tr>
            {rows.map((r, i) => (
              <tr key={i} className="align-top">
                <td>{fd(r.d)}</td>
                {multi && <td>{r.wh}</td>}
                <td className="min-w-[220px] !whitespace-normal">
                  {r.desc}
                  {r.note && <div className="ps">{r.note}</div>}
                </td>
                <td className="r">{n0(r.in)}</td>
                <td className="r">{n0(r.out)}</td>
                <td className={`r ${(r.saldo ?? 0) < 0 ? 'neg' : ''}`}>{n0(r.saldo ?? 0)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td />
                <td colSpan={multi ? 5 : 4} className="text-muted">
                  Tidak ada mutasi di periode ini.
                </td>
              </tr>
            )}
            <tr className="tot">
              <td />
              {multi && <td />}
              <td>Total</td>
              <td className="r">{n0(tin)}</td>
              <td className="r">{n0(tout)}</td>
              <td className="r">
                <b>{n0(open + tin - tout)}</b>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="note">Sumber mutasi: stock opname final, produksi, geser decant, barang masuk/keluar, pindah gudang, dan penjualan dari export pesanan. Retur tidak tercatat di sini.</p>
    </Modal>
  );
}
