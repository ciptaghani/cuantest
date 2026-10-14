'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { addManualAd } from './actions';
import { Importer } from './Importer';

export interface StoreOpt {
  id: string;
  name: string;
  /** catalogKey → nama (untuk input iklan manual) */
  catalogs: { key: string; name: string }[];
}

const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function MarketplaceImports({ stores, unmatchedAds }: { stores: StoreOpt[]; unmatchedAds: number }) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const store = stores.find((s) => s.id === storeId);
  const need = !store ? 'Pilih toko dulu (buat di bagian Toko).' : undefined;

  return (
    <>
      <div className="panel">
        <h2 className="text-lg">Data Marketplace per toko</h2>
        <label className="field mt-3 max-w-sm">
          <span>Toko tujuan impor</span>
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            {stores.length === 0 && <option value="">Buat toko dulu</option>}
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <section className="mt-5 border-t border-line pt-4">
          <h3 className="text-base">1. Export pesanan</h3>
          <p className="note !mt-0.5">
            Export pesanan Shopee / TikTok. Pesanan batal & retur dilewati. Pesanan yang sudah ada diperbarui (tidak dobel). Penjualan harian Operasional ikut diperbarui otomatis.
          </p>
          <Importer kind="orders" params={{ storeId }} disabledReason={need} buttonLabel="Upload export pesanan" />
        </section>

        <section className="mt-5 border-t border-line pt-4">
          <h3 className="text-base">2. Laporan penghasilan / settlement</h3>
          <p className="note !mt-0.5">
            Potongan asli per pesanan dan tanggal dana dilepaskan. &quot;Biaya Isi Saldo Otomatis&quot; (Biaya Promosi) sengaja tidak dihitung karena itu top up saldo iklan.
          </p>
          <Importer kind="fees" params={{ storeId }} disabledReason={need} buttonLabel="Upload laporan penghasilan" />
        </section>

        <section className="mt-5 border-t border-line pt-4">
          <h3 className="text-base">3. Laporan iklan</h3>
          <p className="note !mt-0.5">
            Kalau laporan tidak punya kolom tanggal, isi periode laporannya. Nama iklan dicocokkan otomatis ke katalog.{' '}
            <Link href="/data/import-export/iklan" className="linkbtn">
              Pencocokan iklan{unmatchedAds ? ` (${unmatchedAds} belum cocok)` : ''}
            </Link>
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <label className="field">
              <span>Periode dari</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="field">
              <span>Sampai</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          <Importer kind="ads" params={{ storeId, from, to }} disabledReason={need} buttonLabel="Upload laporan iklan" />
          {store && <ManualAd store={store} from={from} to={to} />}
        </section>
      </div>
    </>
  );
}

function ManualAd({ store, from, to }: { store: StoreOpt; from: string; to: string }) {
  const [catalogKey, setCatalogKey] = useState('');
  const [amount, setAmount] = useState('');
  const [sales, setSales] = useState('');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-[13.5px] font-medium">Tambah biaya iklan manual</summary>
      <form
        className="mt-2 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await addManualAd({ storeId: store.id, from, to, catalogKey, amount, sales: sales || 0 });
            setMsg(r.ok ? { ok: true, text: r.message || 'Tersimpan' } : { ok: false, text: r.error });
            if (r.ok) {
              setAmount('');
              setSales('');
            }
          });
        }}
      >
        <label className="field min-w-0 flex-1 basis-64">
          <span>Katalog</span>
          <select value={catalogKey} onChange={(e) => setCatalogKey(e.target.value)}>
            <option value="">Iklan toko (bagi ke semua katalog)</option>
            {store.catalogs.map((c) => (
              <option key={c.key} value={c.key}>
                {short(c.name, 70)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Biaya (Rp)</span>
          <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
        <label className="field">
          <span>Penjualan iklan (Rp)</span>
          <input type="number" min={0} value={sales} onChange={(e) => setSales(e.target.value)} />
        </label>
        <button className="btn" disabled={pending || !from}>
          Tambah
        </button>
        {!from && <span className="text-[13px] text-muted">Isi periode (minimal tanggal dari) di atas.</span>}
        {msg && <span className={`text-[13px] ${msg.ok ? 'text-profit' : 'text-loss'}`}>{msg.text}</span>}
      </form>
    </details>
  );
}
