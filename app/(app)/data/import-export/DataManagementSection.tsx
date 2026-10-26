'use client';

import { backendUrl } from '@/lib/api';

export function DataManagementSection() {
  return (
    <div className="panel">
      <h2 className="text-lg">Kelola data</h2>
      <p className="note !mt-0.5">Data tersimpan di backend dan dipakai bersama oleh semua admin. Export data sebelum melakukan perubahan besar.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a className="btn-ghost" href={backendUrl('/api/export/sku-master')}>Download master SKU</a>
        <a className="btn-ghost" href={backendUrl('/api/export/product-info-template')}>Download template info barang</a>
        <button className="btn-ghost" type="button" onClick={() => window.location.reload()}>Muat ulang data</button>
      </div>
    </div>
  );
}
