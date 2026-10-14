import 'server-only';
import { revalidateTag, unstable_cache } from 'next/cache';

/** Tag cache per domain data. Panggil `invalidate` setelah setiap transaksi yang mengubah data itu. */
export const TAGS = {
  marketplace: 'marketplace',
  ops: 'ops',
  finance: 'finance',
} as const;
export type Tag = (typeof TAGS)[keyof typeof TAGS];

export function cached<A extends unknown[], R>(fn: (...args: A) => Promise<R>, key: string, tags: Tag[]) {
  return unstable_cache(fn, [key], { tags, revalidate: 3600 });
}

export function invalidate(...tags: Tag[]) {
  for (const t of tags) revalidateTag(t);
}
