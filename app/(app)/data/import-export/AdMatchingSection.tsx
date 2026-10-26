'use client';

import { useState } from 'react';
import { LoadState, useApi } from '@/components/useApi';
import { norm } from '@/lib/parse';
import { AdMatchRow } from './iklan/AdMatchRow';

type Data = {
  stores: { id: string; name: string }[];
  storeId: string | null;
  ads: { adName: string; amount: number }[];
  maps: { adName: string; catalogKey: string; manual: boolean }[];
  catalogs: { externalKey: string; name: string }[];
};

export function AdMatchingSection() {
  const [store, setStore] = useState('');
  const { data, error, loading } = useApi<Data>(`/api/data/ad-matching${store ? `?store=${encodeURIComponent(store)}` : ''}`);
  if (loading || error || !data) return <div className="panel"><LoadState loading={loading} error={error} what="pencocokan iklan" /></div>;
  const mapOf = new Map(data.maps.map((m) => [m.adName, m]));
  const rows = new Map<string, { key: string; name: string; amount: number }>();
  for (const ad of data.ads) {
    const key = norm(ad.adName);
    const row = rows.get(key) ?? { key, name: ad.adName, amount: 0 };
    row.amount += ad.amount;
    rows.set(key, row);
  }
  const list = [...rows.values()].map((row) => ({ ...row, ...(mapOf.get(row.key) ?? { catalogKey: '', manual: false }) })).sort((a, b) => (a.catalogKey ? 1 : 0) - (b.catalogKey ? 1 : 0) || b.amount - a.amount);
  const activeStore = data.storeId ?? store;
  return (
    <div className="panel">
      <h2 className="text-lg">Cocokkan iklan ke katalog</h2>
      <p className="note !mt-0.5">Nama iklan yang terpotong dicocokkan otomatis ke katalog. Koreksi iklan yang belum cocok atau salah.</p>
      <label className="field mt-3 max-w-sm"><span>Toko</span><select value={activeStore} onChange={(e) => setStore(e.target.value)}>{data.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      {list.length ? <div className="tbl-wrap mt-3"><table className="tbl"><thead><tr><th>Nama iklan</th><th className="!text-right">Total biaya</th><th>Katalog</th></tr></thead><tbody>{list.map((r) => <AdMatchRow key={r.key} storeId={activeStore} adName={r.name} amount={`Rp${new Intl.NumberFormat('id-ID').format(Math.round(r.amount))}`} value={r.catalogKey} manual={r.manual} catalogs={data.catalogs.map((c) => ({ key: c.externalKey, name: c.name }))} />)}</tbody></table></div> : <p className="note mt-3">Belum ada laporan iklan untuk toko ini.</p>}
    </div>
  );
}
