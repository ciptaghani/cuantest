'use client';

import { one, type SP } from '@/components/qs';
import { RESTOCK_PRIORITY, restockSchedule, sortRestockRows, type RestockPriority } from '@/lib/finance';
import type { FinanceInput } from '@/lib/repo/finance';
import { buildOpsModel, type OpsInput } from '@/lib/ops';
import { todayKey } from '@/lib/date';
import { apiFetch } from '@/lib/api';
import { matchQ } from '../../operasional/ui';

export const PRIOS = Object.keys(RESTOCK_PRIORITY) as RestockPriority[];

/** Filter & saran restock (dipakai juga untuk membuat PO dari saran). */
export async function restockRows(sp: SP) {
  const [raw, fin] = await Promise.all([apiFetch<OpsInput>('/api/ops/model'), apiFetch<FinanceInput>('/api/finance/input')]);
  const m = buildOpsModel({ ...raw, today: todayKey() });
  const cover = Math.min(365, Math.max(1, Number(one(sp, 'cover')) || 30));
  const { rows: all, span } = restockSchedule(m, [...fin.purchaseOrders, ...fin.invoices], cover);
  const f = { brand: one(sp, 'brand'), sup: one(sp, 'sup'), pr: PRIOS.find((p) => p === one(sp, 'pr')) ?? '', q: one(sp, 'q'), all: one(sp, 'all') === '1' };
  const rows = sortRestockRows(
    all.filter(
      (r) =>
        (!f.brand || r.brand === f.brand) &&
        (!f.sup || (f.sup === '-' ? !r.supplier : r.supplier === f.sup)) &&
        (!f.pr || r.priority === f.pr) &&
        (f.all || r.priority !== 'none') &&
        matchQ(f.q, r.code, r.product, r.brand),
    ),
  );
  return { m, all, rows, span, cover, f };
}

