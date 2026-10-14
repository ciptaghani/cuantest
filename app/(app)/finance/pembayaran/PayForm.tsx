'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Msg, useAction } from '@/components/useAction';
import type { PaymentKind } from '@/lib/finance/types';
import { rp } from '@/lib/format';
import { savePayment } from '../actions';
import { PAY_LABEL } from './constants';


type Opt = [string, string][];
type Line = { account: string; note: string; amount: string };

const n = (s: string) => Number(s) || 0;

/** Form pembayaran (fnPay di HTML). Angka di sini hanya pratinjau; nilai yang disimpan dihitung ulang di server. */
export function PayForm({
  init,
  today,
  banks,
  expenseAccounts,
  receiptAccounts,
  invoices,
  remainder,
}: {
  init: { kind: PaymentKind; invoiceId: string; refPaymentId: string; bank: string };
  today: string;
  banks: Opt;
  expenseAccounts: Opt;
  receiptAccounts: Opt;
  /** Faktur yang masih punya sisa. */
  invoices: { id: string; label: string; total: number; paid: number }[];
  /** Pelunasan sisa beban: nomor & sisa pembayaran asal. */
  remainder: { number: string; rest: number } | null;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<PaymentKind>(init.kind);
  const [date, setDate] = useState(today);
  const [bank, setBank] = useState(init.bank);
  const [lines, setLines] = useState<Line[]>([{ account: '6-200', note: '', amount: '' }]);
  const [mode, setMode] = useState<'lunas' | 'dp'>('lunas');
  const [dpType, setDpType] = useState<'rp' | 'pct'>('rp');
  const [dpVal, setDpVal] = useState('');
  const [invoiceId, setInvoiceId] = useState(init.invoiceId);
  const [channel, setChannel] = useState('shopee');
  const [account, setAccount] = useState(receiptAccounts[0]?.[0] ?? '');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const { pending, msg, setMsg, run } = useAction();

  const inv = invoices.find((x) => x.id === invoiceId);
  const dp = (base: number) => (dpType === 'pct' ? (base * n(dpVal)) / 100 : n(dpVal));
  let tot = 0;
  let amt = n(amount);
  if (kind === 'EXPENSE') {
    tot = lines.reduce((a, l) => a + n(l.amount), 0);
    amt = Math.min(tot, mode === 'lunas' ? tot : dp(tot));
  } else if (kind === 'INVOICE') {
    tot = inv?.total ?? 0;
    const rest = Math.max(0, tot - (inv?.paid ?? 0));
    amt = Math.min(rest, mode === 'lunas' ? rest : dp(tot));
  } else if (kind === 'EXPENSE_REMAINDER') {
    tot = remainder?.rest ?? 0;
    amt = Math.min(tot, mode === 'lunas' ? tot : dp(tot));
  }
  const setLine = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const close = () => router.replace('/finance/pembayaran', { scroll: false });

  function save() {
    if (file && file.size > 20 * 1024 * 1024) return setMsg({ ok: false, text: 'File bukti maksimal 20 MB' });
    run(
      () =>
        savePayment({
          kind,
          date,
          bank,
          mode,
          dpType,
          dpVal: n(dpVal),
          lines: lines.map((l) => ({ ...l, amount: n(l.amount) })),
          invoiceId,
          refPaymentId: init.refPaymentId,
          channel,
          account,
          amount: n(amount),
          note,
        }),
      async (r) => {
        if (file && r.data?.id) {
          const fd = new FormData();
          fd.append('file', file);
          const res = await fetch(`/api/finance/proof?id=${r.data.id}`, { method: 'POST', body: fd });
          // Pembayaran sudah tersimpan; bukti yang gagal diunggah bisa diulang dari daftar.
          if (!res.ok) return setMsg({ ok: false, text: `Pembayaran tersimpan, tapi bukti gagal diunggah: ${((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.status}` });
        }
        close();
      },
    );
  }

  const modeUI = (
    <div className="mt-3 flex flex-wrap items-end gap-2.5">
      <div className="seg">
        {(['lunas', 'dp'] as const).map((v) => (
          <button key={v} type="button" aria-pressed={mode === v} onClick={() => setMode(v)}>
            {v === 'lunas' ? 'Lunas' : 'DP / sebagian'}
          </button>
        ))}
      </div>
      {mode === 'dp' && (
        <>
          <div className="seg">
            {(['rp', 'pct'] as const).map((v) => (
              <button key={v} type="button" aria-pressed={dpType === v} onClick={() => setDpType(v)}>
                {v === 'rp' ? 'Rp' : '%'}
              </button>
            ))}
          </div>
          <input type="number" inputMode="decimal" min={0} step="any" className="qin !w-[130px]" aria-label="Nilai DP" value={dpVal} onChange={(e) => setDpVal(e.target.value)} placeholder={dpType === 'pct' ? '%' : 'Rp'} />
        </>
      )}
      <div className="yl">
        <span>Dibayar sekarang</span>
        <b>{rp(amt)}</b>
      </div>
    </div>
  );

  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg">{kind === 'RECEIPT' ? 'Penerimaan baru' : 'Pembayaran baru'}</h2>
        <button type="button" className="btn-ghost" onClick={close}>
          Batal
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <label className="field col-span-2">
          <span>{kind === 'RECEIPT' ? 'Masuk ke' : 'Kas/Bank'} *</span>
          <select value={bank} onChange={(e) => setBank(e.target.value)} required>
            <option value="">Pilih kas/bank</option>
            {banks.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Tanggal *</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
      </div>
      {kind !== 'EXPENSE_REMAINDER' && (
        <div className="seg mt-3 flex-wrap">
          {(['EXPENSE', 'INVOICE', 'ADS_TOPUP', 'RECEIPT'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {PAY_LABEL[k]}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3">
        {kind === 'EXPENSE' && (
          <>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Akun</th>
                    <th>Keterangan</th>
                    <th className="r">Nilai</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td>
                        <select className="txtin" aria-label="Akun beban" value={l.account} onChange={(e) => setLine(i, { account: e.target.value })}>
                          {expenseAccounts.map(([v, lbl]) => (
                            <option key={v} value={v}>
                              {lbl}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input className="txtin" aria-label="Keterangan" value={l.note} onChange={(e) => setLine(i, { note: e.target.value })} placeholder="mis. Gaji Oktober Mbak Aris" />
                      </td>
                      <td>
                        <input type="number" inputMode="decimal" min={0} step="any" className="qin !w-[130px]" aria-label="Nilai" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} />
                      </td>
                      <td>
                        <button type="button" className="linkbtn" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2.5">
              <button type="button" className="btn-ghost" onClick={() => setLines([...lines, { account: '6-690', note: '', amount: '' }])}>
                Tambah baris
              </button>
              <div className="yl">
                <span>Total tagihan</span>
                <b>{rp(tot)}</b>
              </div>
            </div>
            {modeUI}
            {tot - amt > 0.5 && <p className="note">Sisa {rp(tot - amt)} dicatat sebagai utang beban dan bisa dilunasi nanti.</p>}
          </>
        )}
        {kind === 'INVOICE' && (
          <>
            <label className="field max-w-[520px]">
              <span>Faktur yang dibayar</span>
              <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
                <option value="">Pilih faktur</option>
                {invoices.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label} · sisa {rp(x.total - x.paid)}
                  </option>
                ))}
              </select>
            </label>
            {inv ? (
              <>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  <div className="yl">
                    <span>Total faktur</span>
                    <b>{rp(inv.total)}</b>
                  </div>
                  <div className="yl">
                    <span>Sudah dibayar</span>
                    <b>{rp(inv.paid)}</b>
                  </div>
                  <div className="yl">
                    <span>Sisa</span>
                    <b>{rp(inv.total - inv.paid)}</b>
                  </div>
                </div>
                {modeUI}
              </>
            ) : (
              <p className="note">Belum ada faktur dipilih.</p>
            )}
          </>
        )}
        {kind === 'EXPENSE_REMAINDER' && (
          <>
            <p className="note">
              Melunasi sisa tagihan {remainder?.number}. Sisa saat ini {rp(tot)}.
            </p>
            {modeUI}
          </>
        )}
        {kind === 'ADS_TOPUP' && (
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <label className="field">
                <span>Saldo iklan</span>
                <select value={channel} onChange={(e) => setChannel(e.target.value)}>
                  <option value="shopee">Shopee Ads</option>
                  <option value="tiktok">TikTok Ads</option>
                  <option value="lain">Iklan lainnya</option>
                </select>
              </label>
              <label className="field">
                <span>Nilai top up</span>
                <input type="number" inputMode="decimal" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </label>
            </div>
            <p className="note">Top up langsung dicatat sebagai beban iklan di laba rugi. Laporan iklan di menu Data tidak dipakai di Finance.</p>
          </>
        )}
        {kind === 'RECEIPT' && (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <label className="field col-span-2">
              <span>Akun penerimaan</span>
              <select value={account} onChange={(e) => setAccount(e.target.value)}>
                {receiptAccounts.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Nilai diterima</span>
              <input type="number" inputMode="decimal" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        <label className="field">
          <span>Catatan</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <label className="field">
          <span>Bukti pembayaran (opsional, gambar/PDF maks. 20 MB)</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="btn" disabled={pending}>
          Simpan
        </button>
        <Msg msg={msg} />
      </div>
    </form>
  );
}
