/** Tanggal bisnis tanpa jam, format YYYY-MM-DD. */
export type DateKey = string;

const pad = (n: number | string) => String(n).padStart(2, '0');

function utcOf(k: DateKey): number {
  const [y, m, d] = k.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function keyOfUtc(t: number): DateKey {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Tanggal lokal (zona waktu proses) dari objek Date. */
export function dateKeyOf(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** True kalau "YYYY-MM-DD" adalah tanggal kalender yang benar (bukan 2027-31-31). */
export function isValidDateKey(k: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return false;
  const [y, m, d] = k.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

/** Waktu "YYYY-MM-DDTHH:mm" yang valid. */
export function isValidTs(ts: string): boolean {
  const [d, t = '00:00'] = ts.split('T');
  const [h, mi] = t.split(':').map(Number);
  return isValidDateKey(d) && h >= 0 && h <= 23 && mi >= 0 && mi <= 59;
}

export function addDays(k: DateKey, n: number): DateKey {
  return keyOfUtc(utcOf(k) + n * 864e5);
}

export function daysBetween(a: DateKey, b: DateKey): number {
  return Math.round((utcOf(b) - utcOf(a)) / 864e5);
}

/** 0 = Senin … 6 = Minggu. */
export function weekdayMon0(k: DateKey): number {
  return (new Date(utcOf(k)).getUTCDay() + 6) % 7;
}

/** 0 = Minggu … 6 = Sabtu (sama dengan Date#getDay). */
export function weekdaySun0(k: DateKey): number {
  return new Date(utcOf(k)).getUTCDay();
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

export const BUSINESS_TZ = 'Asia/Jakarta';

/** Hari ini di zona waktu bisnis (WIB). */
export function todayKey(now: Date = new Date(), timeZone: string = BUSINESS_TZ): DateKey {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export { pad };
