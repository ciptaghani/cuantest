import bcrypt from 'bcryptjs';

export const BCRYPT_COST = 12;
export const MIN_PASSWORD_LENGTH = 8;

export function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, BCRYPT_COST);
}

let dummyHash: string | null = null;

/**
 * Bandingkan password. Kalau user tidak ada, tetap jalankan bcrypt terhadap hash palsu
 * supaya waktu respons tidak membocorkan ID mana yang terdaftar.
 */
export async function verifyPassword(pw: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    dummyHash ??= await bcrypt.hash('cuan-lens-dummy-password', BCRYPT_COST);
    await bcrypt.compare(pw, dummyHash);
    return false;
  }
  return bcrypt.compare(pw, hash);
}
