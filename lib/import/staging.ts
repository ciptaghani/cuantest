import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ParsedSheet } from '@/lib/parse/workbook';

// File yang sudah dibaca disimpan sementara (JSON) di UPLOAD_DIR/tmp sampai user menekan "Impor",
// supaya file tidak perlu diupload dua kali. Hanya pemilik token yang bisa memakainya.

import os from 'node:os';

const TTL_MS = 60 * 60_000;
const TOKEN_RE = /^[0-9a-f-]{36}$/;

function dir(): string {
  if (process.env.UPLOAD_DIR) return path.resolve(process.env.UPLOAD_DIR, 'tmp');
  if (process.env.VERCEL) return path.resolve(os.tmpdir(), 'cuan-lens-uploads', 'tmp');
  return path.resolve('./uploads', 'tmp');
}

interface Staged extends ParsedSheet {
  userId: string;
  fileName: string;
  createdAt: number;
}

export async function stage(userId: string, fileName: string, sheet: ParsedSheet): Promise<string> {
  await mkdir(dir(), { recursive: true });
  void cleanup();
  const token = randomUUID();
  const data: Staged = { ...sheet, userId, fileName, createdAt: Date.now() };
  await writeFile(path.join(dir(), `${token}.json`), JSON.stringify(data));
  return token;
}

/** Ambil file staging milik user ini, atau null kalau tidak ada / kedaluwarsa / milik orang lain. */
export async function loadStaged(userId: string, token: string): Promise<Staged | null> {
  if (!TOKEN_RE.test(token)) return null;
  try {
    const data = JSON.parse(await readFile(path.join(dir(), `${token}.json`), 'utf8')) as Staged;
    if (data.userId !== userId || Date.now() - data.createdAt > TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

export async function discard(token: string): Promise<void> {
  if (!TOKEN_RE.test(token)) return;
  await rm(path.join(dir(), `${token}.json`), { force: true });
}

async function cleanup(): Promise<void> {
  try {
    for (const f of await readdir(dir())) {
      const p = path.join(dir(), f);
      if (Date.now() - (await stat(p)).mtimeMs > TTL_MS) await rm(p, { force: true });
    }
  } catch {
    /* folder belum ada */
  }
}
