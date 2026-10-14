import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { withArea } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { invalidate, TAGS } from '@/lib/repo/cache';
import { PROOF_MAX_BYTES, PROOF_TYPES, proofFile, proofRel } from '@/lib/repo/proof';

export const runtime = 'nodejs';

const fail = (error: string, status = 400) => Response.json({ error }, { status });
const paymentOf = (req: Request) => prisma.payment.findUnique({ where: { id: new URL(req.url).searchParams.get('id') || '' }, select: { id: true, number: true, proofPath: true } });

/** Buka bukti pembayaran (hanya user dengan izin Finance). */
export const GET = withArea('FINANCE', async (req) => {
  const p = await paymentOf(req);
  if (!p?.proofPath) return fail('Bukti tidak ditemukan.', 404);
  const ext = path.extname(p.proofPath).slice(1);
  try {
    const body = await readFile(proofFile(p.proofPath));
    return new Response(body, {
      headers: {
        'Content-Type': PROOF_TYPES[ext] || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${p.number.replace(/\W+/g, '-')}.${ext}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return fail('File bukti tidak ada di server.', 404);
  }
});

/** Upload / ganti bukti pembayaran: multipart `file` (gambar atau PDF, maks. 20 MB). */
export const POST = withArea('FINANCE', async (req) => {
  const p = await paymentOf(req);
  if (!p) return fail('Pembayaran tidak ditemukan.', 404);
  if (Number(req.headers.get('content-length') || 0) > PROOF_MAX_BYTES + 64 * 1024) return fail('File maksimal 20 MB.', 413);
  const file = (await req.formData()).get('file');
  if (!(file instanceof File) || !file.size) return fail('Pilih file bukti.');
  if (file.size > PROOF_MAX_BYTES) return fail('File maksimal 20 MB.', 413);
  const ext = path.extname(file.name).slice(1).toLowerCase();
  if (!PROOF_TYPES[ext]) return fail('Bukti harus gambar (JPG, PNG, WEBP, GIF) atau PDF.');
  const rel = proofRel(p.id, ext);
  const abs = proofFile(rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, Buffer.from(await file.arrayBuffer()));
  if (p.proofPath && p.proofPath !== rel) await rm(proofFile(p.proofPath), { force: true });
  await prisma.payment.update({ where: { id: p.id }, data: { proofPath: rel } });
  invalidate(TAGS.finance);
  return Response.json({ ok: true });
});
