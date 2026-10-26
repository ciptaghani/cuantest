'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoadState, useApi } from '@/components/useApi';
import { ActBtn } from '@/components/ActBtn';
import { AutoForm } from '@/components/AutoForm';
import { Kpi } from '@/components/Kpi';
import { one, qs, type SP } from '@/components/qs';
import type { ReturnRow } from '@/lib/repo/ops';
import { PageHead } from '../../marketing/ui';
import { returDelete, returUpdate } from '../actions';
import { SaveField } from '../inputs';
import { fdate, matchQ, RangeFields, rangeOf, SearchField } from '../ui';
import { ScanBox } from './ScanBox';

const FILTERS: [string, string][] = [
  ['', 'Semua'],
  ['tidak', 'Tidak sesuai'],
  ['desty', 'Belum diproses Desty'],
];

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
  const { today, from, to } = rangeOf(sp, 30);
  const { data: all, error, loading } = useApi<ReturnRow[]>(`/api/ops/returns?from=${from}&to=${to}`);
  if (loading || error || !all) return <LoadState loading={loading} error={error} what="retur" />;
  return <Retur sp={sp} today={today} from={from} to={to} all={all} />;
}

function Retur({ sp, today, from, to, all }: { sp: SP; today: string; from: string; to: string; all: ReturnRow[] }) {
  const filter = FILTERS.some(([k]) => k === one(sp, 'filter')) ? one(sp, 'filter') : '';
  const q = one(sp, 'q');
  const list = all.filter((r) => (filter !== 'tidak' || !r.matches) && (filter !== 'desty' || !r.processed) && matchQ(q, r.code, r.note));
  const tidak = all.filter((r) => !r.matches).length;
  const belum = all.filter((r) => !r.processed).length;

  return (
    <div className="panel">
      <PageHead title="Retur masuk" sub="Catatan retur saja, tidak mengubah stok atau angka lain. Scan barcode resi atau no. pesanan; scanner otomatis menekan Enter, jadi tiap scan langsung tersimpan." />
      <ScanBox today={today} />
      <div className="kps">
        <Kpi label="Retur periode ini" value={all.length} href={qs(sp, { filter: null })} on={!filter} />
        <Kpi label="Tidak sesuai" value={tidak} cls={tidak ? 'bad' : ''} href={qs(sp, { filter: 'tidak' })} on={filter === 'tidak'} />
        <Kpi label="Belum diproses di Desty" value={belum} cls={belum ? 'mid' : ''} href={qs(sp, { filter: 'desty' })} on={filter === 'desty'} />
      </div>
      <AutoForm>
        <RangeFields from={from} to={to} />
        <label className="field">
          <span>Tampilkan</span>
          <select name="filter" defaultValue={filter}>
            {FILTERS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <SearchField value={q} placeholder="No. resi atau catatan" />
      </AutoForm>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>No. resi / pesanan</th>
              <th>Kondisi</th>
              <th>Proses Desty</th>
              <th>Catatan</th>
              <th>Oleh</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td>{fdate(r.date)}</td>
                <td>
                  <b>{r.code}</b>
                </td>
                <td>
                  <ActBtn action={returUpdate} input={{ id: r.id, matches: !r.matches }} className={`chip chip-${r.matches ? 'ok' : 'bad'} cursor-pointer`} title="Klik untuk ganti">
                    {r.matches ? 'Sesuai' : 'Tidak sesuai'}
                  </ActBtn>
                </td>
                <td>
                  <label className="chk">
                    <SaveField key={String(r.processed)} action={returUpdate} input={{ id: r.id }} field="processed" type="checkbox" value={r.processed} label={`Sudah diproses di Desty ${r.code}`} />
                    {r.processed ? 'Sudah' : 'Belum'}
                  </label>
                </td>
                <td className="min-w-[200px]">
                  <SaveField key={r.note} action={returUpdate} input={{ id: r.id }} field="note" type="text" value={r.note} placeholder="Tambah catatan" label={`Catatan ${r.code}`} style={{ width: '100%' }} />
                </td>
                <td>{r.by}</td>
                <td>
                  <ActBtn action={returDelete} input={{ id: r.id }} confirm={`Hapus retur ${r.code}?`}>
                    Hapus
                  </ActBtn>
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={7} className="text-muted">
                  Belum ada retur di periode ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
