'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoadState, useApi, useOpsModel } from '@/components/useApi';
import { ActBtn } from '@/components/ActBtn';
import { AutoForm } from '@/components/AutoForm';
import { one, type SP } from '@/components/qs';
import { n0, pc } from '@/lib/format';
import type { OpsModel } from '@/lib/ops';
import type { MovementLogRow } from '@/lib/repo/ops';
import { deleteMovement } from '../actions';
import { fdate, matchQ, NoMaster, RangeFields, rangeOf, SearchField, SkuDatalist, skuOptions } from '../ui';
import { ProdForm } from './ProdForm';

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
  const { m, error: mErr, loading: mLoad } = useOpsModel();
  const { today, from, to } = rangeOf(sp, 7);
  const hist = useApi<MovementLogRow[]>(`/api/ops/movements?types=PRODUCTION,SHIFT&from=${from}&to=${to}`);
  const loading = mLoad || hist.loading;
  const error = mErr || hist.error;
  if (loading || error || !m || !hist.data) return <LoadState loading={loading} error={error} what="produksi" />;
  return <Produksi sp={sp} m={m} today={today} from={from} to={to} all={hist.data} />;
}

function Produksi({ sp, m, today, from, to, all }: { sp: SP; m: OpsModel; today: string; from: string; to: string; all: MovementLogRow[] }) {
  if (!Object.keys(m.skuMap).length) return <NoMaster />;
  const q = one(sp, 'q');
  const hist = all.filter((e) => matchQ(q, e.sourceSku ?? '', ...e.lines.map((o) => o.sku), e.note));
  const src = one(sp, 'src');
  const srcCat = m.skuMap[src]?.category;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <SkuDatalist id="dl-fs" opts={skuOptions(m, (s) => s.category === 'Fullsize')} />
      <SkuDatalist id="dl-gs" opts={skuOptions(m, (s) => s.category === 'Fullsize' || s.category === 'Decant')} />
      <SkuDatalist id="dl-all" opts={skuOptions(m)} />
      <div className="panel self-start">
        <h2 className="text-lg">Produksi</h2>
        <ProdForm
          key={`${src}|${one(sp, 'bottles')}`}
          warehouses={m.warehouses}
          init={{
            type: one(sp, 't') === 'geser' || (srcCat && srcCat !== 'Fullsize') ? 'SHIFT' : 'PRODUCTION',
            date: today,
            warehouseId: m.config.mainWarehouseId,
            src,
            bottles: /^\d+(\.\d+)?$/.test(one(sp, 'bottles')) ? one(sp, 'bottles') : '',
          }}
        />
      </div>
      <div className="panel">
        <h2 className="text-lg">Riwayat produksi</h2>
        <AutoForm>
          <RangeFields from={from} to={to} />
          <SearchField value={q} placeholder="SKU atau catatan" />
        </AutoForm>
        <ProdHistory m={m} rows={hist} />
        <p className="note">Yield ml = ml hasil ÷ ml sumber terpakai. Di atas 100% biasanya salah input qty.</p>
      </div>
    </div>
  );
}

function ProdHistory({ m, rows }: { m: OpsModel; rows: MovementLogRow[] }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Gudang</th>
            <th>Sumber</th>
            <th className="r">Qty sumber</th>
            <th>Hasil</th>
            <th className="r">Yield ml</th>
            <th>Catatan</th>
            <th>Oleh</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const s = e.sourceSku ? m.skuMap[e.sourceSku] : undefined;
            const mlIn = s ? e.sourceQty * s.ml : 0;
            const mlOut = e.lines.reduce((a, o) => a + o.qty * (m.skuMap[o.sku]?.ml ?? 0), 0);
            const y = mlIn ? mlOut / mlIn : NaN;
            return (
              <tr key={e.id} className="align-top">
                <td>{fdate(e.date)}</td>
                <td>{m.whName(e.warehouseId)}</td>
                <td>
                  {e.type === 'SHIFT' && <span className="chip chip-mid mr-1">Geser</span>}
                  {e.sourceSku || '–'}
                </td>
                <td className="r">{n0(e.sourceQty)}</td>
                <td className="min-w-[160px] !whitespace-normal">
                  {e.lines.map((o) => (
                    <span key={o.sku} className="chip chip-ch mr-0.5">
                      {o.sku} ×{n0(o.qty)}
                    </span>
                  ))}
                </td>
                <td className={`r ${y > 1.02 ? 'neg' : y < 0.85 ? 'wrn' : ''}`}>{Number.isFinite(y) ? pc(y, 0) : '–'}</td>
                <td className="max-w-[200px] !whitespace-normal">{e.note}</td>
                <td>{e.by}</td>
                <td>
                  <ActBtn action={deleteMovement} input={{ id: e.id }} confirm="Hapus catatan ini? Stok akan dihitung ulang.">
                    Hapus
                  </ActBtn>
                </td>
              </tr>
            );
          })}
          {!rows.length && (
            <tr>
              <td colSpan={9} className="text-muted">
                Belum ada catatan di periode ini.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
