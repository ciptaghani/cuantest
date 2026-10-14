import type { Metadata } from 'next';
import Link from 'next/link';
import { AutoForm } from '@/components/AutoForm';
import { Kpi } from '@/components/Kpi';
import { one, qs, type SP } from '@/components/qs';
import { requireArea } from '@/lib/auth/guard';
import { RESTOCK_PRIORITY, type RestockPriority } from '@/lib/finance';
import { formatNumber, n0, rp, rpS } from '@/lib/format';
import { BrandField, limitOf, MoreLink, NoMaster, SearchField } from '../../operasional/ui';
import { fdate } from '../ui';
import { PRIOS, restockRows } from './rows';

export const metadata: Metadata = { title: 'Schedule restock · Cuan Lens' };

const CHIP: Record<RestockPriority, 'bad' | 'mid' | 'ok' | 'ch'> = { kritis: 'bad', tinggi: 'bad', sedang: 'mid', rendah: 'ok', none: 'ch' };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  await requireArea('FINANCE');
  const sp = await searchParams;
  const { m, all, rows, span, cover, f } = await restockRows(sp);
  if (!Object.keys(m.skuMap).length) return <NoMaster />;
  const today = m.today;
  const brands = [...new Set(Object.values(m.skuMap).map((s) => s.brand))].filter(Boolean).sort();
  const sups = [...new Set(all.map((r) => r.supplier).filter(Boolean))].sort();
  const cnt = (k: RestockPriority) => rows.filter((r) => r.priority === k).length;
  const need = rows.filter((r) => r.need > 0);
  const lim = limitOf(sp, 300);

  return (
    <div className="panel">
      <h2 className="text-lg">Schedule restock</h2>
      <p className="sub">
        Dihitung dari penjualan {span} hari terakhir (maks. 3 bulan). Penjualan decant dikonversi ke kebutuhan botol fullsize sumbernya. Saran qty = kebutuhan selama lead time +{' '}
        {cover} hari − stok sekarang (semua gudang).
      </p>
      <div className="kps">
        {(['kritis', 'tinggi', 'sedang'] as const).map((k) => (
          <Kpi key={k} label={k === 'kritis' ? 'Kritis (stok habis)' : RESTOCK_PRIORITY[k].label} value={cnt(k)} cls={CHIP[k] === 'mid' ? 'mid' : 'bad'} href={qs(sp, { pr: f.pr === k ? null : k })} on={f.pr === k} />
        ))}
        <Kpi label="Estimasi biaya restock" value={rpS(need.reduce((a, r) => a + r.cost, 0))} />
      </div>
      <AutoForm>
        <BrandField value={f.brand} brands={brands} />
        <label className="field">
          <span>Supplier</span>
          <select name="sup" defaultValue={f.sup}>
            <option value="">Semua supplier</option>
            {sups.map((s) => (
              <option key={s}>{s}</option>
            ))}
            <option value="-">Belum ada supplier</option>
          </select>
        </label>
        <label className="field">
          <span>Prioritas</span>
          <select name="pr" defaultValue={f.pr}>
            <option value="">Semua</option>
            {PRIOS.map((p) => (
              <option key={p} value={p}>
                {RESTOCK_PRIORITY[p].label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Target stok (hari)</span>
          <input type="number" name="cover" min={1} max={365} defaultValue={cover} className="w-24" />
        </label>
        <SearchField value={f.q} />
        <label className="chk self-end pb-2">
          <input type="checkbox" name="all" value="1" defaultChecked={f.all} /> Tampilkan yang tidak laku
        </label>
      </AutoForm>
      {f.sup && f.sup !== '-' && need.length > 0 && (
        <div className="toolbar">
          <div>
            <b>
              {need.length} SKU dari {f.sup} perlu restock
            </b>
            <div className="ps">Estimasi {rp(need.reduce((a, r) => a + r.cost, 0))}</div>
          </div>
          <Link className="btn" href={`/finance/pembelian${qs(sp, { tab: 'po', edit: 'new', restock: '1' })}`}>
            Buat PO dari saran
          </Link>
        </div>
      )}
      <div className="tbl-wrap mt-3">
        <table className="tbl">
          <thead>
            <tr>
              <th>Prioritas</th>
              <th>Nama barang</th>
              <th>Brand</th>
              <th className="r">Stok sekarang</th>
              <th className="r">Terjual/hari</th>
              <th className="r">Cukup untuk</th>
              <th className="r">Lead time</th>
              <th>Restock paling lambat</th>
              <th className="r">Saran restock</th>
              <th>Supplier terakhir</th>
              <th className="r">Estimasi biaya</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, lim).map((r) => (
              <tr key={r.code}>
                <td>
                  <span className={`chip chip-${CHIP[r.priority]}`}>{RESTOCK_PRIORITY[r.priority].label}</span>
                </td>
                <td className="min-w-[180px] !whitespace-normal">
                  <b>
                    {r.product} {r.ml ? `${r.ml}ml` : ''}
                  </b>
                  <div className="ps">
                    {r.code} · {r.category}
                  </div>
                </td>
                <td>{r.brand}</td>
                <td className={`r ${r.stock <= 0 ? 'neg' : ''}`}>{n0(r.stock)}</td>
                <td className="r">
                  {r.avg ? r.avg.toFixed(2).replace('.', ',') : '0'}
                  {r.viaDecant > 0 && <div className="ps">termasuk dari decant</div>}
                </td>
                <td className={`r ${r.days <= 0 ? 'neg' : ''}`}>{Number.isFinite(r.days) ? (r.days <= 0 ? 'Habis' : `${Math.floor(r.days)} hari`) : '–'}</td>
                <td className="r">
                  {r.lt} hari{r.ltPolicy && <div className="ps">asumsi</div>}
                </td>
                <td>{r.when ? r.when <= today ? <b className="neg">Sekarang</b> : fdate(r.when) : '–'}</td>
                <td className="r">
                  <b>{r.need ? formatNumber(r.need) : '–'}</b>
                </td>
                <td>{r.supplier || <span className="text-muted">–</span>}</td>
                <td className="r">{r.need ? rp(r.cost) : ''}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={11} className="text-muted">
                  Tidak ada SKU di filter ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <MoreLink total={rows.length} limit={lim} href={qs(sp, { lim: 'all' })} />
      <p className="note">
        Supplier & harga diambil dari PO/faktur terakhir yang memuat SKU itu; kalau belum ada, harga memakai HPP master. Lead time brand &quot;kebijakan brand (99)&quot; diasumsikan 7
        hari. SKU decant tidak dibeli, jadi kebutuhannya dimasukkan ke botol fullsize sumbernya. Pilih satu supplier untuk membuat PO dari saran.
      </p>
    </div>
  );
}
