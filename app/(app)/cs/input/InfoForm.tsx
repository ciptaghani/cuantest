'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Msg, useAction } from '@/components/useAction';
import type { ProductInfoRow } from '@/lib/repo/cs';
import { saveInfo } from '../actions';

interface VariantOpt {
  key: string;
  brand: string;
  product: string;
  sizes: string;
}

const label = (v: VariantOpt) => `${v.brand} · ${v.product}`;

/** Input info satu varian (pgCsInput di HTML). */
export function InfoForm({ variants, infos, initKey }: { variants: VariantOpt[]; infos: Record<string, ProductInfoRow>; initKey: string }) {
  const router = useRouter();
  const init = variants.find((v) => v.key === initKey);
  const [text, setText] = useState(init ? label(init) : '');
  const [exp, setExp] = useState(infos[initKey]?.expiredAt ?? '');
  const [notes, setNotes] = useState(infos[initKey]?.notes ?? '');
  const [look, setLook] = useState(infos[initKey]?.lookUrl ?? '');
  const { pending, msg, run } = useAction();
  const cur = variants.find((v) => label(v) === text);
  const info = cur ? infos[cur.key] : undefined;

  function pick(t: string) {
    setText(t);
    const v = variants.find((x) => label(x) === t);
    if (!v) return;
    setExp(infos[v.key]?.expiredAt ?? '');
    setNotes(infos[v.key]?.notes ?? '');
    setLook(infos[v.key]?.lookUrl ?? '');
  }
  const clear = () => {
    pick('');
    setExp('');
    setNotes('');
    setLook('');
    router.replace('/cs/input', { scroll: false });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (cur) run(() => saveInfo({ brand: cur.brand, product: cur.product, expiredAt: exp, notes, lookUrl: look }), clear);
      }}
    >
      <datalist id="dl-var">
        {variants.map((v) => (
          <option key={v.key} value={label(v)} />
        ))}
      </datalist>
      <label className="field mt-3">
        <span>Varian</span>
        <input list="dl-var" value={text} onChange={(e) => pick(e.target.value)} placeholder="Ketik brand atau varian lalu pilih" />
      </label>
      {cur ? (
        <>
          <p className="note">
            {cur.sizes}
            {info && ` · terakhir diubah ${new Date(info.updatedAt).toLocaleDateString('id-ID')}`}
          </p>
          <label className="field mt-3 w-max">
            <span>Tanggal expired</span>
            <input type="date" value={exp} onChange={(e) => setExp(e.target.value)} />
          </label>
          <label className="field mt-3">
            <span>Notes wangi / deskripsi</span>
            <textarea
              rows={6}
              className="rounded-lg border border-line bg-surf px-2.5 py-[7px] text-[15px] text-ink"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Top: bergamot, lemon · Middle: … · Base: … · Karakter: fresh, cocok siang hari"
            />
          </label>
          <label className="field mt-3">
            <span>Link look visual (opsional)</span>
            <input type="url" value={look} onChange={(e) => setLook(e.target.value)} placeholder="https://drive.google.com/…" />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="btn" disabled={pending}>
              Simpan
            </button>
            <button type="button" className="btn-ghost" onClick={clear}>
              Batal
            </button>
            <Msg msg={msg} />
          </div>
        </>
      ) : (
        <>
          {text && <p className="note neg">Varian tidak ditemukan di master. Pilih dari daftar saran.</p>}
          <Msg msg={msg} />
        </>
      )}
    </form>
  );
}
