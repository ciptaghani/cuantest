import type { Metadata } from 'next';
import { requireArea } from '@/lib/auth/guard';
import { AutoForm } from '@/components/AutoForm';
import { Kpi } from '@/components/Kpi';
import { one, qs, type SP } from '@/components/qs';
import { pc, rp, xx } from '@/lib/format';
import { mkAdvice, roasOf, SEVERITY_ORDER, type Advice, type Severity } from '@/lib/marketing';
import { marginClass, type Aggregate, type CatalogAgg, type SkuAgg } from '@/lib/marketplace';
import { fmtRange } from '../../marketplace/view';
import { DaysField, KindSeg, MkNoData, PageHead, StoreField } from '../ui';
import { loadMkBase, mkPair, mkStock, parseDays, short, storeId } from '../view';

export const metadata: Metadata = { title: 'Dashboard marketing · Cuan Lens' };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  await requireArea('MARKETING');
  const sp = await searchParams;
  const b = await loadMkBase();
  if (!b.data.orders.length) return <MkNoData />;
  const kind = one(sp, 'kind') === 'sku' ? 'sku' : 'kat';
  const days = parseDays(sp);
  const store = storeId(sp, b);
  const f = one(sp, 'f');
  const st = await mkStock();
  const { cur, R, P } = mkPair(b, days, store);
  const list: (CatalogAgg | SkuAgg)[] = kind === 'kat' ? R.catalogs : R.skus;
  const pm: Record<string, Aggregate> = {};
  for (const x of kind === 'kat' ? P.catalogs : P.skus) pm[x.key] = x;
  const rows = list.map((x) => ({ x, A: mkAdvice(x, pm[x.key], kind, days, st, b.target) })).filter((r) => r.A.length);
  const cnt: Record<string, number> = {};
  for (const r of rows) for (const a of r.A) cnt[a[0] + '|' + a[1]] = (cnt[a[0] + '|' + a[1]] || 0) + 1;
  const minSev = (A: Advice[]) => Math.min(...A.map((z) => SEVERITY_ORDER[z[0]]));
  const shown = rows.filter((r) => !f || r.A.some((a) => a[1] === f)).sort((a, z) => minSev(a.A) - minSev(z.A) || a.x.net - z.x.net);
  const kp = Object.entries(cnt).sort((a, z) => SEVERITY_ORDER[a[0].split('|')[0] as Severity] - SEVERITY_ORDER[z[0].split('|')[0] as Severity] || z[1] - a[1]);

  return (
    <div className="panel">
      <PageHead
        title="Dashboard marketing"
        sub={`Saran otomatis per ${kind === 'kat' ? 'katalog' : 'SKU'} dari penjualan, laba, iklan, dan stok. ${fmtRange(cur)} dibanding ${days} hari sebelumnya.`}
        right={<KindSeg sp={sp} kind={kind} />}
      />
      <AutoForm reset={[]}>
        <DaysField days={days} />
        <StoreField value={store} stores={b.stores} />
        <label className="field">
          <span>Masalah / peluang</span>
          <select name="f" defaultValue={f} key={kp.map((k) => k[0]).join()}>
            <option value="">Semua</option>
            {kp.map(([k]) => (
              <option key={k}>{k.split('|')[1]}</option>
            ))}
          </select>
        </label>
      </AutoForm>
      <div className="kps">
        {kp.length ? (
          kp.map(([k, n]) => {
            const [c, l] = k.split('|');
            return <Kpi key={k} label={l} value={n} cls={c as Severity} href={qs(sp, { f: f === l ? null : l })} on={f === l} />;
          })
        ) : (
          <Kpi label="Semua aman" value={0} cls="ok" />
        )}
      </div>
      <div className="tbl-wrap mt-4">
        <table className="tbl">
          <thead>
            <tr>
              <th>{kind === 'kat' ? 'Katalog' : 'SKU'}</th>
              <th>Toko</th>
              <th className="r">Omzet</th>
              <th className="r">Laba bersih</th>
              <th className="r">Margin</th>
              <th className="r">ROAS</th>
              <th>Masalah & saran</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 200).map(({ x, A }) => (
              <tr key={x.key} className="align-top">
                <td className="min-w-[200px] !whitespace-normal">
                  <b className="font-semibold">{short(x.name, 70)}</b>
                  {'sku' in x && <div className="ps">{x.sku}</div>}
                </td>
                <td>{x.storeName}</td>
                <td className="r">{rp(x.omzet)}</td>
                <td className={`r ${x.net < 0 ? 'neg' : 'pos'}`}>{rp(x.net)}</td>
                <td className={`r ${marginClass(x.margin, b.target)}`}>{pc(x.margin)}</td>
                <td className="r">{x.ads ? xx(roasOf(x)) : '–'}</td>
                <td className="min-w-[320px] !whitespace-normal">
                  {[...A]
                    .sort((a, z) => SEVERITY_ORDER[a[0]] - SEVERITY_ORDER[z[0]])
                    .map((a, i) => (
                      <div key={i} className="adv">
                        <span className={`chip chip-${a[0]}`}>{a[1]}</span> {a[2]}
                      </div>
                    ))}
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={7} className="text-muted">
                  Tidak ada temuan untuk filter ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {shown.length > 200 && <p className="note">Menampilkan 200 dari {shown.length}. Persempit dengan filter.</p>}
    </div>
  );
}
