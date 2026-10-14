import 'server-only';
import path from 'node:path';

// Bukti pembayaran disimpan di UPLOAD_DIR/proofs (di luar `public`); dibuka lewat /api/finance/proof yang mengecek izin.

export const PROOF_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
};

export const PROOF_MAX_BYTES = 20 * 1024 * 1024;

const root = () => path.resolve(process.env.UPLOAD_DIR || './uploads');

/** Path relatif (disimpan di Payment.proofPath) untuk pembayaran ini. */
export const proofRel = (paymentId: string, ext: string) => `proofs/${paymentId}.${ext}`;

/** Path absolut dari proofPath; menolak path yang keluar dari folder upload. */
export function proofFile(rel: string): string {
  const abs = path.resolve(root(), rel);
  if (!abs.startsWith(path.join(root(), 'proofs') + path.sep)) throw new Error('Path bukti tidak valid');
  return abs;
}
