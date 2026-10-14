'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { ImportSummary, RowIssue } from '@/lib/import/common';
import { IMPORT_SPEC, type ImportKind } from '@/lib/import/kinds';
import { autoMap } from '@/lib/parse';

interface Parsed {
  token: string;
  fileName: string;
  headers: string[];
  rowCount: number;
  preview: Record<string, unknown>[];
}

type Result = (ImportSummary & { ok: true }) | { ok: false; error: string };

const fmt = new Intl.NumberFormat('id-ID');

function show(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return s.length > 40 ? s.slice(0, 39) + '…' : s;
}

export function Importer({
  kind,
  params = {},
  disabledReason,
  buttonLabel = 'Upload file',
  note,
}: {
  kind: ImportKind;
  params?: Record<string, string>;
  /** Kalau diisi, upload dinonaktifkan dengan pesan ini (mis. "Pilih toko dulu"). */
  disabledReason?: string;
  buttonLabel?: string;
  note?: React.ReactNode;
}) {
  const fields = IMPORT_SPEC[kind].fields;
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'' | 'parse' | 'import'>('');
  const [error, setError] = useState('');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setError('');
    setResult(null);
    setParsed(null);
    if (f.size > 20 * 1024 * 1024) {
      setError('File terlalu besar (maks. 20 MB).');
      return;
    }
    setBusy('parse');
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/import/parse', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal membaca file');
      setParsed(data);
      setMapping(autoMap(data.headers, fields));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membaca file');
    } finally {
      setBusy('');
      if (input.current) input.current.value = '';
    }
  }

  async function onImport() {
    if (!parsed) return;
    setBusy('import');
    setError('');
    try {
      const res = await fetch(`/api/import/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: parsed.token, mapping, params }),
      });
      const data = (await res.json()) as Result;
      if (!data.ok) {
        if (res.status === 410) setParsed(null);
        setError(data.error);
        return;
      }
      setResult(data);
      setParsed(null);
      router.refresh();
    } catch {
      setError('Koneksi terputus. Coba lagi.');
    } finally {
      setBusy('');
    }
  }

  const missing = fields.filter((f) => f.req && !mapping[f.k]).map((f) => f.l);
  const used = fields.filter((f) => mapping[f.k]);

  return (
    <div className="mt-3">
      {note}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className={`btn-ghost inline-flex items-center ${disabledReason || busy ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
          {busy === 'parse' ? 'Membaca file…' : buttonLabel}
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden disabled={!!disabledReason || !!busy} onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {disabledReason && <span className="text-[13px] text-muted">{disabledReason}</span>}
      </div>
      {error && (
        <p className="note !text-loss" role="alert">
          {error}
        </p>
      )}

      {parsed && (
        <div className="mt-3 rounded-[10px] border border-line bg-surf2 p-3">
          <p className="text-[13.5px]">
            <b>{parsed.fileName}</b> · {fmt.format(parsed.rowCount)} baris. Cek kolom di bawah (sudah ditebak otomatis), lalu impor.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((f) => (
              <label key={f.k} className="field">
                <span>
                  {f.l}
                  {f.req ? ' *' : ''}
                </span>
                <select value={mapping[f.k] || ''} onChange={(e) => setMapping({ ...mapping, [f.k]: e.target.value })}>
                  <option value="">(tidak ada)</option>
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {used.length > 0 && (
            <div className="tbl-wrap mt-3">
              <table className="tbl">
                <thead>
                  <tr>
                    {used.map((f) => (
                      <th key={f.k}>{f.l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.preview.map((r, i) => (
                    <tr key={i}>
                      {used.map((f) => (
                        <td key={f.k}>{show(r[mapping[f.k]])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="note">Preview 3 baris pertama.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="btn" onClick={onImport} disabled={!!busy || missing.length > 0 || !!disabledReason}>
              {busy === 'import' ? 'Mengimpor…' : `Impor ${fmt.format(parsed.rowCount)} baris`}
            </button>
            <button className="btn-ghost" onClick={() => setParsed(null)} disabled={!!busy}>
              Batal
            </button>
            {missing.length > 0 && <span className="text-[13px] text-loss">Pilih kolom wajib: {missing.join(', ')}</span>}
          </div>
        </div>
      )}

      {result?.ok && <ResultBox r={result} />}
    </div>
  );
}

function ResultBox({ r }: { r: ImportSummary }) {
  const [all, setAll] = useState(false);
  const errs: RowIssue[] = all ? r.errors : r.errors.slice(0, 10);
  return (
    <div className="mt-3 rounded-[10px] border border-line bg-surf p-3 text-[13.5px]" role="status">
      <div className="flex flex-wrap gap-2">
        <span className="chip chip-ok">Berhasil {fmt.format(r.imported)}</span>
        {r.skipped > 0 && <span className="chip chip-ch">Dilewati {fmt.format(r.skipped)}</span>}
        {r.errors.length > 0 && <span className="chip chip-bad">Error {fmt.format(r.errors.length)}</span>}
      </div>
      {r.notes.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-muted">
          {r.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {r.errors.length > 0 && (
        <div className="mt-2">
          <p className="font-semibold">Baris yang tidak diimpor:</p>
          <ul className="mt-1 list-disc pl-5 text-loss">
            {errs.map((e, i) => (
              <li key={i}>{e.row ? `Baris ${e.row}: ${e.message}` : e.message}</li>
            ))}
          </ul>
          {r.errors.length > 10 && (
            <button className="linkbtn mt-1" onClick={() => setAll(!all)}>
              {all ? 'Ringkas' : `Tampilkan semua ${r.errors.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
