import { z } from 'zod';
import { withArea } from '@/lib/auth/guard';
import { profitLoss, trialBalance } from '@/lib/finance';
import { getFinanceInput, getLedger } from '@/lib/repo/finance';

const Query = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Ringkasan laba rugi & neraca saldo. Hanya user dengan izin Finance. */
export const GET = withArea('FINANCE', async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const q = Query.safeParse({ from: sp.get('from'), to: sp.get('to') });
  if (!q.success) return Response.json({ error: 'Parameter from & to wajib (YYYY-MM-DD).' }, { status: 400 });
  const [L, fin] = await Promise.all([getLedger(), getFinanceInput()]);
  const pl = profitLoss(L, fin.accounts, q.data.from, q.data.to);
  const tb = trialBalance(L);
  return Response.json({
    from: q.data.from,
    to: q.data.to,
    revenue: pl.revenue.total,
    cogs: pl.cogs.total,
    expense: pl.expense.total,
    netProfit: pl.netProfit,
    trialBalance: tb,
  });
});
