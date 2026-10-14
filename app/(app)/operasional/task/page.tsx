import type { Metadata } from 'next';
import { requireArea } from '@/lib/auth/guard';
import Link from 'next/link';
import { AutoForm } from '@/components/AutoForm';
import { Kpi } from '@/components/Kpi';
import { one, qs, type SP } from '@/components/qs';
import { formatNumber as NF, n0, n2 } from '@/lib/format';
import { avgDaily, brandsOf, fullsizeNeeds, leadTimeLabel, taskRows, type TaskPriority, type TaskRow } from '@/lib/ops';
import { getOpsModel } from '@/lib/repo/ops';
import { PageHead } from '../../marketing/ui';
import { BrandField, matchQ, NoMaster, SearchField, SkuCell } from '../ui';

export const metadata: Metadata = { title: 'Task produksi · Cuan Lens' };

const PRIO: Record<TaskPriority, ['bad' | 'mid' | 'ok' | 'ch', string, number]> = {
  high: ['bad', 'Tinggi', 0],
  mid: ['mid', 'Sedang', 1],
  ok: ['ok', 'Aman', 3],
  none: ['ch', 'Belum ada histori', 2],
};
const PRIO_OPTS: [string, string][] = [
  ['urgent', 'Tinggi + sedang'],
  ['high', 'Tinggi'],
  ['mid', 'Sedang'],
  ['ok', 'Aman'],
  ['none', 'Belum ada histori'],
  ['all', 'Semua'],
];
const LIMIT = 400;

function FsStatus({ r }: { r: TaskRow }) {
  switch (r.fsSt) {
    case 'nosrc':
      return <span className="chip chip-ch">Tidak ada sumber fullsize</span>;
    case 'norule':
      return <span className="chip chip-mid">Rasio belum ada</span>;
    case 'ok':
      return <span className="chip chip-ok">Cukup</span>;
    case 'kurang':
      return <span className="chip chip-bad">Perlu restock fullsize</span>;
    default:
      return <span className="text-muted">–</span>;
  }
}

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  await requireArea('OPS');
  const sp = await searchParams;
  const m = await getOpsModel();
  if (!Object.keys(m.skuMap).length) return <NoMaster />;

  const rows = taskRows(m);
  const c: Record<TaskPriority, number> = { high: 0, mid: 0, ok: 0, none: 0 };
  for (const r of rows) c[r.prio]++;
  const noSrc = rows.filter((r) => !r.fs).length;
  const need = rows.reduce((a, r) => a + r.kurang, 0);
  const fsl = fullsizeNeeds(m, rows);
  const fsShort = fsl.filter((f) => f.short > 0).length;
  const { span, ok, mode } = avgDaily(m);

  const view = one(sp, 'view') === 'fullsize' ? 'fullsize' : 'decant';
  const prio = PRIO_OPTS.some(([k]) => k === one(sp, 'prio')) ? one(sp, 'prio') : 'urgent';
  const brand = one(sp, 'brand');
  const q = one(sp, 'q');

  const basis =
    mode === 'LOG'
      ? `penjualan ${span} hari terakhir`
      : mode === 'MAX'
        ? 'nilai tertinggi antara histori & penjualan terbaru'
        : 'histori penjualan' + (m.historyLabel ? ` (${m.historyLabel})` : '');

  return (
    <div className="panel">
      <PageHead
        title="Task produksi decant"
        sub={
          <>
            Target stok = rata-rata jual harian × {m.targetDays} hari. Rata-rata dari {basis}
            {mode !== 'HISTORY' && !ok ? ' (data penjualan baru belum cukup 7 hari, sementara pakai histori)' : ''}.
          </>
        }
      />
      <div className="kps">
        <Kpi label="Prioritas tinggi" value={c.high} cls="bad" href={qs(sp, { prio: 'high', view: null })} on={view === 'decant' && prio === 'high'} />
        <Kpi label="Prioritas sedang" value={c.mid} cls="mid" href={qs(sp, { prio: 'mid', view: null })} on={view === 'decant' && prio === 'mid'} />
        <Kpi label="Aman" value={c.ok} cls="ok" href={qs(sp, { prio: 'ok', view: null })} on={view === 'decant' && prio === 'ok'} />
        <Kpi label="Belum ada histori" value={c.none} href={qs(sp, { prio: 'none', view: null })} on={view === 'decant' && prio === 'none'} />
        <Kpi label="Total pcs harus diproduksi" value={NF(need)} />
        <Kpi label="Fullsize perlu restock" value={fsShort} cls={fsShort ? 'bad' : ''} href={qs(sp, { view: 'fullsize' })} on={view === 'fullsize'} />
        <Kpi label="Decant tanpa sumber fullsize" value={noSrc} />
      </div>

      <div className="seg mt-4">
        <Link href={qs(sp, { view: null })} aria-pressed={view === 'decant'} scroll={false}>
          Daftar kerja decant
        </Link>
        <Link href={qs(sp, { view: 'fullsize' })} aria-pressed={view === 'fullsize'} scroll={false}>
          Kebutuhan botol fullsize
        </Link>
      </div>
      <AutoForm>
        {view === 'decant' && (
          <label className="field">
            <span>Prioritas</span>
            <select name="prio" defaultValue={prio}>
              {PRIO_OPTS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        )}
        <BrandField value={brand} brands={brandsOf(m)} />
        <SearchField value={q} />
      </AutoForm>

      {view === 'fullsize' ? (
        <FullsizeTable fsl={fsl.filter((f) => (!brand || f.s?.brand === brand) && matchQ(q, f.sku, f.s?.product ?? ''))} leadTimes={m.leadTimes} />
      ) : (
        <DecantTable
          rows={rows
            .filter((r) => (prio === 'all' || (prio === 'urgent' ? r.prio === 'high' || r.prio === 'mid' : r.prio === prio)) && (!brand || r.brand === brand) && matchQ(q, r.code, r.product, r.brand))
            .sort((a, b) => PRIO[a.prio][2] - PRIO[b.prio][2] || b.kurang - a.kurang || a.brand.localeCompare(b.brand))}
        />
      )}
    </div>
  );
}

function DecantTable({ rows }: { rows: TaskRow[] }) {
  return (
    <>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Prioritas</th>
              <th>Produk decant</th>
              <th className="r">Stok</th>
              <th className="r">Jual/hari</th>
              <th className="r">Target stok</th>
              <th className="r">Reorder point</th>
              <th className="r">Harus diproduksi</th>
              <th>Sumber fullsize</th>
              <th className="r">Rasio/botol</th>
              <th className="r">Botol perlu</th>
              <th>Status fullsize</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, LIMIT).map((r) => (
              <tr key={r.code}>
                <td>
                  <span className={`chip chip-${PRIO[r.prio][0]}`}>{PRIO[r.prio][1]}</span>
                </td>
                <td>
                  <SkuCell s={r} />
                </td>
                <td className={`r ${r.stock < 0 ? 'neg' : ''}`}>{n0(r.stock)}</td>
                <td className="r">{r.a ? n2(r.a) : '0'}</td>
                <td className="r">{r.min}</td>
                <td className="r">{r.rop}</td>
                <td className="r">
                  <b>{r.kurang || '–'}</b>
                </td>
                <td>{r.fs && <div className="ps">{`${r.fs} · stok ${n0(r.fsStock ?? 0)}`}</div>}</td>
                <td className="r">{r.r || '–'}</td>
                <td className="r">{r.need ?? '–'}</td>
                <td>
                  <FsStatus r={r} />
                </td>
                <td>
                  {r.fs && r.kurang > 0 && (
                    <Link className="btn-ghost btn-sm" href={`/operasional/produksi?src=${encodeURIComponent(r.fs)}${r.need ? `&bottles=${r.need}` : ''}`}>
                      Catat
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={12} className="text-muted">
                  Tidak ada decant di filter ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > LIMIT && (
        <p className="note">
          Menampilkan {LIMIT} dari {rows.length}. Persempit dengan filter.
        </p>
      )}
    </>
  );
}

function FullsizeTable({ fsl, leadTimes }: { fsl: ReturnType<typeof fullsizeNeeds>; leadTimes: Record<string, number | null> }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Fullsize sumber</th>
            <th className="r">Stok botol</th>
            <th className="r">Botol dibutuhkan</th>
            <th className="r">Kurang botol</th>
            <th className="r">Lead time</th>
            <th>Untuk decant</th>
          </tr>
        </thead>
        <tbody>
          {fsl.map((f) => (
            <tr key={f.sku}>
              <td>{f.s ? <SkuCell s={f.s} /> : f.sku}</td>
              <td className="r">{n0(f.stock)}</td>
              <td className="r">{f.need}</td>
              <td className={`r ${f.short ? 'neg' : 'pos'}`}>
                <b>{f.short || 'Cukup'}</b>
              </td>
              <td className="r">{leadTimeLabel(f.s ? leadTimes[f.s.brand] : null)}</td>
              <td className="!whitespace-normal">
                {f.list.map((r) => (
                  <span key={r.code} className={`chip chip-${PRIO[r.prio][0]} mr-0.5`}>
                    {r.ml}ml ×{r.kurang}
                  </span>
                ))}
              </td>
            </tr>
          ))}
          {!fsl.length && (
            <tr>
              <td colSpan={6} className="text-muted">
                Tidak ada kebutuhan botol fullsize.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
