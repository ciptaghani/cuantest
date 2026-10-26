import type { DateKey } from '@/lib/date';
import type { OrderLine, Store } from '@/lib/marketplace/types';

export function buildDailySales(orders: OrderLine[], stores: Store[], dates?: Set<DateKey>): Record<DateKey, Record<string, number>> {
  const demo = new Set(stores.filter((s) => s.isDemo).map((s) => s.id));
  const by: Record<DateKey, Record<string, number>> = {};
  for (const o of orders) {
    if (demo.has(o.storeId)) continue;
    const d = o.ts.slice(0, 10);
    if (dates && !dates.has(d)) continue;
    const row = (by[d] ||= {});
    row[o.sku] = (row[o.sku] || 0) + (+o.qty || 0);
  }
  return by;
}
