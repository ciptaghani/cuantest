'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useDebounceValue } from 'usehooks-ts';
import { LoadState, useApi } from '@/components/useApi';
import { n0 } from '@/lib/format';
import { ExpChip, SearchBox, sizeLabel } from '../ui';

const MAX = 12;
type StockResponse = {
  results: Array<{ key: string; brand: string; product: string; skus: Array<{ code: string; ml: number; variant: string; stock: number }> }>;
  info: Record<string, { expiredAt: string; notes: string; lookUrl: string; updatedAt: string }>;
  today: string | null;
};

export default function Page() {
  return (
    <Suspense fallback={<p className="note mt-4">Memuat…</p>}>
      <Content />
    </Suspense>
  );
}

function Content() {
  const initialQuery = useSearchParams().get('q') ?? '';
  const [q, setQ] = useState(initialQuery);
  const [debouncedQ] = useDebounceValue(q, 700);
  const stock = useApi<StockResponse>(`/api/cs/stock?q=${encodeURIComponent(debouncedQ)}`);
  const data = stock.data;
  const loading = stock.loading;
  const error = stock.error;

  if (loading || error || !data) return <LoadState loading={loading} error={error} what="info barang" />;
  const res = data.results;

  return (
    <div className="panel">
      <h2 className="text-lg">Info barang</h2>
      <p className="sub">Cari nama varian atau brand untuk lihat expired, size yang ready, notes wangi, dan look visual.</p>
      <SearchBox value={q} onChange={setQ} placeholder="Ketik varian atau brand, mis. philea" />
      <div className="mt-4 flex flex-col gap-3.5">
        {!q.trim() && <p className="note">Hasil pencarian muncul di sini.</p>}
        {q.trim() && !res.length && <p className="note">Varian tidak ditemukan.</p>}
        {res.slice(0, MAX).map((v) => {
          const inf = data.info[v.key];
          const ready = v.skus.filter((s) => s.stock > 0);
          return (
            <div key={v.key} className="cscard">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3>
                  {v.brand} · {v.product}
                </h3>
                <Link className="btn-ghost btn-sm" href={`/cs/input?k=${encodeURIComponent(v.key)}`}>
                  Ubah info
                </Link>
              </div>
              <div className="csgrid mt-3">
                <div>
                  <span className="k">Tanggal expired</span>
                  <div>
                   <ExpChip exp={inf?.expiredAt ?? ''} today={data.today ?? ''} />
                  </div>
                </div>
                <div>
                  <span className="k">Size ready</span>
                  <div className="flex flex-wrap gap-1">
                    {ready.length ? (
                      ready.map((s) => (
                        <span key={s.code} className="chip chip-ok">
                           {sizeLabel(s)} · {n0(s.stock)}
                        </span>
                      ))
                    ) : (
                      <span className="chip chip-bad">Semua size habis</span>
                    )}
                  </div>
                </div>
                <div className="wide">
                  <span className="k">Notes wangi / deskripsi</span>
                  <div className="whitespace-pre-wrap leading-relaxed">{inf?.notes || <span className="text-muted">Belum diisi.</span>}</div>
                </div>
                <div className="wide">
                  <span className="k">Look visual</span>
                  <div>
                    {inf?.lookUrl ? (
                      <>
                        <a className="btn-ghost btn-sm" href={inf.lookUrl} target="_blank" rel="noopener noreferrer">
                          Buka look visual ↗
                        </a>{' '}
                        <span className="ps break-all">{inf.lookUrl.replace(/^https?:\/\//, '').slice(0, 60)}</span>
                      </>
                    ) : (
                      <span className="text-muted">Tidak ada.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {res.length > MAX && (
          <p className="note">
            Menampilkan {MAX} dari {res.length} varian.
          </p>
        )}
      </div>
    </div>
  );
}
