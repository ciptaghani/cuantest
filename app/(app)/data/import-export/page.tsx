'use client';

import { Suspense } from 'react';
import { LoadState, useApi } from '@/components/useApi';
import { backendUrl } from '@/lib/api';
import { todayKey } from '@/lib/date';
import { learnRates, type MarketplaceData, type StoreRate } from '@/lib/marketplace';
import { DataTabs } from '../DataTabs';
import { TargetMargin } from './TargetMargin';
import { Importer } from './Importer';
import { MarketplaceImports, type StoreOpt } from './MarketplaceImports';
import { OpnameSection } from './OpnameSection';
import { StoreManager, type StoreView } from './StoreManager';
import { AdMatchingSection } from './AdMatchingSection';
import { FeeAutomationSection } from './FeeAutomationSection';
import { DataManagementSection } from './DataManagementSection';

const NF = new Intl.NumberFormat('id-ID');

interface Overview {
  stores: { id: string; name: string; channel: 'SHOPEE' | 'TIKTOK'; brand: string; feeAdmin: number; feeFreeShip: number; feeService: number; feeTax: number; feeAms: number; feeProcess: number }[];
  catalogs: { storeId: string; externalKey: string; name: string }[];
  warehouses: { id: string; name: string }[];
  brands: string[];
  skuCount: number;
  orderCount: number;
  lineCount: number;
  feeCount: number;
  adCount: number;
  adSum: number;
  unmatchedAds: number;
  infoCount: number;
}

export default function ImportExportPage() {
  return (
    <Suspense fallback={<p className="note mt-4">Memuat…</p>}>
      <Content />
    </Suspense>
  );
}

function Content() {
  const ov = useApi<Overview>('/api/data/overview');
  const mp = useApi<MarketplaceData>('/api/marketplace/data');
  const target = useApi<{ targetMargin: number }>('/api/marketplace/target-margin');
  const loading = ov.loading || mp.loading || target.loading;
  const error = ov.error || mp.error || target.error;

  if (loading || error || !ov.data || !mp.data || !target.data)
    return <LoadState loading={loading} error={error} what="data import" />;

  const { stores, catalogs, warehouses, brands, skuCount, orderCount, lineCount, feeCount, adCount, adSum, unmatchedAds, infoCount } = ov.data;
  const rates: Record<string, StoreRate> = learnRates(mp.data);
  const storeViews: StoreView[] = stores.map((s) => {
    const r = rates[s.id];
    return {
      id: s.id,
      name: s.name,
      channel: s.channel,
      brand: s.brand,
      fees: { feeAdmin: s.feeAdmin, feeFreeShip: s.feeFreeShip, feeService: s.feeService, feeTax: s.feeTax, feeAms: s.feeAms, feeProcess: s.feeProcess },
      effective: r?.source === 'efektif' ? { n: r.n, admin: r.admin, freeShip: r.freeShip, service: r.service, tax: r.tax, ams: r.ams, process: r.process } : null,
      actualOrders: r?.n ?? 0,
    };
  });
  const storeOpts: StoreOpt[] = stores.map((s) => ({ id: s.id, name: s.name, catalogs: catalogs.filter((c) => c.storeId === s.id).map((c) => ({ key: c.externalKey, name: c.name })) }));
  const brandNames = brands;
  const storeBrands = [...new Set(['ngado.kado', 'giveme.id', 'smolify.id', ...stores.map((s) => s.brand).filter(Boolean)])];

  return (
    <>
      <DataTabs />
      <div className="flex flex-col gap-4">
        <div className="panel">
          <h2 className="text-xl">Import / export data</h2>
          <p className="note !mt-0.5">Semua data tersimpan di server, jadi semua admin melihat angka yang sama.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[13.5px] sm:grid-cols-3 lg:grid-cols-6">
            <Stat k="Master SKU" v={NF.format(skuCount)} />
            <Stat k="Pesanan" v={`${NF.format(orderCount)}`} sub={`${NF.format(lineCount)} baris`} />
            <Stat k="Potongan asli" v={NF.format(feeCount)} sub={orderCount ? `${Math.min(100, Math.round((feeCount / orderCount) * 100))}% pesanan` : undefined} />
            <Stat k="Baris iklan" v={NF.format(adCount)} sub={`Rp${NF.format(Math.round(adSum))}`} />
            <Stat k="Iklan belum cocok" v={NF.format(unmatchedAds)} />
            <Stat k="Info barang" v={NF.format(infoCount)} />
          </div>
        </div>

        <div className="panel">
          <h2 className="text-lg">Toko & tarif cadangan</h2>
          <StoreManager stores={storeViews} brands={storeBrands} />
          <TargetMargin value={target.data.targetMargin} />
        </div>

        <div className="panel">
          <h2 className="text-lg">Master SKU & HPP</h2>
          <p className="note !mt-0.5">
            Dipakai Marketplace (HPP) dan Operasional (brand, ukuran, kategori fullsize/decant). SKU yang sudah ada diperbarui; kolom yang tidak dipilih tidak menimpa data lama.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="btn-ghost" href={backendUrl('/api/export/sku-template')}>
              Download template kosong
            </a>
            <a className="btn-ghost" href={backendUrl('/api/export/sku-master')}>
              Download master sekarang
            </a>
          </div>
          <Importer kind="sku" buttonLabel="Upload master SKU" />
        </div>

         <MarketplaceImports stores={storeOpts} unmatchedAds={unmatchedAds} />

         <AdMatchingSection />

         <FeeAutomationSection stores={storeViews} />

         <div className="panel">
          <h2 className="text-lg">Stock opname</h2>
          <p className="note !mt-0.5">Template per gudang berisi No, Nama Brand, Kode SKU, Qty Tercatat (stok sistem per tanggal opname), dan Qty Stock Opname untuk diisi.</p>
          <OpnameSection warehouses={warehouses} brands={brandNames} today={todayKey()} />
        </div>

        <div className="panel">
          <h2 className="text-lg">Info barang (CS)</h2>
          <p className="note !mt-0.5">Template berisi semua varian di master. Isi expired, notes wangi, atau link look visual. Sel yang dikosongkan tidak menghapus data yang sudah ada.</p>
          <div className="mt-3">
            <a className="btn-ghost" href={backendUrl('/api/export/product-info-template')}>
              Download template
            </a>
          </div>
          <Importer kind="productInfo" buttonLabel="Upload template terisi" />
         </div>

         <DataManagementSection />
       </div>
    </>
  );
}

function Stat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded-[10px] border border-line bg-surf2 px-3 py-2">
      <div className="text-[12.5px] text-muted">{k}</div>
      <div className="font-display text-lg font-bold tabular-nums">{v}</div>
      {sub && <div className="text-[12px] text-muted">{sub}</div>}
    </div>
  );
}
