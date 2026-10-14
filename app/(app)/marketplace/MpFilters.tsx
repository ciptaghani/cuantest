import { AutoForm } from '@/components/AutoForm';
import type { MpView } from './view';

const PERIODS: [string, string][] = [
  ['1', 'Hari terakhir'],
  ['7', '7 hari'],
  ['30', '30 hari'],
  ['all', 'Semua'],
  ['custom', 'Pilih tanggal'],
];

/** Filter periode / channel / brand / toko (sama dengan bar filter di HTML). */
export function MpFilters({ v }: { v: MpView }) {
  const { q } = v;
  const range = v.R?.range;
  return (
    <AutoForm className="tablebar mb-4 mt-0">
      <div className="field">
        <span>Periode</span>
        <div className="seg" role="radiogroup" aria-label="Periode">
          {PERIODS.map(([val, label]) => (
            <label key={val}>
              <input type="radio" name="p" value={val} defaultChecked={q.period === val} />
              {label}
            </label>
          ))}
        </div>
      </div>
      {q.period === 'custom' && (
        <>
          <label className="field">
            <span>Dari</span>
            <input type="date" name="from" defaultValue={q.from || range?.[0]} />
          </label>
          <label className="field">
            <span>Sampai</span>
            <input type="date" name="to" defaultValue={q.to || range?.[1]} />
          </label>
        </>
      )}
      <label className="field">
        <span>Channel</span>
        <select name="ch" defaultValue={q.channel}>
          <option value="">Semua channel</option>
          <option value="shopee">Shopee</option>
          <option value="tiktok">TikTok Shop</option>
        </select>
      </label>
      <label className="field">
        <span>Brand</span>
        <select name="brand" defaultValue={q.brand}>
          <option value="">Semua brand</option>
          {v.brands.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Toko</span>
        <select name="store" defaultValue={q.storeId} key={v.storeOpts.map((s) => s.id).join()}>
          <option value="">Semua toko</option>
          {v.storeOpts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
    </AutoForm>
  );
}
