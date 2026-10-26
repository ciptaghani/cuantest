'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LoadState, useApi } from '@/components/useApi';
import { norm } from '@/lib/parse';
import { AdMatchRow } from './AdMatchRow';

const NF = new Intl.NumberFormat('id-ID');

interface AdMatching {
  stores: { id: string; name: string }[];
  storeId: string | null;
  ads: { adName: string; amount: number }[];
  maps: { adName: string; catalogKey: string; manual: boolean }[];
  catalogs: { externalKey: string; name: string }[];
}

/** Koreksi manual pencocokan nama iklan → katalog (sama seperti tabel pencocokan di menu Data versi HTML). */
export default function AdMatchPage() {
  return (
    <Suspense fallback={<p className="note mt-4">Memuat…</p>}>
      <Content />
    </Suspense>
  );
}

function Content() {
  const storeParam = useSearchParams().get('store') ?? '';
  const { data, error, loading } = useApi<AdMatching>(`/api/data/ad-matching${storeParam ? `?store=${storeParam}` : ''}`);

  if (loading || error || !data) return <LoadState loading={loading} error={error} what="data pencocokan" />;

  const { stores, storeId, ads, maps, catalogs } = data;
  const mapOf = new Map(maps.map((m) => [m.adName, m]));
  const rows = new Map<string, { key: string; name: string; amount: number }>();
  for (const a of ads) {
    const k = norm(a.adName);
    const r = rows.get(k) ?? { key: k, name: a.adName, amount: 0 };
    r.amount += a.amount;
    rows.set(k, r);
  }
  const list = [...rows.values()]
    .map((r) => {
      const m = mapOf.get(r.key);
      return { ...r, catalogKey: m?.catalogKey ?? '', manual: !!m?.manual };
    })
    .sort((a, b) => (a.catalogKey ? 1 : 0) - (b.catalogKey ? 1 : 0) || b.amount - a.amount);

  return (
    <div className="panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl">Pencocokan iklan</h2>
        <Link href="/data/import-export" className="btn-ghost btn-sm">
          ← Import / export
        </Link>
      </div>
      <p className="note !mt-0.5">
        Iklan Shopee berbasis katalog (listing). Nama iklan yang terpotong dicocokkan otomatis ke katalog; koreksi di sini kalau salah. Iklan yang belum cocok biayanya dibagi ke semua katalog toko sesuai porsi omzet.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {stores.map((s) => (
          <Link key={s.id} href={`?store=${s.id}`} className={`btn-sm ${s.id === storeId ? 'btn' : 'btn-ghost'}`}>
            {s.name}
          </Link>
        ))}
      </div>
      {list.length ? (
        <div className="tbl-wrap mt-3">
          <table className="tbl">
            <thead>
              <tr>
                <th>Nama iklan</th>
                <th className="!text-right">Total biaya</th>
                <th>Katalog</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <AdMatchRow key={r.key} storeId={storeId as string} adName={r.name} amount={`Rp${NF.format(Math.round(r.amount))}`} value={r.catalogKey} manual={r.manual} catalogs={catalogs.map((c) => ({ key: c.externalKey, name: c.name }))} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="note mt-3">Belum ada laporan iklan untuk toko ini.</p>
      )}
    </div>
  );
}
