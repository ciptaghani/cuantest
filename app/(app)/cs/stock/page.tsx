import type { Metadata } from 'next';
import { one, type SP } from '@/components/qs';
import { requireArea } from '@/lib/auth/guard';
import { csSearch, csVariants } from '@/lib/cs';
import { n0, rp } from '@/lib/format';
import { stockCalc } from '@/lib/ops';
import { getProductInfos } from '@/lib/repo/cs';
import { getOpsModel } from '@/lib/repo/ops';
import { ExpChip, SearchBox, sizeLabel } from '../ui';

export const metadata: Metadata = { title: 'Info stock · Cuan Lens' };

const MAX = 15;

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  await requireArea('CS');
  const q = one(await searchParams, 'q');
  const [m, info] = await Promise.all([getOpsModel(), getProductInfos()]);
  const res = csSearch(csVariants(m.skuMap), q);
  const { st, per } = stockCalc(m);
  const now = (code: string) => (st[code] ? st[code].now : 0);

  return (
    <div className="panel">
      <h2 className="text-lg">Info stock</h2>
      <p className="sub">Cari nama varian atau brand. Stok yang tampil adalah jumlah semua gudang (sentuh / arahkan kursor ke angka untuk lihat per gudang).</p>
      <SearchBox value={q} placeholder="Ketik varian atau brand, mis. alpha hmns" />
      <div className="mt-4 flex flex-col gap-3.5">
        {!q.trim() && <p className="note">Hasil pencarian muncul di sini.</p>}
        {q.trim() && !res.length && <p className="note">Varian tidak ditemukan. Coba kata kunci lain.</p>}
        {res.slice(0, MAX).map((v) => (
          <div key={v.key} className="cscard">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3>
                  {v.brand} · {v.product}
                </h3>
                <span className="ps">
                  {v.skus.length} size · total stok {n0(v.skus.reduce((a, s) => a + Math.max(0, now(s.code)), 0))} pcs
                </span>
              </div>
              <ExpChip exp={info[v.key]?.expiredAt ?? ''} today={m.today} />
            </div>
            <div className="tbl-wrap mt-3">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Size</th>
                    <th>SKU</th>
                    <th className="r">Stok semua gudang</th>
                    <th className="r">Harga jual</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {v.skus.map((s) => {
                    const qty = now(s.code);
                    const tip = m.warehouses.map((w) => `${w.name}: ${n0(per[w.id]?.[s.code]?.now ?? 0)}`).join(' · ');
                    return (
                      <tr key={s.code}>
                        <td>
                          <b>{sizeLabel(s)}</b> {s.category === 'Fullsize' && <span className="chip chip-ch">Fullsize</span>}
                        </td>
                        <td>{s.code}</td>
                        <td className="r" title={tip}>
                          <b className={qty > 0 ? 'text-profit' : 'neg'}>{n0(Math.max(0, qty))}</b>
                          <div className="ps sm:hidden">{tip}</div>
                        </td>
                        <td className="r">{s.price ? rp(s.price) : '–'}</td>
                        <td>{qty > 0 ? <span className="chip chip-ok">Ready</span> : <span className="chip chip-bad">Habis</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {res.length > MAX && (
          <p className="note">
            Menampilkan {MAX} dari {res.length} varian. Perjelas kata kunci.
          </p>
        )}
      </div>
    </div>
  );
}
