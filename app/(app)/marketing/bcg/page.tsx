'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoadState, useLoader } from '@/components/useApi';
import { AutoForm } from '@/components/AutoForm';
import { Kpi } from '@/components/Kpi';
import { one, type SP } from '@/components/qs';
import { pc, rp } from '@/lib/format';
import { BCG_INFO, bcgItems, type BcgItem, type BcgQuadrant } from '@/lib/marketing';
import type { CatalogAgg, SkuAgg } from '@/lib/marketplace';
import { fmtRange } from '../../marketplace/view';
import { DaysField, KindSeg, MkNoData, PageHead, StoreField } from '../ui';
import { loadMkBase, mkPair, parseDays, short, type MkBase } from '../view';

const ORDER: BcgQuadrant[] = ['star', 'cow', 'q', 'dog'];

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
  const key = usp.toString();
  const { data: b, error, loading } = useLoader<MkBase>(() => loadMkBase(), `bcg-${key}`);
  if (loading || error || !b) return <LoadState loading={loading} error={error} what="BCG matrix" />;
  return <Bcg sp={sp} b={b} />;
}

function Bcg({ sp, b }: { sp: SP; b: MkBase }) {
  if (!b.data.orders.length) return <MkNoData />;
  const kind = one(sp, 'kind') === 'sku' ? 'sku' : 'kat';
  const days = parseDays(sp);
  const store = b.stores.find((s) => s.id === one(sp, 'store'))?.id ?? b.stores[0]?.id ?? '';
  const { cur, R, P } = mkPair(b, days, store);
  const { items, shareLine: sx, growthLine: gy } = kind === 'kat' ? bcgItems<CatalogAgg | SkuAgg>(R.catalogs, P.catalogs) : bcgItems<CatalogAgg | SkuAgg>(R.skus, P.skus);

  return (
    <div className="panel">
      <PageHead
        title="BCG matrix"
        sub={`Pangsa = porsi omzet ${kind === 'kat' ? 'katalog' : 'SKU'} di tokonya (garis = rata-rata). Pertumbuhan = omzet ${fmtRange(cur)} dibanding ${days} hari sebelumnya (garis = 10%). Lingkaran merah = rugi.`}
        right={<KindSeg sp={sp} kind={kind} />}
      />
      <AutoForm>
        <DaysField days={days} />
        <StoreField value={store} stores={b.stores} all={false} />
      </AutoForm>
      {items.length > 0 && items.every((i) => i.isNew) && (
        <p className="opbar mt-3">
          Belum ada data penjualan di {days} hari sebelumnya, jadi pertumbuhan belum bisa dibandingkan dan semua item dianggap baru. Pilih periode yang lebih pendek atau tunggu data lebih panjang.
        </p>
      )}
      <div className="kps">
        {ORDER.map((k) => (
          <Kpi key={k} label={BCG_INFO[k].label} value={items.filter((i) => i.q === k).length} cls={BCG_INFO[k].cls === 'ch' ? '' : BCG_INFO[k].cls} />
        ))}
      </div>
      <div className="chart mt-4 max-w-[820px]">{items.length ? <Matrix items={items} sx={sx} gy={gy} /> : <p className="note">Belum ada penjualan di periode ini.</p>}</div>
      <div className="tbl-wrap mt-4">
        <table className="tbl">
          <thead>
            <tr>
              <th className="r">#</th>
              <th>Kuadran</th>
              <th>{kind === 'kat' ? 'Katalog' : 'SKU'}</th>
              <th className="r">Pangsa</th>
              <th className="r">Tumbuh</th>
              <th className="r">Omzet</th>
              <th className="r">Laba bersih</th>
              <th>Saran</th>
            </tr>
          </thead>
          <tbody>
            {items
              .map((i, n) => ({ i, n }))
              .sort((a, z) => ORDER.indexOf(a.i.q) - ORDER.indexOf(z.i.q) || z.i.x.omzet - a.i.x.omzet)
              .map(({ i, n }) => (
                <tr key={i.x.key} className="align-top">
                  <td className="r">{n + 1}</td>
                  <td>
                    <span className={`chip chip-${BCG_INFO[i.q].cls}`}>{BCG_INFO[i.q].label}</span>
                  </td>
                  <td className="min-w-[200px] !whitespace-normal">
                    {short(i.x.name, 70)}
                    {'sku' in i.x && <div className="ps">{i.x.sku}</div>}
                  </td>
                  <td className="r">{pc(i.share)}</td>
                  <td className={`r ${i.g < 0 ? 'neg' : 'pos'}`}>{i.isNew ? 'Baru' : pc(i.g, 0)}</td>
                  <td className="r">{rp(i.x.omzet)}</td>
                  <td className={`r ${i.x.net < 0 ? 'neg' : 'pos'}`}>{rp(i.x.net)}</td>
                  <td className="min-w-[280px] !whitespace-normal">
                    {BCG_INFO[i.q].advice}
                    {i.x.net < 0 && <span className="neg"> Saat ini rugi {rp(-i.x.net)}, perbaiki harga atau ROAS dulu.</span>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Matrix({ items, sx, gy }: { items: BcgItem<CatalogAgg | SkuAgg>[]; sx: number; gy: number }) {
  const W = 640;
  const H = 380;
  const pl = 50;
  const pr = 16;
  const pt = 16;
  const pb = 36;
  const mx = Math.max(sx * 2, ...items.map((i) => i.share)) * 1.08;
  const X = (v: number) => pl + (v / mx) * (W - pl - pr);
  const Y = (v: number) => pt + ((2 - v) / 3) * (H - pt - pb);
  const maxO = Math.max(1, ...items.map((i) => i.x.omzet));
  const box = (x1: number, y1: number, x2: number, y2: number, lab: string, color: string) => (
    <g key={lab}>
      <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} fill={`var(--${color})`} opacity=".35" />
      <text x={x1 + 8} y={y1 + 18} fontSize="12" fontWeight="700" fill="var(--ink)">
        {lab}
      </text>
    </g>
  );
  const midY = (pt + H - pb) / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="BCG matrix">
      {box(pl, pt, X(sx), Y(gy), 'Question mark', 'warn-bg')}
      {box(X(sx), pt, W - pr, Y(gy), 'Star', 'profit-bg')}
      {box(pl, Y(gy), X(sx), H - pb, 'Dog', 'loss-bg')}
      {box(X(sx), Y(gy), W - pr, H - pb, 'Cash cow', 'surf2')}
      <line x1={X(sx)} x2={X(sx)} y1={pt} y2={H - pb} stroke="var(--muted)" strokeDasharray="4 4" />
      <line x1={pl} x2={W - pr} y1={Y(gy)} y2={Y(gy)} stroke="var(--muted)" strokeDasharray="4 4" />
      {[-1, 0, 1, 2].map((v) => (
        <text key={v} x={pl - 6} y={Y(v) + 4} fontSize="10.5" textAnchor="end" fill="var(--muted)">
          {v > 0 ? '+' : ''}
          {v * 100}%
        </text>
      ))}
      <text x={(pl + W - pr) / 2} y={H - 8} fontSize="11" textAnchor="middle" fill="var(--muted)">
        Pangsa omzet di toko →
      </text>
      <text x="12" y={midY} fontSize="11" textAnchor="middle" fill="var(--muted)" transform={`rotate(-90 12 ${midY})`}>
        Pertumbuhan omzet →
      </text>
      {items.map((i, n) => (
        <g key={i.x.key}>
          <circle cx={X(i.share)} cy={Y(i.g)} r={5 + Math.sqrt(i.x.omzet / maxO) * 16} fill={i.x.net < 0 ? 'var(--loss)' : 'var(--profit)'} fillOpacity=".55" stroke="var(--ink)" strokeWidth="1">
            <title>{`${i.x.name} · pangsa ${pc(i.share)} · tumbuh ${pc(i.g, 0)} · laba ${rp(i.x.net)}`}</title>
          </circle>
          <text x={X(i.share)} y={Y(i.g) + 4} fontSize="10" textAnchor="middle" fill="var(--ink)" fontWeight="700">
            {n + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}
