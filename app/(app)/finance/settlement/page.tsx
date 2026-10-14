import type { Metadata } from 'next';
import Link from 'next/link';
import { AutoForm } from '@/components/AutoForm';
import { Empty, Kpi } from '@/components/Kpi';
import { one, qs, type SP } from '@/components/qs';
import { requireArea } from '@/lib/auth/guard';
import { LATE_DAYS, settlement, settlementSum } from '@/lib/finance';
import { formatNumber, rp, rpS } from '@/lib/format';
import { norm } from '@/lib/parse';
import { getMarketplace } from '@/lib/repo/marketplace';
import { limitOf, MoreLink, SearchField } from '../../operasional/ui';
import { fdate, PeriodBar, periodOf } from '../ui';

export const metadata: Metadata = { title: 'Settlement · Cuan Lens' };

const FILTERS: [string, string][] = [
  ['belum', 'Belum tersettle'],
  ['sudah', 'Sudah tersettle (periode ini)'],
  ['semua', 'Semua'],
];

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  await requireArea('FINANCE');
  const sp = await searchParams;
  const { today, from, to } = periodOf(sp);
  const mp = await getMarketplace();
  const stores = mp.data.stores.filter((s) => !s.isDemo);
  if (!stores.length)
    return (
      <div className="panel">
        <Empty title="Belum ada toko asli">
          <p>Upload export pesanan toko kamu di menu Data dulu. Toko data contoh tidak dihitung.</p>
        </Empty>
      </div>
    );
  const r = settlement(mp.data, mp.rates, from, to, today);
  const f = FILTERS.some(([k]) => k === one(sp, 'f')) ? one(sp, 'f') : 'belum';
  const store = stores.some((s) => s.id === one(sp, 'store')) ? one(sp, 'store') : '';
  const q = one(sp, 'q');
  const name = Object.fromEntries(stores.map((s) => [s.id, s.name]));
  const list = (f === 'sudah' ? r.settled : f === 'semua' ? [...r.settled, ...r.unsettled] : r.unsettled)
    .filter((o) => (!store || o.storeId === store) && (!q || norm(o.orderNo).includes(norm(q))))
    .sort((a, b) => (f === 'belum' ? b.age - a.age : b.periodDate.localeCompare(a.periodDate)));
  const lim = limitOf(sp, 300);

  return (
    <div className="panel">
      <h2 className="text-lg">Settlement</h2>
      <p className="sub">
        Pesanan dianggap sudah tersettle kalau sudah ada di laporan Penghasilan Shopee / settlement TikTok yang diupload di menu Data. Nilai settlement = total penghasilan dari laporan
        itu (atau omzet − potongan asli). Pesanan yang belum tersettle memakai estimasi potongan.
      </p>
      <PeriodBar sp={sp} from={from} to={to} />
      <div className="kps">
        <Kpi label="Sudah tersettle (periode ini)" value={rpS(settlementSum(r.settled))} cls="ok" href={qs(sp, { f: 'sudah' })} on={f === 'sudah'} />
        <Kpi label="Pesanan tersettle" value={formatNumber(r.settled.length)} />
        <Kpi label="Belum tersettle (real-time)" value={rpS(settlementSum(r.unsettled))} cls={r.unsettled.length ? 'mid' : ''} href={qs(sp, { f: null })} on={f === 'belum'} />
        <Kpi label="Pesanan belum tersettle" value={formatNumber(r.unsettled.length)} />
        <Kpi label={`Belum tersettle > ${LATE_DAYS} hari`} value={r.late.length ? `${r.late.length} · ${rpS(settlementSum(r.late))}` : 'Tidak ada'} cls={r.late.length ? 'bad' : ''} />
      </div>
      {r.noDate > 0 && (
        <p className="note">
          {r.noDate} pesanan tersettle tidak punya tanggal dana dilepas di file yang diupload, jadi dihitung memakai tanggal pesanan. Pilih kolom &quot;Tanggal dana dilepas&quot; saat
          upload laporan penghasilan supaya akurat.
        </p>
      )}

      <h3 className="dh">Per toko</h3>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Toko</th>
              <th className="r">Tersettle periode ini</th>
              <th className="r">Pesanan</th>
              <th className="r">Belum tersettle</th>
              <th className="r">Pesanan</th>
              <th className="r">Tertua</th>
            </tr>
          </thead>
          <tbody>
            {r.perStore.map((x) => (
              <tr key={x.store.id}>
                <td>
                  <Link href={qs(sp, { store: store === x.store.id ? null : x.store.id })} scroll={false}>
                    {x.store.name}
                  </Link>{' '}
                  <span className="chip chip-ch">{x.store.channel === 'shopee' ? 'Shopee' : 'TikTok'}</span>
                </td>
                <td className="r text-profit">{rp(x.settled)}</td>
                <td className="r">{formatNumber(x.settledN)}</td>
                <td className="r">{rp(x.unsettled)}</td>
                <td className="r">{formatNumber(x.unsettledN)}</td>
                <td className={`r ${x.oldest > LATE_DAYS ? 'neg' : ''}`}>{x.unsettledN ? `${x.oldest} hari` : '–'}</td>
              </tr>
            ))}
            <tr className="tot">
              <td>Total</td>
              <td className="r">{rp(settlementSum(r.settled))}</td>
              <td className="r">{formatNumber(r.settled.length)}</td>
              <td className="r">{rp(settlementSum(r.unsettled))}</td>
              <td className="r">{formatNumber(r.unsettled.length)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="dh">Daftar pesanan</h3>
      <AutoForm>
        <label className="field">
          <span>Status</span>
          <select name="f" defaultValue={f}>
            {FILTERS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Toko</span>
          <select name="store" defaultValue={store}>
            <option value="">Semua toko</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <SearchField value={q} placeholder="No. pesanan" />
      </AutoForm>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>No. pesanan</th>
              <th>Toko</th>
              <th>Tgl pesanan</th>
              <th>Tgl dana dilepas</th>
              <th className="r">Omzet</th>
              <th className="r">Potongan</th>
              <th className="r">Settlement</th>
              <th>Status</th>
              <th className="r">Umur</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, lim).map((o) => (
              <tr key={o.key}>
                <td>{o.orderNo}</td>
                <td>{name[o.storeId]}</td>
                <td>{fdate(o.date)}</td>
                <td>{o.settled && (o.settledAt ? fdate(o.settledAt) : <span className="text-muted">tidak ada</span>)}</td>
                <td className="r">{rp(o.sub)}</td>
                <td className="r">{rp(o.sub - o.net)}</td>
                <td className="r">
                  <b>{rp(o.net)}</b>
                  {!o.settled && <div className="ps">estimasi</div>}
                </td>
                <td>
                  {o.settled ? (
                    <span className="chip chip-ok">Tersettle</span>
                  ) : o.age > LATE_DAYS ? (
                    <span className="chip chip-bad">Belum · cek</span>
                  ) : (
                    <span className="chip chip-mid">Belum</span>
                  )}
                </td>
                <td className="r">{o.settled ? '' : `${o.age} hari`}</td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={9} className="text-muted">
                  Tidak ada pesanan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <MoreLink total={list.length} limit={lim} href={qs(sp, { lim: 'all' })} />
      <p className="note">
        Pesanan batal/retur tidak masuk daftar karena sudah dilewati saat impor export pesanan. Pesanan belum tersettle lebih dari {LATE_DAYS} hari biasanya perlu dicek: masih dalam
        pengiriman, komplain, atau belum ada di laporan yang diupload.
      </p>
    </div>
  );
}
