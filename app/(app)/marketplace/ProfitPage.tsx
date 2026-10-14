import { AutoForm } from '@/components/AutoForm';
import { Empty } from '@/components/Kpi';
import { one, type SP } from '@/components/qs';
import { filterProfitRows, profitTotals, type TableFlag } from '@/lib/marketplace';
import { MpFilters } from './MpFilters';
import { ProfitTable } from './ProfitTable';
import { toProfitRow } from './rows';
import { loadMpView, MP_KEYS } from './view';

const FLAGS: [TableFlag | '', string][] = [
  ['', 'Semua'],
  ['rugi', 'Laba minus saja'],
  ['target', 'Di bawah target margin'],
  ['hpp', 'HPP belum diisi'],
  ['iklan', 'Ada biaya iklan'],
];

/** Halaman Katalog & Per SKU: filter di URL dihitung di server, tabel hanya mengurutkan & membuka rincian. */
export async function ProfitPage({ kind, sp }: { kind: 'kat' | 'sku'; sp: SP }) {
  const v = await loadMpView(sp);
  const noun = kind === 'kat' ? 'katalog' : 'SKU';
  const f = { q: one(sp, 'q'), min: one(sp, 'min'), max: one(sp, 'max'), flag: one(sp, 'flag') as TableFlag | '' };
  if (!FLAGS.some(([k]) => k === f.flag)) f.flag = '';
  const list = v.R ? filterProfitRows<(typeof v.R.catalogs)[number] | (typeof v.R.skus)[number]>(kind === 'kat' ? v.R.catalogs : v.R.skus, f, v.target) : [];
  const query: Record<string, string> = {};
  for (const k of MP_KEYS) if (one(sp, k)) query[k] = one(sp, k);
  return (
    <>
      <MpFilters v={v} />
      <div className="panel">
        <h2 className="text-lg">{kind === 'kat' ? 'Profit per katalog' : 'Profit per SKU'}</h2>
        <p className="sub">
          {kind === 'kat'
            ? 'Satu katalog = satu listing produk di marketplace, sama dengan unit iklan Shopee. Klik baris untuk rincian variasi, iklan, dan potongan.'
            : 'Gabungan semua katalog tempat SKU itu dijual. Iklan katalog dibagi ke SKU sesuai porsi omzet SKU di katalog tersebut.'}
        </p>
        <AutoForm reset={['open']}>
          <label className="field min-w-[200px] flex-1">
            <span>Cari</span>
            <input type="search" name="q" defaultValue={f.q} placeholder={`Nama ${noun} atau SKU`} />
          </label>
          <label className="field">
            <span>Margin min (%)</span>
            <input type="number" name="min" defaultValue={f.min} className="w-[110px]" />
          </label>
          <label className="field">
            <span>Margin maks (%)</span>
            <input type="number" name="max" defaultValue={f.max} className="w-[110px]" />
          </label>
          <label className="field">
            <span>Tampilkan</span>
            <select name="flag" defaultValue={f.flag}>
              {FLAGS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </AutoForm>
        {v.R ? (
          <ProfitTable kind={kind} rows={list.map((p) => toProfitRow(p, v.target))} totals={profitTotals(list)} query={query} open={one(sp, 'open') ? [one(sp, 'open')] : []} />
        ) : (
          <Empty title="Belum ada data pesanan">
            <p>Impor master SKU, export pesanan, laporan penghasilan, dan laporan iklan di halaman Data.</p>
          </Empty>
        )}
      </div>
    </>
  );
}
