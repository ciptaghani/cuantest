'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoadState, useLoader, useOpsModel } from '@/components/useApi';
import { AutoForm } from '@/components/AutoForm';
import { Kpi } from '@/components/Kpi';
import { one, qs, type SP } from '@/components/qs';
import { formatNumber as NF, n0, n2, rpS } from '@/lib/format';
import { AGE_STATUS_LABEL, brandsOf, NO_SALE_DAYS, umurStok, type AgeStatus, type OpsModel } from '@/lib/ops';
import { PageHead } from '../../marketing/ui';
import { BrandField, CatField, CATS, limitOf, matchQ, MoreLink, NoMaster, SearchField, SkuCell } from '../ui';

const ST: Record<AgeStatus, 'bad' | 'mid' | 'ch' | 'ok'> = { restock: 'bad', produksi: 'mid', sales: 'ch', safe: 'ok' };
const ORD: Record<AgeStatus, number> = { restock: 0, produksi: 1, sales: 2, safe: 3 };
const STATUSES = Object.keys(ST) as AgeStatus[];

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
  if (loading || error || !m) return <LoadState loading={loading} error={error} what="model operasional" />;
  return <UmurStok sp={sp} m={m} />;
}

function UmurStok({ sp, m }: { sp: SP; m: OpsModel }) {
  if (!Object.keys(m.skuMap).length) return <NoMaster />;
  const { rows: all, span } = umurStok(m);

  const stF = STATUSES.find((s) => s === one(sp, 'st')) ?? '';
  const cat = (CATS as readonly string[]).includes(one(sp, 'cat')) ? one(sp, 'cat') : '';
  const brand = one(sp, 'brand');
  const q = one(sp, 'q');
  const rows = all
    .filter((r) => (!stF || r.status === stF) && (!cat || r.category === cat) && (!brand || r.brand === brand) && matchQ(q, r.code, r.product, r.brand))
    .sort((a, b) => ORD[a.status] - ORD[b.status] || (a.status === 'sales' ? b.noSale - a.noSale : a.age - b.age));
  const val = rows.filter((r) => r.status === 'sales').reduce((a, r) => a + Math.max(0, r.stock) * r.cogs, 0);
  const lim = limitOf(sp);

  return (
    <div className="panel">
      <PageHead
        title="Umur stock"
        sub={`Umur stok = stok semua gudang ÷ rata-rata terjual per hari (penjualan ${span} hari terakhir, maks. 3 bulan). Untuk fullsize, pemakaian lewat decant ikut dihitung.`}
      />
      {span < NO_SALE_DAYS && (
        <div className="opbar mt-3">
          Data penjualan baru {span} hari. Status <b>Sales</b> (tidak terjual 3 minggu) baru bisa muncul setelah data mencapai {NO_SALE_DAYS} hari.
        </div>
      )}
      <div className="kps">
        {STATUSES.map((k) => (
          <Kpi key={k} label={AGE_STATUS_LABEL[k]} value={all.filter((r) => r.status === k).length} cls={ST[k] === 'ch' ? '' : ST[k]} href={qs(sp, { st: k, lim: null })} on={stF === k} />
        ))}
        <Kpi label="Nilai stok status Sales" value={rpS(val)} />
      </div>
      <AutoForm reset={['lim']}>
        <label className="field">
          <span>Status</span>
          <select name="st" defaultValue={stF}>
            <option value="">Semua</option>
            {STATUSES.map((k) => (
              <option key={k} value={k}>
                {AGE_STATUS_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <CatField value={cat} />
        <BrandField value={brand} brands={brandsOf(m)} />
        <SearchField value={q} />
      </AutoForm>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Produk</th>
              <th>Kategori</th>
              <th className="r">Stok</th>
              <th className="r">Terjual/hari</th>
              <th className="r">Umur stok</th>
              <th className="r">Terakhir terjual</th>
              <th>Status</th>
              <th>Saran</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, lim).map((r) => (
              <tr key={r.code} className="align-top">
                <td>
                  <SkuCell s={r} />
                </td>
                <td>{r.category}</td>
                <td className={`r ${r.stock <= 0 ? 'neg' : ''}`}>{n0(r.stock)}</td>
                <td className="r">{r.avg ? n2(r.avg) : '0'}</td>
                <td className="r">
                  <b>{r.stock <= 0 ? <span className="neg">Habis</span> : Number.isFinite(r.age) ? `${NF(Math.floor(r.age))} hari` : '∞'}</b>
                </td>
                <td className="r">{r.lastSale ? (r.noSale === 0 ? 'Hari ini' : `${r.noSale} hari lalu`) : <span className="text-muted">belum ada</span>}</td>
                <td>
                  <span className={`chip chip-${ST[r.status]}`}>{AGE_STATUS_LABEL[r.status]}</span>
                </td>
                <td className="min-w-[260px] !whitespace-normal">{r.saran}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="text-muted">
                  Tidak ada SKU di filter ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <MoreLink total={rows.length} limit={lim} href={qs(sp, { lim: 'all' })} />
      <p className="note">
        Restock = fullsize/barang beli yang stoknya habis atau cukup ≤ lead time + 7 hari. Produksi = decant yang stoknya habis atau cukup &lt; {m.targetDays} hari. Sales = ada stok tapi tidak terjual {NO_SALE_DAYS} hari atau lebih. SKU tanpa stok dan tanpa penjualan tidak ditampilkan.
      </p>
    </div>
  );
}
