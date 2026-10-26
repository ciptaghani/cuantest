'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AutoForm } from '@/components/AutoForm';
import { Kpi } from '@/components/Kpi';
import { qs, type SP } from '@/components/qs';
import { LoadState, useApi, useOpsModel } from '@/components/useApi';
import { backendUrl } from '@/lib/api';
import { csVariants, expStatus } from '@/lib/cs';
import { norm } from '@/lib/parse';
import type { OpsModel } from '@/lib/ops';
import type { ProductInfoRow } from '@/lib/repo/cs';
import { Importer } from '../../data/import-export/Importer';
import { NoMaster, SearchField } from '../../operasional/ui';
import { ExpChip } from '../ui';
import { InfoForm } from './InfoForm';

const MAX = 300;

export default function Page() {
  return (
    <Suspense fallback={<p className="note mt-4">Memuat…</p>}>
      <Content />
    </Suspense>
  );
}

function Content() {
  const usp = useSearchParams();
  const sp: SP = Object.fromEntries(usp.entries());
  const one = (k: string) => usp.get(k) ?? '';
  const model = useOpsModel();
  const infos = useApi<Record<string, ProductInfoRow>>('/api/cs/infos');
  const m = model.m;
  const info = infos.data;
  const loading = model.loading || infos.loading;
  const error = model.error || infos.error;

  if (loading || error || !m || !info) return <LoadState loading={loading} error={error} what="data varian" />;

  const V = Object.values(csVariants(m.skuMap)).sort((a, b) => a.brand.localeCompare(b.brand) || a.product.localeCompare(b.product));
  if (!V.length) return <NoMaster />;
  const complete = (k: string) => !!(info[k]?.expiredAt && info[k]?.notes);
  const soon = (k: string) => !!info[k]?.expiredAt && expStatus(info[k].expiredAt, m.today).cls !== 'ok';
  const lf = ['kurang', 'exp'].includes(one('lf')) ? one('lf') : '';
  const lq = one('lq');
  const list = V.filter((v) => (lf === 'kurang' ? !complete(v.key) : lf === 'exp' ? soon(v.key) : true) && (!lq || norm(v.brand + ' ' + v.product).includes(norm(lq))));
  const done = V.filter((v) => complete(v.key)).length;
  const k = one('k');

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="panel self-start">
        <h2 className="text-lg">Input info barang</h2>
        <p className="sub">Satu per satu. Info disimpan per varian (berlaku untuk semua size).</p>
        <InfoForm
          key={k}
          initKey={k}
          infos={info}
          variants={V.map((v) => ({ key: v.key, brand: v.brand, product: v.product, sizes: v.skus.map((s) => (s.ml ? `${s.ml}ml` : s.code)).join(', ') }))}
        />
        <h3 className="dh">Input bulk</h3>
        <p className="sub">Download template berisi semua varian, isi kolom yang perlu, lalu upload. Sel yang dikosongkan tidak menghapus data yang sudah ada.</p>
        <div className="mt-3">
          <a className="btn-ghost" href={backendUrl('/api/export/product-info-template')}>
            Download template
          </a>
        </div>
        <Importer kind="productInfo" buttonLabel="Upload template terisi" />
      </div>
      <div className="panel">
        <h2 className="text-lg">Kelengkapan info</h2>
        <div className="kps">
          <Kpi label="Varian lengkap" value={`${done}/${V.length}`} cls="ok" />
          <Kpi label="Belum lengkap" value={V.length - done} cls={V.length - done ? 'mid' : ''} href={qs(sp, { lf: lf === 'kurang' ? null : 'kurang' })} on={lf === 'kurang'} />
          <Kpi label="Expired ≤ 90 hari" value={V.filter((v) => soon(v.key)).length} cls="bad" href={qs(sp, { lf: lf === 'exp' ? null : 'exp' })} on={lf === 'exp'} />
        </div>
        <AutoForm>
          <label className="field">
            <span>Tampilkan</span>
            <select name="lf" defaultValue={lf}>
              <option value="">Semua</option>
              <option value="kurang">Belum lengkap</option>
              <option value="exp">Expired ≤ 90 hari</option>
            </select>
          </label>
          <SearchField name="lq" value={lq} placeholder="Brand atau varian" />
        </AutoForm>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Varian</th>
                <th>Expired</th>
                <th>Notes</th>
                <th>Look</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.slice(0, MAX).map((v) => {
                const inf = info[v.key];
                return (
                  <tr key={v.key}>
                    <td className="!whitespace-normal">
                      {v.brand} · <b>{v.product}</b>
                    </td>
                    <td>{inf?.expiredAt ? <ExpChip exp={inf.expiredAt} today={m.today} /> : <span className="text-muted">–</span>}</td>
                    <td>{inf?.notes ? <span className="chip chip-ok">Ada</span> : <span className="chip chip-ch">Belum</span>}</td>
                    <td>{inf?.lookUrl ? <span className="chip chip-ok">Ada</span> : <span className="text-muted">–</span>}</td>
                    <td>
                      <Link className="linkbtn" href={qs(sp, { k: v.key })}>
                        Ubah
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {!list.length && (
                <tr>
                  <td colSpan={5} className="text-muted">
                    Tidak ada varian di filter ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {list.length > MAX && <p className="note">Menampilkan {MAX} varian pertama. Gunakan pencarian.</p>}
      </div>
    </div>
  );
}
