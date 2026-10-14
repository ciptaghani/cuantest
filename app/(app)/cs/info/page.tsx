import type { Metadata } from 'next';
import Link from 'next/link';
import { one, type SP } from '@/components/qs';
import { requireArea } from '@/lib/auth/guard';
import { csSearch, csVariants } from '@/lib/cs';
import { n0 } from '@/lib/format';
import { stockCalc } from '@/lib/ops';
import { getProductInfos } from '@/lib/repo/cs';
import { getOpsModel } from '@/lib/repo/ops';
import { ExpChip, SearchBox, sizeLabel } from '../ui';

export const metadata: Metadata = { title: 'Info barang · Cuan Lens' };

const MAX = 12;

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  await requireArea('CS');
  const q = one(await searchParams, 'q');
  const [m, info] = await Promise.all([getOpsModel(), getProductInfos()]);
  const res = csSearch(csVariants(m.skuMap), q);
  const { st } = stockCalc(m);
  const now = (code: string) => (st[code] ? st[code].now : 0);

  return (
    <div className="panel">
      <h2 className="text-lg">Info barang</h2>
      <p className="sub">Cari nama varian atau brand untuk lihat expired, size yang ready, notes wangi, dan look visual.</p>
      <SearchBox value={q} placeholder="Ketik varian atau brand, mis. philea" />
      <div className="mt-4 flex flex-col gap-3.5">
        {!q.trim() && <p className="note">Hasil pencarian muncul di sini.</p>}
        {q.trim() && !res.length && <p className="note">Varian tidak ditemukan.</p>}
        {res.slice(0, MAX).map((v) => {
          const inf = info[v.key];
          const ready = v.skus.filter((s) => now(s.code) > 0);
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
                    <ExpChip exp={inf?.expiredAt ?? ''} today={m.today} />
                  </div>
                </div>
                <div>
                  <span className="k">Size ready</span>
                  <div className="flex flex-wrap gap-1">
                    {ready.length ? (
                      ready.map((s) => (
                        <span key={s.code} className="chip chip-ok">
                          {sizeLabel(s)} · {n0(now(s.code))}
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
