'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { Fragment } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoadState, useApi } from '@/components/useApi';
import { one, qs, type SP } from '@/components/qs';
import { glDetail, glSummary } from '@/lib/finance';
import { n2 } from '@/lib/format';
import { norm } from '@/lib/parse';
import type { FinanceInput, Ledger } from '@/lib/repo/finance';
import { SearchField } from '../../operasional/ui';
import { ExportLinks, fdate, PeriodBar, periodOf } from '../ui';

const DETAIL_MAX = 300;

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
  const { from, to } = periodOf(sp);
  const q = one(sp, 'q');
  const open = one(sp, 'acc');
  const ledger = useApi<Ledger>('/api/finance/ledger');
  const input = useApi<FinanceInput>('/api/finance/input');
  const loading = ledger.loading || input.loading;
  const error = ledger.error || input.error;
  if (loading || error || !ledger.data || !input.data) return <LoadState loading={loading} error={error} what="buku besar" />;
  const L = ledger.data;
  const fin = input.data;
  const gl = glSummary(L, fin.accounts, from, to);
  const rows = gl.rows.filter((r) => !q || norm(r.account.code + ' ' + r.account.name).includes(norm(q)));

  return (
    <div className="panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg">Ringkasan buku besar</h2>
          <p className="sub">Saldo awal, mutasi debit/kredit, dan saldo akhir tiap akun. Klik akun untuk lihat rinciannya.</p>
        </div>
        <ExportLinks kind="buku-besar" from={from} to={to} />
      </div>
      <PeriodBar sp={sp} from={from} to={to}>
        <SearchField value={q} placeholder="Kode atau nama akun" />
      </PeriodBar>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Kode</th>
              <th>Nama akun</th>
              <th className="r">Saldo awal</th>
              <th className="r">Debit</th>
              <th className="r">Kredit</th>
              <th className="r">Saldo akhir</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const a = r.account;
              const isOpen = open === a.code;
              const d = isOpen ? glDetail(L, a.code, from, to) : null;
              return (
                <Fragment key={a.code}>
                  {r.typeHead && (
                    <tr className="tot">
                      <td colSpan={6}>{r.typeHead}</td>
                    </tr>
                  )}
                  <tr className="row">
                    <td>
                      <Link href={qs(sp, { acc: isOpen ? null : a.code })} scroll={false} aria-expanded={isOpen}>
                        {a.code}
                      </Link>
                    </td>
                    <td>
                      <Link href={qs(sp, { acc: isOpen ? null : a.code })} scroll={false}>
                        {a.name}
                      </Link>
                    </td>
                    <td className="r">{n2(r.open)}</td>
                    <td className="r">{n2(r.d)}</td>
                    <td className="r">{n2(r.c)}</td>
                    <td className="r font-semibold">{n2(r.end)}</td>
                  </tr>
                  {d && (
                    <tr className="detail">
                      <td colSpan={6}>
                        <div className="tbl-wrap">
                          <table className="tbl">
                            <thead>
                              <tr>
                                <th>Tanggal</th>
                                <th>Referensi</th>
                                <th>Keterangan</th>
                                <th className="r">Debit</th>
                                <th className="r">Kredit</th>
                                <th className="r">Saldo</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td />
                                <td />
                                <td>Saldo awal</td>
                                <td />
                                <td />
                                <td className="r">{n2(d.open)}</td>
                              </tr>
                              {d.rows.slice(-DETAIL_MAX).map((x, i) => (
                                <tr key={i}>
                                  <td>{fdate(x.date)}</td>
                                  <td>{x.ref}</td>
                                  <td className="min-w-[220px] !whitespace-normal">{x.desc}</td>
                                  <td className="r">{x.d ? n2(x.d) : ''}</td>
                                  <td className="r">{x.c ? n2(x.c) : ''}</td>
                                  <td className="r">{n2(x.balance)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {d.rows.length > DETAIL_MAX && <p className="note">Menampilkan {DETAIL_MAX} transaksi terakhir. Download Excel untuk semua transaksi.</p>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="text-muted">
                  Belum ada transaksi.
                </td>
              </tr>
            )}
            <tr className="tot">
              <td />
              <td>Total mutasi</td>
              <td />
              <td className="r">{n2(gl.debit)}</td>
              <td className="r">{n2(gl.credit)}</td>
              <td>{gl.balanced ? <span className="chip chip-ok">Seimbang</span> : <span className="chip chip-bad">Tidak seimbang</span>}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
