import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, db: 'ok' });
  } catch {
    return Response.json({ ok: false, db: 'error' }, { status: 503 });
  }
}
