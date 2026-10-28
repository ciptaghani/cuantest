// Klien browser → backend Express langsung (tanpa lewat route Next).
// Auth memakai cookie httpOnly `cl_token` yang dikirim otomatis browser
// (credentials:include; SameSite=None+Secure di produksi, Lax di dev localhost).

const BASE = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000').replace(/\/+$/, '');

export function backendUrl(path: string): string {
  return `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

/** fetch ke backend dengan cookie user ini. Melempar Error berbahasa Indonesia. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(backendUrl(path), { ...init, headers, credentials: 'include', cache: 'no-store' });
  if (res.status === 204) return {} as T;
  const text = await res.text();
  const data = text ? (JSON.parse(text) as T) : ({} as T);
  if (!res.ok) {
    const msg =
      (data as { error?: string; message?: string })?.error ||
      (data as { message?: string })?.message ||
      `Backend error ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : `Backend error ${res.status}`);
  }
  return data;
}
