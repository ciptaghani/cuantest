import { AutoForm } from '@/components/AutoForm';
import { expStatus } from '@/lib/cs';
import { fdate } from '../operasional/ui';

/** Kotak cari besar (csSearchBox di HTML); hasil dihitung server lewat ?q=. */
export function SearchBox({ value, placeholder }: { value: string; placeholder: string }) {
  return (
    <AutoForm className="csbox">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input type="search" name="q" defaultValue={value} placeholder={placeholder} aria-label={placeholder} autoComplete="off" />
    </AutoForm>
  );
}

/** Chip expired: merah = lewat, kuning = ≤ 90 hari, hijau = aman. */
export function ExpChip({ exp, today }: { exp: string; today: string }) {
  const s = expStatus(exp, today);
  if (s.cls === 'none') return <span className="chip chip-ch">Expired belum diisi</span>;
  const f = fdate(exp);
  if (s.cls === 'bad') return <span className="chip chip-bad">Expired {f}</span>;
  if (s.cls === 'mid')
    return (
      <span className="chip chip-mid">
        Exp {f} · {s.days} hari lagi
      </span>
    );
  return <span className="chip chip-ok">Exp {f}</span>;
}

/** Label size: "50 ml" atau varian/SKU kalau ml kosong. */
export const sizeLabel = (s: { ml: number; variant: string; code: string }) => (s.ml ? `${s.ml} ml` : s.variant || s.code);
