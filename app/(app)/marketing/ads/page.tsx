import type { Metadata } from 'next';
import { requireArea } from '@/lib/auth/guard';
import Link from 'next/link';
import { ActBtn } from '@/components/ActBtn';
import { AutoForm } from '@/components/AutoForm';
import { Kpi } from '@/components/Kpi';
import { one, qs, type SP } from '@/components/qs';
import { todayKey } from '@/lib/date';
import { prisma } from '@/lib/db';
import { pc, rp, rpS, xx } from '@/lib/format';
import { adsAction, adsWeekly, roasOf, SEVERITY_ORDER, type AdsLevel } from '@/lib/marketing';
import type { CatalogAgg } from '@/lib/marketplace';
import { dateKey } from '@/lib/repo/convert';
import { fmtRange } from '../../marketplace/view';
import { deleteAdLog } from '../actions';
import { DaysField, PageHead, StoreField } from '../ui';
import { loadMkBase, mkPair, parseDays, short, storeId, type MkBase } from '../view';
import { LogForm } from './LogForm';

export const metadata: Metadata = { title: 'Ads · Cuan Lens' };

const TABS: [string, string][] = [
  ['rekap', 'Rekap & performa'],
  ['week', 'Saran weekly'],
  ['month', 'Saran monthly'],
  ['log', 'Log perubahan'],
];
const LEVELS: AdsLevel[] = ['Pause', 'Stop', 'Kurangi', 'Jaga', 'Tambah sedikit', 'Scale'];
const fdate = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  await requireArea('MARKETING');
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === one(sp, 'tab')) ? one(sp, 'tab') : 'rekap';
  const b = await loadMkBase();
  const head = (
    <>
      <PageHead title="Ads" sub="Dari laporan iklan di menu Data. Saran dihitung per katalog memakai ROAS iklan dibanding ROAS impas." />
      <div className="seg mt-4">
        {TABS.map(([k, l]) => (
          <Link key={k} href={qs({ store: sp.store }, { tab: k === 'rekap' ? null : k })} aria-pressed={tab === k} scroll={false}>
            {l}
          </Link>
        ))}
      </div>
    </>
  );
  if (tab === 'log') return <div className="panel">{head}<LogTab sp={sp} b={b} /></div>;
  if (!b.data.ads.length)
    return (
      <div className="panel">
        {head}
        <p className="note mt-4">Belum ada laporan iklan. Upload di menu Data → Laporan iklan.</p>
      </div>
    );
  return <div className="panel">{head}{tab === 'rekap' ? <Rekap sp={sp} b={b} /> : <Advice sp={sp} b={b} days={tab === 'week' ? 7 : 30} />}</div>;
}

function Rekap({ sp, b }: { sp: SP; b: MkBase }) {
  const days = parseDays(sp);
  const store = storeId(sp, b);
  const { R } = mkPair(b, days, store);
  const c = R.catalogs.filter((x) => x.ads > 0).sort((a, z) => z.ads - a.ads);
  const spend = c.reduce((a, x) => a + x.ads, 0);
  const sales = c.reduce((a, x) => a + x.adSales, 0);
  const W = adsWeekly(b.data.ads, b.data.stores, store);
  return (
    <>
      <AutoForm>
        <DaysField days={days} />
        <StoreField value={store} stores={b.stores} />
      </AutoForm>
      <div className="kps">
        <Kpi label="Biaya iklan" value={rpS(spend)} />
        <Kpi label="Penjualan dari iklan" value={rpS(sales)} />
        <Kpi label="ROAS iklan" value={xx(spend ? sales / spend : NaN)} />
        <Kpi label="ACOS" value={pc(sales ? spend / sales : NaN)} />
        <Kpi label="Katalog beriklan" value={c.length} />
        <Kpi label="Katalog rugi karena iklan" value={c.filter((x) => x.net < 0).length} cls="bad" />
      </div>
      {W.length > 0 && (
        <>
          <h3 className="dh">Performa mingguan</h3>
          <div className="chart max-w-[820px]">
            <Weekly W={W} />
          </div>
          <div className="legend-inline">
            <span>
              <i style={{ background: 'var(--c-ads)' }} />
              Biaya iklan
            </span>
            <span>
              <i style={{ background: 'var(--ink)' }} />
              ROAS iklan (angka)
            </span>
          </div>
        </>
      )}
      <h3 className="dh">Rekap per katalog</h3>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Katalog</th>
              <th>Toko</th>
              <th className="r">Biaya</th>
              <th className="r">Penjualan iklan</th>
              <th className="r">ROAS iklan</th>
              <th className="r">ROAS impas</th>
              <th className="r">Laba bersih</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {c.map((x) => {
              const r = roasOf(x);
              return (
                <tr key={x.key}>
                  <td className="min-w-[220px] !whitespace-normal">{short(x.name, 70)}</td>
                  <td>{x.storeName}</td>
                  <td className="r">{rp(x.ads)}</td>
                  <td className="r">{rp(x.adSales)}</td>
                  <td className={`r ${Number.isFinite(x.be) && r < x.be ? 'neg' : 'pos'}`}>{xx(r)}</td>
                  <td className="r">{Number.isFinite(x.be) ? xx(x.be) : 'rugi'}</td>
                  <td className={`r ${x.net < 0 ? 'neg' : 'pos'}`}>{rp(x.net)}</td>
                  <td>{x.net < 0 ? <span className="chip chip-bad">Rugi</span> : r >= x.be * 1.5 ? <span className="chip chip-ok">Sangat baik</span> : <span className="chip chip-ch">Wajar</span>}</td>
                </tr>
              );
            })}
            {!c.length && (
              <tr>
                <td colSpan={8} className="text-muted">
                  Tidak ada iklan di periode ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Weekly({ W }: { W: ReturnType<typeof adsWeekly> }) {
  const mxS = Math.max(1, ...W.map((w) => w[1].spend));
  const mxR = Math.max(1, ...W.map((w) => (w[1].spend ? w[1].sales / w[1].spend : 0)));
  const CW = 640;
  const CH = 220;
  const bw = (CW - 60) / Math.max(1, W.length);
  return (
    <svg viewBox={`0 0 ${CW} ${CH}`} role="img" aria-label="Biaya iklan dan ROAS per minggu">
      {W.map((w, i) => {
        const h = (w[1].spend / mxS) * (CH - 50);
        const x = 40 + i * bw;
        const ro = w[1].spend ? w[1].sales / w[1].spend : 0;
        const y = CH - 28 - (ro / mxR) * (CH - 60);
        return (
          <g key={w[0]}>
            <rect x={x + bw * 0.15} y={CH - 28 - h} width={bw * 0.7} height={h} rx="3" fill="var(--c-ads)" opacity=".75">
              <title>{`Minggu ${w[0]}: ${rp(w[1].spend)} · ROAS ${xx(ro)}`}</title>
            </rect>
            <circle cx={x + bw / 2} cy={y} r="4" fill="var(--ink)" />
            <text x={x + bw / 2} y={y - 8} fontSize="10" textAnchor="middle" fill="var(--ink)">
              {ro.toFixed(1)}
            </text>
            <text x={x + bw / 2} y={CH - 10} fontSize="10" textAnchor="middle" fill="var(--muted)">
              {new Date(w[0] + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Advice({ sp, b, days }: { sp: SP; b: MkBase; days: number }) {
  const store = storeId(sp, b);
  const { cur, R, P } = mkPair(b, days, store);
  const pm: Record<string, CatalogAgg> = {};
  for (const x of P.catalogs) pm[x.key] = x;
  const rows = R.catalogs
    .filter((x) => x.ads > 0)
    .map((x) => ({ x, s: adsAction(x, pm[x.key], days) }))
    .sort((a, z) => SEVERITY_ORDER[a.s.cls] - SEVERITY_ORDER[z.s.cls] || z.x.ads - a.x.ads);
  return (
    <>
      <AutoForm>
        <StoreField value={store} stores={b.stores} />
        <p className="note !mb-2">
          {fmtRange(cur)} dibanding {days} hari sebelumnya.
        </p>
      </AutoForm>
      <div className="kps">
        {LEVELS.map((l) => {
          const n = rows.filter((r) => r.s.lvl === l).length;
          return n ? <Kpi key={l} label={l} value={n} cls={l === 'Scale' || l === 'Tambah sedikit' ? 'ok' : l === 'Jaga' ? 'mid' : 'bad'} /> : null;
        })}
      </div>
      <div className="tbl-wrap mt-4">
        <table className="tbl">
          <thead>
            <tr>
              <th>Katalog</th>
              <th>Toko</th>
              <th className="r">Biaya/hari</th>
              <th className="r">ROAS iklan</th>
              <th className="r">Tren</th>
              <th className="r">ROAS impas</th>
              <th>Saran {days === 7 ? 'minggu ini' : 'bulan ini'}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ x, s }) => {
              const note = `${s.lvl}: ${s.a}`;
              return (
                <tr key={x.key} className="align-top">
                  <td className="min-w-[200px] !whitespace-normal">{short(x.name, 70)}</td>
                  <td>{x.storeName}</td>
                  <td className="r">{rp(s.daily)}</td>
                  <td className="r">{xx(s.r)}</td>
                  <td className={`r ${s.tr === null ? '' : s.tr < 0 ? 'neg' : 'pos'}`}>{s.tr === null ? '–' : (s.tr > 0 ? '▲ ' : '▼ ') + pc(Math.abs(s.tr), 0)}</td>
                  <td className="r">{Number.isFinite(s.be) ? xx(s.be) : 'rugi'}</td>
                  <td className="min-w-[300px] !whitespace-normal">
                    <span className={`chip chip-${s.cls}`}>{s.lvl}</span> {s.a}
                  </td>
                  <td>
                    <Link className="btn-ghost btn-sm" href={qs({}, { tab: 'log', lstore: x.storeId, lcat: x.catalogKey, ltype: /budget/i.test(note) ? 'Budget harian' : 'Target ROAS', lnote: note })}>
                      Catat
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="text-muted">
                  Tidak ada katalog beriklan di periode ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="note">Saran bersifat bertahap. Ubah budget maksimal ±30% sekali, tunggu 3–4 hari sebelum ubah lagi supaya algoritma iklan stabil.</p>
    </>
  );
}

async function LogTab({ sp, b }: { sp: SP; b: MkBase }) {
  const lf = b.stores.some((s) => s.id === one(sp, 'lf')) ? one(sp, 'lf') : '';
  const [catalogs, logs] = await Promise.all([
    prisma.catalog.findMany({ select: { storeId: true, externalKey: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.adChangeLog.findMany({
      where: lf ? { storeId: lf } : {},
      include: { store: { select: { name: true } }, catalog: { select: { name: true } }, createdBy: { select: { name: true } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    }),
  ]);
  const lstore = b.stores.some((s) => s.id === one(sp, 'lstore')) ? one(sp, 'lstore') : (b.stores[0]?.id ?? '');
  return (
    <>
      {b.stores.length ? (
        <LogForm
          key={JSON.stringify([one(sp, 'lstore'), one(sp, 'lcat'), one(sp, 'lnote')])}
          stores={b.stores}
          catalogs={catalogs.map((c) => ({ storeId: c.storeId, key: c.externalKey, name: c.name }))}
          init={{ date: todayKey(), storeId: lstore, catalogKey: one(sp, 'lcat'), type: one(sp, 'ltype'), note: one(sp, 'lnote') }}
        />
      ) : (
        <p className="note mt-4">Buat toko dulu di Data → Import / export.</p>
      )}
      <h3 className="dh">Riwayat perubahan</h3>
      <AutoForm className="tablebar">
        <StoreField name="lf" value={lf} stores={b.stores} />
      </AutoForm>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Toko</th>
              <th>Katalog</th>
              <th>Perubahan</th>
              <th>Catatan</th>
              <th>Oleh</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {logs.map((x) => (
              <tr key={x.id} className="align-top">
                <td>{fdate(dateKey(x.date))}</td>
                <td>{x.store?.name ?? ''}</td>
                <td className="max-w-[260px] !whitespace-normal">{x.catalog ? short(x.catalog.name, 60) : 'Semua iklan'}</td>
                <td>
                  <b className="font-semibold">{x.type}</b>
                  {(x.fromValue || x.toValue) && (
                    <div className="ps">
                      {x.fromValue || '–'} → {x.toValue || '–'}
                    </div>
                  )}
                </td>
                <td className="max-w-[300px] !whitespace-normal">{x.note}</td>
                <td>{x.createdBy?.name ?? ''}</td>
                <td>
                  <ActBtn action={deleteAdLog} input={{ id: x.id }} confirm="Hapus log ini?">
                    Hapus
                  </ActBtn>
                </td>
              </tr>
            ))}
            {!logs.length && (
              <tr>
                <td colSpan={7} className="text-muted">
                  Belum ada log.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
