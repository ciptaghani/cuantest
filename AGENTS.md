# AGENTS.md — Cuan Lens (Next.js)

Panduan untuk agent AI dan developer yang melanjutkan proyek ini. **Baca file ini dulu sebelum mulai kerja, dan perbarui bagian "Status" dan "Log pekerjaan" setiap kali selesai satu task.**

- Rencana lengkap & aturan bisnis: [task.md](task.md) (sumber kebenaran untuk *apa* yang harus dibuat).
- File ini: *apa yang sudah dikerjakan*, keputusan teknis, dan cara kerja di repo.

---

## 1. Ringkasan proyek

Migrasi **Cuan Lens** (HTML satu file, `reference/cuan-lens.html`) ke Next.js 15 + PostgreSQL (Supabase) untuk ngado.kado, giveme.id, smolify.id. Deploy target: Hostinger (Node.js app / VPS).

| Bagian | Pilihan |
|---|---|
| Framework | Next.js 15.5 (App Router), TypeScript strict, `output: 'standalone'` |
| UI | Tailwind CSS 4, token warna/font disalin dari HTML (`app/globals.css`) |
| Database | PostgreSQL (Supabase, schema `cuantest` untuk uji) — **hanya diakses backend Express** (skema di `../backend/express-boilerplate/prisma/schema.prisma`) |
| Auth | JWT backend + cookie httpOnly `cl_token`; guard Next (`requireUser`/`requireArea`/`<AreaGate>`) verifikasi via `GET /api/auth/me` |
| API | Express (`../backend/express-boilerplate/src`): browser panggil Express langsung (`lib/api.ts`, cookie JWT otomatis). Pencarian stok CS memakai `GET /api/cs/stock?q=...`; filter dan kalkulasi stok dilakukan backend. Folder `app/api` dihapus 2026-10-15 |
| Validasi | Zod |
| Tes | Vitest 5 (`tests/`) |

## 2. Perintah

```bash
npm run dev          # server dev (butuh BACKEND_URL ke Express + .env)
npm run build        # next build (tidak lagi butuh database)
npm test             # semua tes Vitest
npm run typecheck    # tsc --noEmit
```

Backend Express (`../backend/express-boilerplate`, port 4000) wajib jalan untuk semua data & login.
`.env` hanya butuh `BACKEND_URL` + `NEXT_PUBLIC_BACKEND_URL` (lihat `.env.example`).

Database (Supabase):
- `DATABASE_URL` = pooler mode transaksi port **6543** + `pgbouncer=true&schema=<schema>` (dipakai aplikasi & seed).
- `DIRECT_URL` = session pooler port **5432** + `schema=<schema>` (dipakai `prisma migrate`).
- Pakai `schema=`, bukan `search_path=` (Prisma tidak membaca `search_path`).
- `prisma migrate dev` butuh shadow database (sering tidak bisa di Supabase). Cara membuat migrasi baru: `npx prisma migrate diff --from-url "<DIRECT_URL>" --to-schema-datamodel prisma/schema.prisma --script -o prisma/migrations/<YYYYMMDDHHmmss>_<nama>/migration.sql`, periksa SQL-nya, lalu `npm run db:deploy`.
- `npm run build` selalu menghapus `.next` dulu: build inkremental Next 15 pernah kehilangan server action halaman lain ("Server action not found").

## 3. Struktur & konvensi

```
lib/
  date.ts, format.ts      # tanggal (YYYY-MM-DD, WIB) & format id-ID (rp, pc, xx, n0, n2)
  parse/                  # num, parseTs, norm, toks, autoMap, definisi kolom impor, workbook (SheetJS baca/tulis; dipakai browser untuk impor)
  import/                 # kinds, common, marketplace/ops (plan*), templates (tanpa staging.ts — dihapus)
  marketplace/            # feeOf, learnRates, enrich, compute, adMatching
  ops/                    # model, stock, hpp, conversion, tasks, mutasi, umurStok, dailySales
  finance/                # coa, invoice, ledger, reports (laba rugi, arus kas), statements, settlement, restock
  marketing/              # mkAdvice, adsAction, bcgItems, adsWeekly, planSuggest
  cs/                     # csVariants, csSearch, expStatus
  auth/                   # permissions, rateLimit, accounts (murni, tetap diuji); guard (requireUser/requireArea via backend /me)
  repo/                   # convert (murni) + fetch ke backend: marketplace/ops/finance/cs (signature sama seperti dulu)
  backend.ts              # fetch server-side ke Express (JWT dari cookie cl_token)
  api.ts                  # fetch + URL browser langsung ke Express (cookie otomatis)
app/
  (auth)/login            # form + action login/logout via backend (tanpa DB lokal)
  (app)/...               # layout + navbar; tiap menu punya layout.tsx berisi <AreaGate> + page.tsx memanggil requireArea
                          # halaman baca via lib/repo (fetch); mutasi via actions.ts (fetch POST /api/<domain>/<aksi>)
  api/*                   # proxy tipis ke Express (import/export/finance/summary/proof/health); tanpa logika
tests/
  parity/                 # bandingkan lib/ dengan fungsi asli HTML (sandbox vm)
  unit/                   # aturan bisnis, auth, proxy route, guard halaman
```
Yang dihapus 2026-10-15: `prisma/` (skema+migrasi+seed pindah ke backend), `lib/db.ts`, `lib/auth/{session,loginAttempts,password}.ts`, `lib/repo/{cache,imports,proof}.ts`, `lib/import/staging.ts`, `app/*/logic.ts` (+`masterLogic.ts`), `tests/e2e/`, dep `@prisma/client`/`prisma`/`bcryptjs`, script `db:*`.

Aturan wajib (Definition of Done di task.md §3):
- **Logika hitung = fungsi murni di `lib/`**, tanpa `any`, tanpa akses DB. DB hanya lewat `lib/repo/*`.
- **Server action** dibuat lewat `guardedAction(area, zodSchema, fn)` di file logika terpisah, lalu diekspor dari file `'use server'` sebagai `export async function` pembungkus (Next.js menolak export non-async). Contoh: `app/(app)/data/akun/{logic,actions}.ts`.
- **Route handler** dibungkus `withArea(area, handler)` → 401/403 otomatis.
- **Halaman menu** dijaga `<AreaGate area="...">` di `layout.tsx` **dan** `await requireArea('...')` sebagai `await` pertama di setiap `page.tsx` (sebelum memuat data). Layout saja tidak cukup: Next.js merender page paralel, jadi isi page tetap terkirim. Dijaga oleh `tests/unit/pageGuard.test.ts`.
- Setelah mutasi data, panggil `invalidate(TAGS.xxx)` dari `lib/repo/cache.ts`.
- Kolom `createdById` diisi dari user hasil `guardedAction`/`actorId()`.
- Teks UI bahasa Indonesia, angka `id-ID`, Rupiah. Responsif HP + dark mode.
- Waktu pesanan disimpan "naive" (jam WIB ditulis sebagai UTC), lihat `lib/repo/convert.ts`.
- Saat mem-port fungsi baru dari HTML: tambahkan nama deklarasinya ke `NEEDED` di `tests/parity/htmlRuntime.ts` dan buat tes parity (selisih ≤ Rp1).

## 4. Keputusan teknis penting

| Keputusan | Alasan |
|---|---|
| Session DB sendiri, bukan Auth.js | Credentials provider Auth.js tidak mendukung session database. Cookie `cl_session` berisi token acak; DB hanya simpan SHA-256. |
| Rate limit login di tabel `LoginAttempt` | 5 gagal/15 menit per ID, 20 per IP → kunci 15 menit. Tahan restart. |
| Kategori SKU tidak disimpan | Dihitung dari `ConversionRule` (aturan bisnis). |
| `OrderFee.total` = total penghasilan | Sama dengan HTML; kolom `income` dihapus. |
| Ledger: selisih pembulatan sen ditaruh di baris terbesar | Menjamin debit = kredit tepat; tetap ≤ Rp1 dari HTML. |
| Akun keuangan dirujuk lewat **kode** di `lib/finance` | Bank & saldo toko juga baris `Account` dengan kode (1-11x, 1-12x). |
| Tes parity menjalankan JS asli HTML di `vm` | Belum ada export data nyata; fixture sintetis `tests/parity/fixture.ts` menyentuh semua cabang logika. |
| Next 15 dipertahankan | Permintaan pemilik; advisory postcss baru fix di Next 16. |
| PostgreSQL (Supabase) menggantikan MySQL | Permintaan pemilik. Migrasi MySQL lama diarsip di `prisma/migrations-mysql-archive/` (tidak dipakai). Postgres peka huruf besar: SKU/brand `HMNS` ≠ `hmns` (sama dengan perilaku HTML/JS; MySQL dulu tidak peka). |
| `npm run build` = build bersih | Build inkremental pernah menghasilkan manifest server action yang tidak lengkap. |
| `OrderFee` dikunci (storeId, orderNo), bukan FK ke Order | Laporan penghasilan boleh diupload sebelum export pesanan (perilaku HTML). |
| Impor langsung JSON dari browser (parse Excel di klien, batch 500 baris) | Tidak ada upload/staging di server; alur token `/api/import/parse` + `UPLOAD_DIR/tmp` dihapus 2026-10-15. `UPLOAD_DIR` tersisa hanya untuk bukti bayar (`proofs/`). |
| Sel tanggal dibaca sebagai serial Excel (`cellDates: false`) | Hasil tidak bergantung zona waktu server. |
| SheetJS 0.20.3 dari `cdn.sheetjs.com` | Versi npm registry (0.18.5) punya kerentanan; SheetJS tidak lagi rilis di npm. |
| Impor menolak tanggal mustahil (`isValidTs`) | HTML menerima `2027-31-31`; di DB itu akan error. |
| Pilih sheet: header terdeteksi dulu, baru jumlah baris | Mencegah sheet "Petunjuk" terpilih saat master masih sedikit (bug di HTML). |
| Impor opname izin DATA **atau** OPS; info barang DATA **atau** CS | `authorizeAny` / `withArea([..])`. |
| `requireArea()` di setiap page, bukan hanya `<AreaGate>` di layout | Ditemukan saat uji Fase 6: staff tanpa izin menerima isi halaman (stok, iklan, daftar user) di payload walau layout menampilkan "tidak punya akses". |
| Input bersamaan (opname, absensi, retur, master) disimpan per sel lewat `<SaveField>` | Satu baris/sel per request; tidak ada dokumen yang ditimpa utuh seperti di HTML. |
| Isian qty opname draft tidak membuang cache model ops | Hanya opname final yang memengaruhi stok; finalize/reopen/hapus tetap `invalidate(TAGS.ops)`. |
| Produksi dari SKU non-fullsize hanya diberi peringatan di form | Sama dengan HTML (`prodSave` tidak menolak). Geser decant dari kategori Lainnya tetap ditolak server. |
| Nilai pembayaran dihitung ulang di server (`payCalc`) | Form hanya kirim mode lunas/DP; angka dari client diabaikan supaya tidak bisa bayar melebihi sisa. |
| Faktur SKU → satu `StockMovement` IN per faktur, dibuat ulang tiap simpan | Nested write di update faktur (atomik); hapus faktur ikut menghapus lewat cascade. Faktur tidak bisa diubah di bawah nilai yang sudah dibayar. |
| Nomor dokumen = nomor terbesar + 1, coba ulang kalau bentrok (P2002) | HTML pakai jumlah + 1 → bentrok setelah ada yang dihapus. |
| Kas Tunai = `Payment.bankAccountId` null | Kas Tunai (1-100) bukan `BankAccount`; rekening bank = akun 1-11x + baris `BankAccount`. |
| PDF laporan = cetak browser (`@media print`) | Tanpa dependensi PDF; hasil "Simpan sebagai PDF" sudah rapi. Ganti ke library kalau perlu PDF dari server. |
| Bukti bayar: ekstensi whitelist (jpg/png/webp/gif/pdf), disajikan dengan tipe tetap + `nosniff` | File di luar `public`; SVG/HTML ditolak supaya tidak bisa jadi XSS. |
| Filter & modal halaman lewat parameter URL (`?hist=SKU` untuk kartu stok) | Halaman tetap server component; link bisa dibagikan; data tidak dihitung di client. |

---

## 5. Status per fase

Legenda: ✅ selesai & lolos kriteria terima · 🟡 sebagian · ⬜ belum

| Fase | Status | Catatan |
|---|---|---|
| 0 Persiapan | 🟡 | Next.js, TS strict, Tailwind, standalone, `.env.example`, `reference/` sudah. **Belum:** ESLint + Prettier, cek paket Hostinger, uji deploy. |
| 1 Skema database | ✅ | 41 tabel, PostgreSQL. Migrasi `20261013120000_init_postgres` diterapkan ke Supabase schema `cuantest` + seed (2×). Kemasan & lead time default masih placeholder (HTML tidak punya default). |
| 2 Login & hak akses | ✅ | Kriteria 403 lolos (unit + uji HTTP). Page kini juga dijaga `requireArea` (lihat §4). `createdBy` terisi di Operasional, Marketing, Finance. |
| 3 Porting logika | ✅ | Parity ≤ Rp1. `lib/repo` marketplace/ops/finance terbukti lewat e2e (Fase 4, 6, 7). |
| 4 Import / export | ✅ | Semua item selesai. 70 tes Vitest + e2e 33/33. Kelola toko & tarif cadangan ikut di halaman Data. |
| 5 Marketplace & Marketing (UI) | ✅ | Semua halaman tampil dengan data uji lewat HTTP. Belum dicek visual di browser/HP. |
| 6 Operasional (UI) | ✅ | 9 halaman + e2e `ops.e2e.ts` 73/73. Belum dicek visual di browser/HP. |
| 7 Finance (UI) | ✅ | 9 halaman + export Excel/cetak PDF + bukti bayar. e2e `finance.e2e.ts` 51/51. Belum dicek visual di browser/HP. |
| 8 CS (UI) | ✅ | Info stock, Info barang, Input info (+ bulk template). e2e `cs.e2e.ts` 14/14. Upload gambar look visual (opsional) belum. Belum dicek visual di browser/HP. |
| 9 Migrasi data HTML | ⬜ | `lib/migrate/fromHtml.ts` sudah ada (konversi ke tipe domain); tinggal tombol export di HTML + skrip tulis ke Prisma. |
| 10 Deploy Hostinger | 🟡 | `/api/health` sudah ada. |

## 6. Pekerjaan terbuka / follow-up

- [ ] ESLint + Prettier (Fase 0).
- [ ] Jawaban pemilik untuk pertanyaan di task.md §5 (paket Hostinger, sinkron dua arah, toko offline, expired per batch).
- [ ] Isi harga kemasan & lead time brand asli di `prisma/seed-data.ts`.
- [ ] `npm audit`: 4 high + 1 moderate tersisa (postcss di Next 15, deepmerge-ts di Prisma, Vitest moderate). Tinjau ulang sebelum produksi.
- [ ] `package.json#prisma` deprecated di Prisma 7 → pindah ke `prisma.config.ts` saat upgrade.
- [ ] Bandingkan laporan Finance dengan versi HTML pakai data nyata (Fase 9).
- [ ] Info barang tidak mencatat siapa yang terakhir mengubah (HTML menampilkan nama). Butuh kolom `updatedById` di `ProductInfo` kalau diperlukan.
- [ ] Bukti bayar hanya bisa diupload saat membuat pembayaran (sama dengan HTML); belum ada tombol ganti bukti di daftar. `POST /api/finance/proof?id=` sudah mendukung ganti.
- [ ] Rekening bank tidak menyimpan "atas nama" terpisah (skema tidak punya kolomnya); tulis di kolom No. rekening.
- [ ] Jangan jalankan `npm run build` / `next start` di repo saat `npm run dev` jalan: keduanya memakai `.next` yang sama dan saling menimpa. Untuk e2e saat dev jalan, build salinan repo di drive yang sama (junction `node_modules`).
- [ ] Cek visual halaman Fase 5–8 di browser desktop & HP (dark mode, tabel lebar, modal Riwayat, grid absensi). Belum ada alat browser di sesi agent; e2e hanya memeriksa HTML/HTTP.
- [ ] `next start` memberi peringatan karena `output: 'standalone'`; untuk uji lokal produksi pakai `node .next/standalone/server.js` (perlu salin `public` & `.next/static`) atau abaikan peringatannya.
- [ ] Supabase schema `cuantest` saat ini berisi data uji e2e (3 toko, ±290 pesanan, 15 SKU) + admin seed. Untuk mengulang e2e, kosongkan dulu (`prisma migrate reset` harus dijalankan sendiri oleh pemilik — Prisma menolak kalau dipanggil agent).
- [ ] Ganti password database Supabase & `SEED_ADMIN_PASSWORD`/`AUTH_SECRET` sebelum dipakai sungguhan (password DB sempat dibagikan di chat; admin dev `admin-dev-12345` lemah).
- [ ] Tentukan schema produksi (mis. `public` atau `cuanlens`) dan jalankan `npm run db:deploy` + seed di sana.

## 7. Lingkungan dev lokal (mesin pemilik)

- Database dev: **Supabase** project `kxglbjhsenfrnnhhngkf` (region ap-south-1), schema `cuantest`. Kredensial hanya di `.env` (tidak di-commit).
- Admin dev: `admin` / `admin-dev-12345` (hanya untuk uji, jangan dipakai di produksi).
- MariaDB portable lama (scratchpad, port 3307) tidak dipakai lagi.

---

## 8. Log pekerjaan

### 2026-10-19 · Pencarian stok CS dipindahkan ke backend
- Tambah `GET /api/cs/stock?q=...`; backend memfilter varian, menghitung stok per gudang, dan mengambil info expired.
- Halaman `app/(app)/cs/stock/page.tsx` tidak lagi memuat seluruh model OPS dan mencari di browser; halaman sekarang hanya mengambil hasil pencarian dari backend.
- Tambah `useDebounceValue` dari `usehooks-ts` pada input pencarian agar request backend tidak dikirim pada setiap ketikan.
- Pencarian pada halaman `cs/info` juga dipindahkan ke `GET /api/cs/stock?q=...` dan memakai debounce yang sama.

### 2026-10-19 · Hapus penyimpanan upload bukti pembayaran
- Fitur upload/lihat bukti pembayaran dihapus dari frontend dan backend.
- Folder `backend/express-boilerplate/uploads` serta helper penyimpanan proof dihapus.

### 2026-10-19 · Lengkapi section Import / export
- Tambah kembali section `Cocokkan iklan ke katalog`, `Potongan otomatis per toko`, dan `Kelola data` sesuai referensi HTML.
- Pencocokan iklan dan tarif tetap memakai data backend; tidak menghidupkan kembali penyimpanan localStorage.
- Endpoint pencocokan iklan dipindahkan ke modul domain Data: `modules/data/data.routes.ts` → `data.controller.ts` → `data.service.ts`.

### 2026-10-19 · Bersihkan lib frontend
- Hapus `components/AreaGate.tsx` dan `lib/repo/convert.ts` karena tidak lagi direferensikan oleh kode maupun tes di frontend. `AreaGate` sudah digantikan `ClientGate`, sedangkan konversi repo tidak dipakai setelah akses data dipindahkan ke backend Express.
- Hapus `lib/auth/accounts.ts`; validasi admin terakhir sudah berada di backend dan modul ini hanya tersisa sebagai dependency tes frontend.
- Hapus `lib/auth/rateLimit.ts`; rate limit login dijalankan backend Express dan modul frontend hanya tersisa sebagai dependency tes.
- Hapus export/fungsi frontend yang tidak dipanggil: guard area lama, konstanta akses/import/workbook/marketplace/operasional, alur history, helper operasional lama, serta seluruh reader `lib/repo/*` yang sudah digantikan `useApi` langsung ke Express.
- Perbaiki autentikasi cookie: backend Express kini menyimpan JWT sebagai cookie httpOnly `cl_token` saat login dan menghapusnya saat logout, sehingga `apiFetch` dengan `credentials: include` dapat terautentikasi.

### 2026-10-16 · Kembali ke SPA mulus (Link/router Next)
- Revert shim MPA: 54 file kembali `next/link` + `next/navigation`; hapus `components/nav.tsx`. `useAction` + `Importer` kembali `router.refresh()` (tanpa reload penuh).
- Konsekuensi: navigasi client kembali fetch `?_rsc` (tree route layouts guard). Itu payload kecil, bukan kalkulasi — data/kalkulasi tetap di backend Express + `lib/*` lokal.
- Verifikasi: `tsc` bersih, Vitest 77/77, `next build` sukses (static).

### 2026-10-16 · Hapus RSC total (MPA tanpa next/link)
- `components/nav.tsx`: shim drop-in (`Link`→`<a>`, `useRouter/replace/push`→`window.location`, `useSearchParams`→`URLSearchParams`, `redirect`→`location.href`); 56 file dialihkan dari `next/link`+`next/navigation`. Navigasi = full reload dokumen, dev maupun produksi tanpa fetch `?_rsc`.
- `components/useAction.tsx`: hapus `router.refresh()` (edit per sel tidak reload halaman); `Importer.tsx` juga tanpa refresh.
- Verifikasi: `tsc` bersih, Vitest 77/77, `next build` sukses (static), grep `next/link|next/navigation` bersih (sisa hanya komentar nav.tsx).

### 2026-10-16 · Frontend client-only statis (tanpa _rsc)
- `next.config.ts` → `output: 'export'`; hapus `middleware.ts`, `lib/backend.ts`, `tests/unit/pageGuard.test.ts`, `components/AreaGate.tsx` tak dipakai (guard baru `components/ClientGate.tsx`: `useCurrentUser` + `ClientGate` via `GET /api/auth/me` browser).
- Semua layout (`(app)` + 7 area) & page guard (`/`, `/login`, `/tidak-ada-akses`, 5 index redirect) jadi `'use client'`; `actions.ts` ×8 jadi fetch browser (`apiFetch`, tanpa `'use server'`); `lib/auth/guard.ts` + `lib/repo/*` via `apiFetch`; login/logout via `fetch(credentials:include)` + `window.location`/`router.replace`.
- Kalkulasi tetap: browser hitung lokal (lib/*) dari data mentah backend Express; izin ditegakkan backend per endpoint. Navigasi `<Link>` tidak lagi fetch `?_rsc` (hasil `out/` statis, serve statis + Express :4000).
- Verifikasi: `tsc` bersih, Vitest 77/77, `next build` sukses (static prerender semua route).

### 2026-10-15 · Semua halaman jadi use client (tanpa _rsc navigation payload)
- 40 page → `'use client'` + `useSearchParams` (dalam `<Suspense>`) + hook data (`useApi`/`useLoader`/`useOpsModel`/`useMarketplace` di `components/useApi.tsx`); komputasi murni tetap di browser. Navigasi antar halaman tidak lagi meminta payload RSC ke server Next.
- Guard tetap server: layout `<AreaGate>` + backend menegakkan izin per endpoint. `pageGuard.test.ts` disesuaikan (halaman klien wajib di bawah layout AreaGate yang benar).
- Perbaikan penting: `OpsModel` berisi fungsi → endpoint `/api/ops/model` mengembalikan input mentah, model dibangun lokal (`getOpsInputRaw` khusus backend).
- Verifikasi: `tsc` bersih, Vitest 118/118, `next build` sukses, /cs/stock → 307 ke login, /login 200.

### 2026-10-15 · Fix marketplace data double-wrap + ops hemat hitung
- `GET /api/marketplace/data` mengembalikan `{data, rates}` sehingga `learnRates` crash (`data.orders is not iterable`) — diperbaiki jadi data mentah (`getMarketplaceData`); terverifikasi 387 pesanan + rates 3 toko.
- `getOpsModel` frontend tidak lagi membangun ulang model kalau `today` sama (hemat 1x hitung per halaman).
- Verifikasi: `tsc` bersih, Vitest 118/118.

### 2026-10-15 · Hapus folder app/api (browser langsung ke Express)
- Backend `authenticate` menerima JWT dari cookie `cl_token` (fallback kalau tanpa header `Authorization`); cookie login: produksi `SameSite=None; Secure`, dev `Lax`. CORS `credentials:true` sudah ada.
- Browser (`Importer`, upload bukti, semua link download export/bukti) memanggil `NEXT_PUBLIC_BACKEND_URL` langsung via `lib/api.ts` (`credentials:include`). Hapus: `app/api/`, `lib/backendProxy.ts`, tes proxy; tambah `tests/unit/api.test.ts`. Matcher middleware dibersihkan.
- Verifikasi: `tsc` bersih, Vitest 118/118, `next build` sukses, cookie-auth live 200 tanpa header (tanpa cookie 401), Next produksi `/api/health` → 307 ke login (health check deploy ke backend `:4000/health`).

### 2026-10-15 · Frontend tanpa server & tanpa Prisma (fetch ke Express)
- Backend: `src/domains/*.logic.ts` = copy semua `app/*/logic.ts` (50 action, Zod + pesan sama; auth via middleware JWT + `requireArea`), `src/modules/{actions,reads}` (POST aksi + GET bacaan halaman), `src/clib/{auth/accounts,qs,nextCache}` + `src/guard-shim.js`. Hapus CRUD tipis lama (`cuan`, `accounts`, `user` modules).
- Frontend: `actions.ts` ×8 jadi fetch wrapper (nama + signature sama, komponen tidak berubah); `lib/repo/{marketplace,ops,finance,cs}` jadi fetch (signature sama, halaman tidak berubah kecuali 5 page ex-prisma langsung); `lib/auth/guard.ts` JWT via `/api/auth/me`; login/logout via backend; hapus `prisma/`, `lib/db.ts`, `auth/{session,loginAttempts,password}`, `repo/{cache,imports,proof}`, `import/staging.ts`, `*/logic.ts`, `tests/e2e`, dep prisma/bcrypt, script `db:*`, `.env.example` tinggal URL backend.
- Verifikasi: `tsc` bersih, Vitest 123/123, `next build` sukses, Express live: duplikat user ditolak, Zod fieldErrors, 401 tanpa token, mpDetail compute jalan; Next produksi: /login 200, proxy 401 tanpa token.

### 2026-10-15 · Hapus alur token impor
- Dihapus total: `POST /api/import/parse` (backend + proxy Next), branch `token` di backend `POST /:kind` (sekarang `rows` wajib), `lib/import/staging.ts` (frontend + `src/clib`), helper e2e ditulis ulang gaya browser (parse lokal + POST JSON). `UPLOAD_DIR` tinggal untuk `proofs/` (+ sementara hapus bukti di `finance/logic.ts`).
- Verifikasi: `tsc` bersih, Vitest 123/123, backend load OK.

### 2026-10-15 · Import browser-JSON + route Next jadi proxy
- Klarifikasi alur impor: browser mem-parse Excel sendiri (`Importer.tsx` → `readWorkbook` + kirim JSON per batch 500 baris ke `POST /api/import/:kind`); `/api/import/parse` (token staging) tidak dipakai UI. Backend `:kind` sudah cocok (jalur `rows` verbatim).
- `app/api/{import/[kind],import/parse,export/[kind],finance/summary,finance/proof}` kini proxy tipis (`lib/backendProxy.ts`: teruskan JWT `cl_token` server-side) — browser tetap panggil URL sama-origin (fetch + link download), logika hanya di Express. Tes route lama ditulis ulang jadi tes proxy (`financeRoute`, `finance`, `importBatch`).
- Verifikasi: `tsc` bersih, Vitest 123/123.

### 2026-10-15 · Backend Express (API pindah dari Next.js)
- `backend/express-boilerplate` sekarang API satu-satunya: auth JWT (`POST /api/auth/login|logout`, `GET /api/auth/me`, rate-limit `LoginAttempt` sama seperti Next), `GET /api/health`, `POST /api/import/parse|:kind` (transaksi penuh via `src/clib` = copy `lib/` frontend: parse, import, marketplace, ops, finance, marketing, cs, repo; dijalankan lewat `tsx/cjs`), `GET /api/export/:kind` (semua template + laba-rugi/arus-kas/buku-besar), `GET /api/finance/summary`, `GET+POST /api/finance/proof`, plus CRUD `/api/accounts|stores|marketplace|marketing|ops|cs|finance`.
- Skema backend = copy `prisma/schema.prisma` + atribut Prisma 7 (`schemas=["cuantest"]`, `@@schema` 41 model + enum) — **jangan edit manual**, salin ulang dari frontend lalu jalankan skrip `@@schema` kalau frontend berubah. Koneksi: `src/config/prisma.js` (pg Pool + `options=-c search_path=` dari param `schema=` di `DATABASE_URL`, karena adapter-pg mengabaikan `schema=`).
- Login Next (`app/(auth)/login/actions.ts`) sekarang juga mengambil JWT backend → cookie httpOnly `cl_token`; `middleware.ts` menerima `cl_session` atau `cl_token`; helper server `lib/backend.ts` (`backendFetch`) + klien browser `lib/api.ts`. Env baru: `BACKEND_URL` + `NEXT_PUBLIC_BACKEND_URL` (port backend default 4000).
- Verifikasi: `tsc` bersih, Vitest 123/123, HTTP langsung ke Express: login 200 → summary 200 (netProfit + trialBalance balanced) → export xlsx 200 → import/parse 200 (2 baris SKU).

### 2026-10-14 · Fase 8 CS
- Halaman `app/(app)/cs/{stock,info,input}` + `logic.ts`/`actions.ts` (`saveInfo`, izin CS); `input/InfoForm.tsx`; bulk memakai `Importer` & template Data yang sudah ada (izin DATA atau CS).
- `lib/cs` (port `csVariants`, `csSearch` + `expStatus`), `lib/repo/cs.ts` (`getProductInfos`). Gaya `.csbox/.cscard/.csgrid` disalin ke `globals.css`.
- Link look visual wajib http(s) di action & impor (aman dipakai di href).
- Verifikasi: 121 tes Vitest (parity CS + `tests/unit/cs.test.ts`), `tsc` bersih, `next build` sukses, `tests/e2e/cs.e2e.ts` 14/14 di Supabase `cuantest`.

### 2026-10-14 · Fase 7 Finance
- Halaman `app/(app)/finance/{pembelian,pembayaran,pemindahan,restock,laba-rugi,arus-kas,buku-besar,settlement,pengaturan}` + `logic.ts`/`actions.ts` (14 server action). Form klien: `pembelian/DocForm.tsx`, `pembayaran/PayForm.tsx`; sisanya pakai `AddForm`/`SaveField`/`ActBtn`.
- `lib/finance/statements.ts`: baris laba rugi, arus kas, ringkasan & detail buku besar (dipakai halaman dan Excel). `lib/repo/finance.ts`: `DocRow`/`PaymentRow`/`TransferRow` (data halaman), `getFinanceSettings`.
- Bukti bayar: `app/api/finance/proof` + `lib/repo/proof.ts`. Export: `/api/export/{laba-rugi,arus-kas,buku-besar}`. Cetak/PDF: CSS `@media print` di `globals.css`.
- Perbaikan vs HTML: `nextDocNumber` = nomor terbesar + 1 (dulu bentrok setelah hapus); nilai pembayaran dihitung ulang di server; faktur tidak bisa diturunkan di bawah yang sudah dibayar.
- Verifikasi: 116 tes Vitest (+ `tests/unit/finance.test.ts`), `tsc` bersih, `next build` sukses, `tests/e2e/finance.e2e.ts` 51/51 di Supabase `cuantest` (data uji dibersihkan).

### 2026-10-13 · Fase 6 (+ tutup Fase 5) + perbaikan izin halaman
- Fase 5 (ditulis di sesi sebelumnya, belum tercatat): halaman Marketplace (ringkasan, katalog, sku, toko) & Marketing (dashboard, bcg, ads, planning).
- Fase 6: halaman `app/(app)/operasional/{task,produksi,keluar-masuk,stok,umur-stok,opname,retur,absensi,master}`; komponen `inputs.tsx` (`SaveField`, `AddForm`), `components/Modal.tsx`; repo baca riwayat di `lib/repo/ops.ts` (`listMovements`, `listOpnames`, `opnameCounts`, `listReturns`, `attendanceMonth`, `listRules`). Upload histori rata-rata & hasil opname memakai `Importer` yang sudah ada.
- Keamanan: isi page ikut terkirim ke staff tanpa izin (layout `<AreaGate>` tidak menghentikan render page). Tambah `requireArea()` di `lib/auth/guard.ts`, dipasang di semua page; `tests/unit/pageGuard.test.ts` menjaga aturan ini.
- `opnameSetCount` tidak lagi membuang cache ops tiap sel diisi.
- Verifikasi: 99 tes Vitest, `tsc` bersih, `npm run build` sukses, `tests/e2e/ops.e2e.ts` 73/73 di Supabase `cuantest` (data uji dibersihkan lagi; DB kembali ke isi e2e impor), smoke test HTTP semua halaman Fase 5 + Data/Finance/CS.

### 2026-10-13 · Ganti database ke PostgreSQL (Supabase)
- `prisma/schema.prisma`: provider `postgresql` + `directUrl`; unique `AdCatalogMap(storeId, adName)` tanpa prefix length (fitur MySQL).
- Migrasi MySQL diarsip ke `prisma/migrations-mysql-archive/`; migrasi baru `20261013120000_init_postgres` (41 tabel) diterapkan ke schema `cuantest` (sebelumnya kosong) dengan `migrate deploy`; seed 2×.
- `.env` / `.env.example`: `DATABASE_URL` (pooler 6543, pgbouncer) + `DIRECT_URL` (5432); `schema=` menggantikan `search_path=`.
- `npm run build` sekarang build bersih (hapus `.next`) setelah ditemukan manifest server action tidak lengkap pada build inkremental.
- Verifikasi di Supabase: 70 tes Vitest, `tsc`, `next build`, e2e impor 33/33 (laba rugi dari DB = lib), uji HTTP auth 15/15, uji server action Akun 11/11.

### 2026-10-13 · Fase 4
- Upload & parse: `lib/parse/workbook.ts` (SheetJS 0.20.3), `lib/import/staging.ts`, `app/api/import/parse`.
- Rencana impor murni: `lib/import/{marketplace,ops}.ts` (salin logika #ordFile, #feeFile, #adFile, #skuFile, opnUpload, csUpload); template `lib/import/templates.ts` (kolom persis HTML).
- Tulis DB dalam transaksi: `lib/repo/imports.ts` (+ bangkitkan ulang `DailySale`, cocokkan ulang iklan → katalog). Route `app/api/import/[kind]`, `app/api/export/[kind]`.
- UI: `app/(app)/data/import-export/` (Importer generik: mapping + preview 3 baris + ringkasan; kelola toko & tarif; opname; info barang) dan `/iklan` (koreksi pencocokan).
- Skema: migrasi `orderfee_by_order_no` (OrderFee → PK storeId+orderNo, `settledAt` @db.Date).
- Perbaikan vs HTML: tanggal mustahil ditolak, sheet "Petunjuk" tidak lagi salah terpilih.
- Verifikasi: 70 tes Vitest, `tsc` bersih, `next build` sukses, `tests/e2e/import.e2e.ts` 33/33 (termasuk laba rugi dari DB = lib, impor ulang tidak dobel, izin per jenis impor, batas 20 MB & ekstensi).

### 2026-10-13 · Fase 2 & 3
- Fase 3: port semua logika HTML ke `lib/` (parse, marketplace, ops, finance, marketing) + `lib/repo` dengan cache tag + `lib/migrate/fromHtml.ts`.
- Tes parity `tests/parity/` (fungsi asli HTML di sandbox `vm` vs `lib/`), uji mutasi memastikan tes bisa gagal; tes aturan bisnis `tests/unit/rules.test.ts` (debit = kredit untuk 20 seed acak).
- Fase 2: `/login`, session DB, rate limit, `middleware.ts`, `AreaGate`, `guardedAction`, `withArea`, halaman Data → Akun & akses (CRUD, peran/izin, nonaktif, reset password, jaga admin terakhir), `api/finance/summary`, `api/health`.
- Skema: + `LoginAttempt`, nomor dokumen Payment/Transfer, field log iklan, `received`/`unit` faktur; − `OrderFee.income`. Migrasi init dibuat ulang (belum pernah diterapkan di luar lokal).
- Verifikasi: 58 tes Vitest hijau, `tsc` bersih, `next build` sukses, uji HTTP login/403/rate limit/akun lolos di MariaDB lokal.

### 2026-10-13 · Fase 1 (+ sebagian Fase 0)
- `prisma/schema.prisma`, migrasi init, `prisma/seed.ts` + `seed-data.ts` (3 gudang, DEF_COA, kemasan, brand, admin dari env).
- Next.js 15 + Tailwind 4 + config standalone, `reference/cuan-lens.html` dipindah.
- Verifikasi: `prisma migrate dev` + seed (2×) sukses di MariaDB 11.4 lokal.
