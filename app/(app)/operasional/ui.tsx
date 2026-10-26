'use client';

import Link from 'next/link';
import { Empty } from '@/components/Kpi';
import { one, type SP } from '@/components/qs';
import { addDays, isValidDateKey, todayKey } from '@/lib/date';
import { norm } from '@/lib/parse';
import type { OpsModel, OpsSkuRow } from '@/lib/ops';
import { skuLabel } from '@/lib/ops';

export const CATS = ['Fullsize', 'Decant', 'Lainnya'] as const;

/** "5 Jan 2026" */
export const fdate = (d: string, opt: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(d + 'T00:00:00Z').toLocaleDateString('id-ID', { ...opt, timeZone: 'UTC' });

/** Cocokkan kata kunci ke kode/produk/brand. */
export const matchQ = (q: string, ...parts: string[]) => !q || norm(parts.join(' ')).includes(norm(q));

export function SkuCell({ s }: { s: Pick<OpsSkuRow, 'brand' | 'product' | 'ml' | 'code'> }) {
  return (
    <>
      <div className="pn">{skuLabel(s)}</div>
      <div className="ps">{s.code}</div>
    </>
  );
}

export function NoMaster() {
  return (
    <div className="panel">
      <Empty title="Master SKU belum ada">
        <p>Impor dulu master SKU di menu Data, lalu atur aturan konversi dan lead time di Master & aturan.</p>
        <Link href="/operasional/master" className="btn mt-3 inline-block">
          Buka Master & aturan
        </Link>
      </Empty>
    </div>
  );
}

/** Pilihan SKU untuk datalist (ketik SKU atau nama). */
export function skuOptions(m: OpsModel, filter?: (s: OpsSkuRow) => boolean) {
  return Object.values(m.skuMap)
    .filter((s) => !filter || filter(s))
    .map((s) => ({ code: s.code, label: `${s.brand} ${s.product} ${s.ml}ml` }));
}

export function CatField({ value }: { value: string }) {
  return (
    <label className="field">
      <span>Kategori</span>
      <select name="cat" defaultValue={value}>
        <option value="">Semua</option>
        {CATS.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
    </label>
  );
}

export function BrandField({ value, brands }: { value: string; brands: string[] }) {
  return (
    <label className="field">
      <span>Brand</span>
      <select name="brand" defaultValue={value}>
        <option value="">Semua brand</option>
        {brands.map((b) => (
          <option key={b}>{b}</option>
        ))}
      </select>
    </label>
  );
}

export function SearchField({ value, placeholder = 'Nama produk atau SKU', name = 'q' }: { value: string; placeholder?: string; name?: string }) {
  return (
    <label className="field min-w-[180px] flex-1">
      <span>Cari</span>
      <input type="search" name={name} defaultValue={value} placeholder={placeholder} />
    </label>
  );
}

export function SkuDatalist({ id, opts }: { id: string; opts: { code: string; label: string }[] }) {
  return (
    <datalist id={id}>
      {opts.map((o) => (
        <option key={o.code} value={o.code}>
          {o.label}
        </option>
      ))}
    </datalist>
  );
}

/** Periode riwayat dari URL `from`/`to` (default `days` hari terakhir). */
export function rangeOf(sp: SP, days: number) {
  const today = todayKey();
  const from = isValidDateKey(one(sp, 'from')) ? one(sp, 'from') : addDays(today, -(days - 1));
  const to = isValidDateKey(one(sp, 'to')) ? one(sp, 'to') : today;
  return { today, from, to };
}

export function RangeFields({ from, to }: { from: string; to: string }) {
  return (
    <>
      <label className="field">
        <span>Dari</span>
        <input type="date" name="from" defaultValue={from} />
      </label>
      <label className="field">
        <span>Sampai</span>
        <input type="date" name="to" defaultValue={to} />
      </label>
    </>
  );
}

/** Pilihan gudang untuk <select>. */
export function WhOptions({ m, all }: { m: Pick<OpsModel, 'warehouses'>; all?: string }) {
  return (
    <>
      {all !== undefined && <option value="">{all}</option>}
      {m.warehouses.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
    </>
  );
}

/** Batas baris tabel panjang: `?lim=all` menampilkan semua. */
export const limitOf = (sp: SP, def = 200) => (one(sp, 'lim') === 'all' ? Infinity : def);

/** Tombol "Tampilkan semua N" untuk tabel panjang. */
export function MoreLink({ total, limit, href }: { total: number; limit: number; href: string }) {
  if (total <= limit) return null;
  return (
    <Link href={href} scroll={false} className="btn-ghost mt-3 inline-block">
      Tampilkan semua {total}
    </Link>
  );
}
