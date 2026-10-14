import Link from 'next/link';
import { Empty } from '@/components/Kpi';
import { qs, type SP } from '@/components/qs';
import { DAY_OPTS } from './view';

/** Pilihan Katalog / SKU. */
export function KindSeg({ sp, kind }: { sp: SP; kind: 'kat' | 'sku' }) {
  return (
    <div className="seg">
      {(
        [
          ['kat', 'Katalog'],
          ['sku', 'SKU'],
        ] as const
      ).map(([k, l]) => (
        <Link key={k} href={qs(sp, { kind: k === 'kat' ? null : k, f: null })} aria-pressed={kind === k} scroll={false}>
          {l}
        </Link>
      ))}
    </div>
  );
}

export function DaysField({ days }: { days: number }) {
  return (
    <label className="field">
      <span>Periode</span>
      <select name="days" defaultValue={days}>
        {DAY_OPTS.map(([d, l]) => (
          <option key={d} value={d}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export function StoreField({ name = 'store', value, stores, all = true, label = 'Toko' }: { name?: string; value: string; stores: { id: string; name: string }[]; all?: boolean; label?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select name={name} defaultValue={value}>
        {all && <option value="">Semua toko</option>}
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function MkNoData() {
  return (
    <div className="panel">
      <Empty title="Belum ada data penjualan">
        <p>Marketing memakai data dari menu Marketplace. Upload export pesanan dan laporan iklan di menu Data.</p>
      </Empty>
    </div>
  );
}

export function PageHead({ title, sub, right }: { title: string; sub: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-lg">{title}</h2>
        <p className="sub">{sub}</p>
      </div>
      {right}
    </div>
  );
}
