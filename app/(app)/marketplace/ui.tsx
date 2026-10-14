import { pc } from '@/lib/format';
import type { Channel, FeeKey } from '@/lib/marketplace';

/** Warna komponen potongan (COMPS di HTML). */
export const FEE_COLORS: Record<FeeKey, string> = {
  admin: '--c-fee',
  process: '--c-ord',
  freeShip: '--c-ong',
  service: '--c-lay',
  tax: '--c-tax',
  other: '--c-oth',
  ams: '--c-aff',
};

export function ChannelChip({ channel }: { channel: Channel }) {
  return <span className="chip chip-ch">{channel === 'shopee' ? 'Shopee' : 'TikTok'}</span>;
}

/** "▲ 12,3% vs periode sebelumnya" */
export function Delta({ cur, prev }: { cur: number; prev: number | undefined }) {
  if (!prev) return <span className="text-[12.5px] font-semibold text-muted">belum ada pembanding</span>;
  const d = (cur - prev) / Math.abs(prev);
  const cls = Math.abs(d) < 0.005 ? 'text-muted' : d > 0 ? 'text-profit' : 'text-loss';
  return (
    <span className={`text-[12.5px] font-semibold ${cls}`}>
      {d > 0 ? '▲' : '▼'} {pc(Math.abs(d))} vs periode sebelumnya
    </span>
  );
}

/** Nilai rupiah dengan warna laba/rugi. */
export const netCls = (n: number) => (n < 0 ? 'neg' : 'pos');
