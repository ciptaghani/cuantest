'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LoadState, useLoader } from '@/components/useApi';
import { Empty } from '@/components/Kpi';
import { qs, type SP } from '@/components/qs';
import { formatNumber as NF, pc, rp, rpS, xx } from '@/lib/format';
import { chartSeries, FEE_KEYS, FEE_LABELS, marginClass, marketplaceAlerts, type CatalogAgg, type ComputeResult, type TotalAgg } from '@/lib/marketplace';
import { MpFilters } from '../MpFilters';
import { Delta, FEE_COLORS, netCls } from '../ui';
import { fmtRange, loadMpView, MP_KEYS, type MpView } from '../view';

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
  const { data: v, error, loading } = useLoader<MpView>(() => loadMpView(sp), `ringkasan-${key}`);
  if (loading || error || !v) return <LoadState loading={loading} error={error} what="ringkasan marketplace" />;
  return <Ringkasan sp={sp} v={v} />;
}

function Ringkasan({ sp, v }: { sp: SP; v: MpView }) {
  const keep: SP = Object.fromEntries(MP_KEYS.map((k) => [k, sp[k]]));
  if (!v.R || !v.P)
    return (
      <>
        <MpFilters v={v} />
        <div className="panel">
          <Empty title="Belum ada data pesanan">
            <p>Impor master SKU, export pesanan, laporan penghasilan, dan laporan iklan di halaman Data.</p>
            <Link href="/data/import-export" className="btn mt-3 inline-block">
              Buka Data
            </Link>
          </Empty>
        </div>
      </>
    );
  const { R, P, target } = v;
  const T = R.total;
  const pT = P.total;
  const sorted = [...R.catalogs].sort((a, b) => b.net - a.net);
  const top = sorted.filter((p) => p.net > 0).slice(0, 5);
  const bot = sorted
    .filter((p) => p.net < 0)
    .reverse()
    .slice(0, 5);
  const alerts = marketplaceAlerts(R, v.data);
  const mc = marginClass(T.margin, target);

  return (
    <>
      <MpFilters v={v} />
      <div className="panel px-4 py-5 sm:px-6 sm:py-6">
        <p className="sub">
          {fmtRange(R.range)} · {v.storeCount} toko · {pc(1 - T.estPct, 0)} potongan dari data asli
        </p>
        <h2 className="mt-1.5 max-w-[28ch] text-[clamp(22px,3.2vw,34px)] leading-tight">
          Dari omzet {rp(T.omzet)}, laba bersih kamu <span className={`num ${netCls(T.net)}`}>{rp(T.net)}</span>.
        </h2>
        <div className="mt-5 flex flex-wrap gap-x-9 gap-y-6">
          <Hero k="Omzet" v={rp(T.omzet)} d={<Delta cur={T.omzet} prev={pT.omzet} />} />
          <Hero k="Laba bersih" v={rp(T.net)} cls={netCls(T.net)} d={<Delta cur={T.net} prev={pT.net} />} />
          <Hero
            k={`Margin bersih (target ${target}%)`}
            v={pc(T.margin)}
            cls={mc}
            d={
              pT.omzet ? (
                <span className={`text-[12.5px] font-semibold ${T.margin >= pT.margin ? 'text-profit' : 'text-loss'}`}>
                  {T.margin >= pT.margin ? '▲' : '▼'} {Math.abs((T.margin - pT.margin) * 100).toFixed(1).replace('.', ',')} poin vs periode sebelumnya
                </span>
              ) : (
                <Delta cur={0} prev={0} />
              )
            }
          />
          <Hero k="Total pesanan" v={NF(T.orderN)} d={<Delta cur={T.orderN} prev={pT.orderN} />} />
          <Hero k="ROAS toko" v={xx(T.roas)} d={<span className="text-[12.5px] font-semibold text-muted">ROAS impas {Number.isFinite(T.be) ? xx(T.be) : 'tidak tercapai'}</span>} />
        </div>
        <div className="mt-6">
          <p className="sub mb-2">Ke mana omzet pergi</p>
          <FallBar T={T} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="panel chart">
          <h2 className="text-lg">Omzet vs laba bersih</h2>
          <LineChart R={R} />
          <div className="legend-inline">
            <span>
              <i style={{ background: 'var(--ink)' }} />
              Omzet
            </span>
            <span>
              <i style={{ background: 'var(--profit)' }} />
              Laba bersih
            </span>
            <span>
              <i style={{ background: 'var(--c-ads)' }} />
              Iklan
            </span>
          </div>
        </div>
        <div className="panel">
          <h2 className="text-lg">Biaya terbesar</h2>
          <p className="sub">Biaya di luar HPP, persen dari omzet</p>
          <Donut T={T} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="panel">
          <h2 className="text-lg">Katalog paling cuan</h2>
          <p className="sub">Laba bersih tertinggi setelah iklan katalog</p>
          <ul className="rank">{top.length ? top.map((p) => <RankItem key={p.key} p={p} target={target} href={`/marketplace/katalog${qs(keep, { open: p.key })}`} />) : <li className="sk">Belum ada katalog yang untung di periode ini.</li>}</ul>
        </div>
        <div className="panel">
          <h2 className="text-lg">Katalog bocor</h2>
          <p className="sub">Laba bersih paling minus</p>
          <ul className="rank">{bot.length ? bot.map((p) => <RankItem key={p.key} p={p} target={target} href={`/marketplace/katalog${qs(keep, { open: p.key })}`} />) : <li className="sk pos">Tidak ada katalog minus.</li>}</ul>
        </div>
        <div className="panel">
          <h2 className="text-lg">Perlu dicek</h2>
          <p className="sub">Temuan otomatis dari data periode ini</p>
          <div className="mt-3 flex flex-col gap-2.5">
            {alerts.map((a, i) => (
              <div key={i} className={`alert ${a.sev}`}>
                <div>
                  <b className="font-semibold">{a.title}</b> {a.detail}
                </div>
                {a.target && (
                  <Link
                    className="linkbtn"
                    href={a.target === 'data' ? (a.title.includes('iklan belum cocok') ? '/data/import-export/iklan' : '/data/import-export') : `/marketplace/${a.target}${qs(keep, { flag: a.flag })}`}
                  >
                    Lihat
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Hero({ k, v, d, cls = '' }: { k: string; v: string; d: React.ReactNode; cls?: string }) {
  return (
    <div>
      <div className="text-[13px] text-muted">{k}</div>
      <div className={`num font-display text-[22px] font-bold ${cls}`}>{v}</div>
      {d}
    </div>
  );
}

function FallBar({ T }: { T: TotalAgg }) {
  const segs: [string, number, string][] = [
    ['HPP', T.hpp, '--c-hpp'],
    ['Iklan', T.ads, '--c-ads'],
    ['Potongan marketplace', T.mp, '--c-fee'],
    ['Komisi AMS / affiliate', T.ams, '--c-aff'],
  ];
  const costs = segs.reduce((a, s) => a + s[1], 0);
  const base = Math.max(T.omzet, costs) || 1;
  const legend: [string, number, string][] = [...segs, ['Laba bersih', T.net, T.net < 0 ? '--loss' : '--profit']];
  return (
    <>
      <div className="fall-bar" role="img" aria-label={`Komposisi omzet: ${segs.map((s) => s[0] + ' ' + rp(s[1])).join(', ')}, laba bersih ${rp(T.net)}`}>
        {segs.map((s) => (
          <span key={s[0]} style={{ flex: `0 0 ${(s[1] / base) * 100}%`, background: `var(${s[2]})` }} title={`${s[0]} ${rp(s[1])}`} />
        ))}
        {T.net >= 0 && <span style={{ flex: `0 0 ${(T.net / base) * 100}%`, background: 'var(--profit)' }} title={`Laba bersih ${rp(T.net)}`} />}
        {T.net < 0 && <i className="omzet-mark" style={{ left: `${(T.omzet / base) * 100}%` }} />}
      </div>
      {T.net < 0 && <p className="note neg">Garis hitam = batas omzet. Biaya yang melewati garis itu adalah kerugian {rp(-T.net)}.</p>}
      <div className="fall-legend">
        {legend.map((s) => (
          <div key={s[0]} className="fl" style={{ '--c': `var(${s[2]})` } as React.CSSProperties}>
            <div className="text-[13px] text-muted">{s[0]}</div>
            <div className={`num font-semibold ${s[0] === 'Laba bersih' ? netCls(s[1]) : ''}`}>{rp(s[1])}</div>
            <div className="text-[12px] text-muted">{pc(T.omzet ? s[1] / T.omzet : NaN)} dari omzet</div>
          </div>
        ))}
      </div>
    </>
  );
}

const shortDate = (k: string) => new Date(k + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function LineChart({ R }: { R: ComputeResult }) {
  const s = chartSeries(R);
  const { keys, omzet: om, net, ads: ad } = s;
  const W = 640;
  const H = 230;
  const pl = 48;
  const pr = 26;
  const pt = 12;
  const pb = 26;
  const mx = Math.max(1, ...om, ...ad, ...net);
  const mn = Math.min(0, ...net);
  const x = (i: number) => pl + (keys.length < 2 ? 0 : (i * (W - pl - pr)) / (keys.length - 1));
  const y = (v: number) => pt + ((mx - v) / (mx - mn)) * (H - pt - pb);
  const path = (a: number[]) => a.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  const step = Math.ceil(keys.length / 8);
  return (
    <>
      <p className="sub">{s.hourly ? 'Per jam, ' + fmtRange(R.range) : 'Per hari'}</p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Grafik omzet dan laba bersih">
        {[0, 1, 2, 3, 4].map((i) => {
          const v = mn + ((mx - mn) * i) / 4;
          return (
            <g key={i}>
              <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--line)" />
              <text x={pl - 6} y={y(v) + 4} fontSize="10.5" textAnchor="end" fill="var(--muted)">
                {rpS(v)}
              </text>
            </g>
          );
        })}
        <line x1={pl} x2={W - pr} y1={y(0)} y2={y(0)} stroke="var(--muted)" />
        <path d={path(ad)} fill="none" stroke="var(--c-ads)" strokeWidth="1.5" strokeDasharray="4 4" />
        <path d={path(om)} fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinejoin="round" />
        <path d={path(net)} fill="none" stroke="var(--profit)" strokeWidth="2.2" strokeLinejoin="round" />
        {net.map((v, i) => (v < 0 ? <circle key={i} cx={x(i)} cy={y(v)} r="3" fill="var(--loss)" /> : null))}
        {keys.map((k, i) =>
          i % step === 0 || i === keys.length - 1 ? (
            <text key={i} x={x(i)} y={H - 6} fontSize="10.5" textAnchor="middle" fill="var(--muted)">
              {s.hourly ? k : shortDate(String(k))}
            </text>
          ) : null,
        )}
      </svg>
    </>
  );
}

function Donut({ T }: { T: TotalAgg }) {
  const items: [string, number, string][] = [['Iklan', T.ads, '--c-ads'] as [string, number, string], ...FEE_KEYS.map((c) => [FEE_LABELS[c], T[c], FEE_COLORS[c]] as [string, number, string])]
    .filter((i) => i[1] > 0)
    .sort((a, b) => b[1] - a[1]);
  const tot = items.reduce((a, i) => a + i[1], 0) || 1;
  const C = 2 * Math.PI * 52;
  let off = 0;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-[18px]">
      <svg viewBox="0 0 150 150" className="h-[150px] w-[150px] flex-none" role="img" aria-label="Komposisi biaya non-HPP">
        {items.map((i) => {
          const l = (i[1] / tot) * C;
          const el = <circle key={i[0]} cx="75" cy="75" r="52" fill="none" stroke={`var(${i[2]})`} strokeWidth="20" strokeDasharray={`${l} ${C - l}`} strokeDashoffset={-off} transform="rotate(-90 75 75)" />;
          off += l;
          return el;
        })}
        <text x="75" y="72" textAnchor="middle" fontSize="11" fill="var(--muted)">
          Total biaya
        </text>
        <text x="75" y="90" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--ink)" className="font-display">
          {rpS(tot)}
        </text>
      </svg>
      <div className="flex min-w-[180px] flex-1 flex-col gap-2">
        {items.map((i) => (
          <div key={i[0]} className="flex justify-between gap-2.5 text-[14px]" style={{ '--c': `var(${i[2]})` } as React.CSSProperties}>
            <span className="flex items-center gap-2">
              <i className="dot" />
              {i[0]}
            </span>
            <span className="num">
              {rp(i[1])} <small className="text-muted">{pc(T.omzet ? i[1] / T.omzet : NaN)}</small>
            </span>
          </div>
        ))}
        <p className="note">Total {pc(T.omzet ? tot / T.omzet : NaN)} dari omzet habis untuk potongan marketplace dan iklan.</p>
      </div>
    </div>
  );
}

function RankItem({ p, target, href }: { p: CatalogAgg; target: number; href: string }) {
  const short = p.name.length > 60 ? p.name.slice(0, 59) + '…' : p.name;
  return (
    <li>
      <Link href={href} className="flex w-full justify-between gap-3">
        <div>
          <div className="nm">{short}</div>
          <div className="sk">
            {p.storeName} · {p.qty} pcs · iklan {rp(p.ads)}
          </div>
        </div>
        <div className="val">
          <div className={`num ${netCls(p.net)}`}>{rp(p.net)}</div>
          <div className={`text-[12px] ${marginClass(p.margin, target)}`}>{pc(p.margin)}</div>
        </div>
      </Link>
    </li>
  );
}
