import type { FinAccount } from './types';

const collator = new Intl.Collator(undefined, { numeric: true });

/** Urutkan akun berdasarkan kode (numerik) dan buat peta kode → akun. */
export function chartOfAccounts(accounts: FinAccount[]): { list: FinAccount[]; map: Record<string, FinAccount> } {
  const list = [...accounts].sort((a, b) => collator.compare(a.code, b.code));
  const map: Record<string, FinAccount> = {};
  for (const a of list) map[a.code] = a;
  return { list, map };
}

export const accountName = (map: Record<string, FinAccount>, code: string) => (map[code] ? map[code].name : code);
