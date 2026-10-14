# TASK.md — Migrasi Cuan Lens (HTML) ke Next.js

Dokumen ini adalah rencana kerja untuk membangun ulang **Cuan Lens** (sistem marketplace, marketing, operasional, finance, dan CS untuk ngado.kado, giveme.id, smolify.id) sebagai aplikasi **Next.js** yang bisa dideploy di **Hostinger**.

Kerjakan per fase, berurutan. Centang tiap task setelah selesai dan lolos kriteria terima.

---

## 0. Konteks penting

### 0.1 Sumber acuan
- File `cuan-lens.html` yang sudah ada di repo adalah **spesifikasi hidup**: semua tampilan, alur, dan rumus sudah berjalan di sana.
- Simpan di `reference/cuan-lens.html`. **Jangan** di-import atau di-serve oleh Next.js. File ini hanya dibaca sebagai acuan.
- Pastikan versinya yang terbaru (download ulang dari artifact Claude kalau ragu). Versi terbaru punya menu: Marketplace, Marketing, Operasional (termasuk Umur stock & multi gudang), Finance (termasuk Settlement & Schedule restock), CS, Data (Import/export + Akun & akses).
- Semua rumus di HTML ada di dalam `<script>` paling bawah. Saat porting, **salin logikanya, bukan gaya kodenya**. Ubah ke TypeScript yang rapi, bertipe, dan teruji.

### 0.2 Masalah di versi HTML yang harus selesai di Next.js
1. Data Marketplace (export pesanan, laporan penghasilan, laporan iklan) tersimpan per browser (localStorage). **Di Next.js semua data wajib di database server**, jadi semua admin melihat angka yang sama.
2. Login di HTML hanya mengatur tampilan. **Di Next.js login harus aman di server** (session, hash password, cek akses di setiap request).
3. Perhitungan berat (ledger, HPP, stok) jalan di browser. **Pindahkan ke server** (server actions / route handlers) dan cache hasilnya.

### 0.3 Aturan bisnis yang tidak boleh berubah
Ini sudah disepakati pemilik. Jangan diubah tanpa konfirmasi.

**Stok**
- Stok dihitung **per gudang**: Gudang Jogja (gudang utama), Toko Siniparfum, Gudang Rembang.
- Stok gudang = opname final terakhir gudang itu + produksi/geser masuk + barang masuk + pindah masuk − botol sumber terpakai − barang keluar − pindah keluar − terjual.
- Transaksi **di tanggal opname** dianggap sudah termasuk hitungan fisik. Yang dihitung hanya transaksi setelah tanggal opname.
- Penjualan marketplace mengurangi stok gudang yang diatur di pengaturan "Gudang pengiriman marketplace" (default Gudang Jogja).
- **Retur hanya catatan.** Tidak memengaruhi stok, HPP, maupun keuangan.

**Kategori SKU**
- Kategori dihitung otomatis dari tabel aturan konversi: ukuran sumber = Fullsize, ukuran tujuan = Decant, selain itu = Lainnya.
- Sumber fullsize sebuah decant: default ukuran fullsize terbesar dengan brand + nama produk yang sama. Bisa di-override per produk lewat "Aturan sumber fullsize".

**HPP**
- Fullsize: rata-rata bergerak dari HPP master (pada stok opname) dan setiap barang masuk yang punya harga beli.
- Decant: HPP sumber ÷ (ml sumber × susut%) × ml decant + biaya kemasan (botol + stiker + lainnya) dari aturan konversi. Susut default **95%**.
- Geser decant memakai rumus yang sama, dengan HPP sumber utuh (botol lama ikut terhitung).

**Marketplace**
- Potongan per pesanan diambil dari laporan Penghasilan/settlement.
  - Komponen persen dibagi ke tiap baris sesuai porsi harga.
  - Biaya proses pesanan dibagi rata per item.
  - "Biaya Isi Saldo Otomatis" **tidak** dihitung.
- Pesanan yang belum ada di laporan penghasilan diestimasi dengan **tarif efektif** toko itu (minimal 5 pesanan aktual). Kalau belum ada, pakai tarif cadangan.
- Iklan Shopee berbasis **katalog** (listing), bukan SKU. Iklan katalog dibagi ke SKU sesuai porsi omzet.

**Finance**
- **Beban iklan HANYA dari top up saldo iklan** di menu Pembayaran. Laporan iklan marketplace tidak masuk Finance karena banyak bonus saldo yang sulit dicatat.
- Penjualan, fee, dan affiliate masuk ledger dari data Marketplace. Toko data contoh tidak dihitung.
- Faktur pembelian berisi SKU otomatis membuat "barang masuk" di Operasional, lengkap dengan harga per pcs (ongkir dibagi proporsional) dan gudang penerimaan.

**Settlement**
- Pesanan sudah tersettle = ada di laporan penghasilan/settlement.
- Nilai settlement = total penghasilan dari laporan. Kalau tidak ada, pakai omzet − potongan.

**Marketing**
- Saran iklan memakai ROAS iklan dibanding ROAS impas.
- Kalau ROAS impas > 20x, sarannya "stop iklan, perbaiki harga".

---

## 1. Stack & struktur

| Bagian | Pilihan | Alasan |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript strict | permintaan pemilik |
| UI | Tailwind CSS + komponen sendiri (ikuti token warna & font di HTML) | tampilan sudah disetujui |
| Database | ~~MySQL (tersedia di Hostinger)~~ **PostgreSQL (Supabase)** + Prisma ORM | diganti atas permintaan pemilik (2026-10-13); app di Hostinger konek ke Supabase |
| Auth | Auth.js (NextAuth v5) Credentials + bcrypt, session database | login ID & password |
| Validasi | Zod | input form & import |
| Excel | SheetJS `xlsx` (pin versi) di server | import/export template |
| Tes | Vitest (unit logika) + Playwright (alur utama) | angka harus sama dengan HTML |
| File upload | Disk server (`/uploads`, di luar `public`) atau Hostinger object storage | bukti bayar |

Struktur folder yang disarankan:

```
app/
  (auth)/login/page.tsx
  (app)/layout.tsx              # navbar + cek sesi & akses
  (app)/marketplace/{ringkasan,katalog,sku,toko}/page.tsx
  (app)/marketing/{dashboard,bcg,ads,planning}/page.tsx
  (app)/operasional/{task,produksi,keluar-masuk,stok,umur-stok,opname,retur,absensi,master}/page.tsx
  (app)/finance/{pembelian,pembayaran,pemindahan,restock,laba-rugi,arus-kas,buku-besar,settlement,pengaturan}/page.tsx
  (app)/cs/{stock,info,input}/page.tsx
  (app)/data/{import-export,akun}/page.tsx
  api/...                       # route handler untuk upload & download file
lib/
  parse/        # num, parseTs, autoMap, readWorkbook
  marketplace/  # enrich, learnRates, computeMarketplace, feeOf, adMatching
  ops/          # stock, hpp, tasks, avgDaily, mutasi, conversion, umurStok
  finance/      # ledger, glAgg, invoice, payment, cashflow, settlement, restock
  marketing/    # advice, adsAction, bcg, planSuggest
  auth/         # permissions, session helpers
prisma/schema.prisma
scripts/migrate-from-html.ts
reference/cuan-lens.html
tests/fixtures/  # JSON hasil export dari HTML
```

---

## 2. Fase & task

### Fase 0 — Persiapan
- [ ] Inisialisasi Next.js + TypeScript strict + Tailwind + ESLint + Prettier. *(Next.js 15 + TS strict + Tailwind 4 sudah; ESLint & Prettier belum.)*
- [x] Taruh `cuan-lens.html` di `reference/`. Tambahkan `reference/` ke `.vercelignore`/build ignore supaya tidak ikut ter-bundle. *(lewat `outputFileTracingExcludes` di `next.config.ts`)*
- [ ] **Cek paket Hostinger** sebelum menulis kode deploy:
  - paket mendukung aplikasi Node.js (paket Business/Cloud dengan fitur Node.js, atau VPS)? **Shared hosting biasa tidak bisa menjalankan Next.js server.**
  - versi Node yang tersedia (butuh ≥ 18.18, disarankan 20 LTS).
  - database MySQL + kredensialnya.
- [x] Buat `.env.example`: `DATABASE_URL`, `AUTH_SECRET`, `UPLOAD_DIR`, `APP_URL`.
- [x] Atur `next.config.ts` dengan `output: 'standalone'`.

**Kriteria terima:** `npm run build` sukses, dan halaman kosong bisa dibuka di server Hostinger (atau VPS) lewat domain.

### Fase 1 — Skema database (Prisma)
Buat model berikut. Nama tabel bahasa Inggris, label UI tetap bahasa Indonesia.

- [x] **Akses:** `User` (name, username unik, passwordHash, role `ADMIN|STAFF`, active), `UserPermission` (userId, menu: `MARKETPLACE|MARKETING|OPS|FINANCE|CS|DATA`), `Session` (Auth.js).
- [x] **Master:** `Warehouse`, `Brand` (leadTimeDays, `99` = kebijakan brand), `Sku` (code unik, brand, productKey, variant, ml, price, cogs), `ConversionRule` (brand, fromMl, toMl, qtyPerBottle, packId), `Pack` (name, bottle, sticker, other), `SourceOverride` (brand+productKey → skuId), `AppConfig` (susut%, targetDays, avgMode, avgDays, mainWarehouseId, salesWarehouseId, targetMargin).
- [x] **Marketplace:** `Store` (name, channel `SHOPEE|TIKTOK`, brand, fallback fees), `Catalog` (storeId, externalKey, name), `Order` (storeId, orderNo, createdAt), `OrderLine` (orderId, catalogId, sku, qty, subtotal), `OrderFee` (orderId, admin, process, freeShip, service, tax, other, ams, total, settledAt), `AdRecord` (storeId, from, to, adName, catalogId nullable, amount, sales), `AdCatalogMap`.
- [x] **Operasional:** `StockMovement` (type `PRODUCTION|SHIFT|IN|OUT|TRANSFER`, date, warehouseId, toWarehouseId, sourceSkuId, sourceQty, reason, note, invoiceId nullable, createdBy) + `StockMovementLine` (skuId, qty, unitPrice nullable), `DailySale` (date, skuId, qty, source) yang **dibangkitkan dari OrderLine** (lihat Fase 4), `Opname` (date, warehouseId, final) + `OpnameCount`, `ReturnNote`, `Employee`, `Attendance` (employeeId, date, present, note), `HistoryAvg` (skuId, avgDaily, label).
- [x] **CS:** `ProductInfo` (brand+productKey unik, expiredAt, notes, lookUrl).
- [x] **Marketing:** `AdChangeLog`, `MarketingPlan` (date, title, category, storeId, note, done).
- [x] **Finance:** `Account` (code, name, type, group, isCash, isInvest), `BankAccount`, `OpeningBalance`, `Supplier`, `PurchaseOrder` + lines, `PurchaseInvoice` + lines (kind `SKU|OTHER`, accountId, receivedWarehouseId), `Payment` (kind `EXPENSE|INVOICE|ADS_TOPUP|RECEIPT|EXPENSE_REMAINDER`, bankAccountId, amount, proofPath) + `PaymentLine`, `Transfer` (from/to account, amount, fee).
- [x] Index untuk kolom yang sering difilter: tanggal, storeId, skuId, warehouseId.
- [x] Seed: 3 gudang, chart of accounts default (salin `DEF_COA` dari HTML), daftar kemasan default, lead time brand, satu user admin dari env. *(HTML tidak punya default kemasan & lead time: harga kemasan 0 dan lead time kosong, isi angka aslinya di `prisma/seed-data.ts`.)*

**Kriteria terima:** `prisma migrate dev` sukses, dan seed jalan tanpa error. ✅ *(diuji di MariaDB 11.4 lokal; seed aman dijalankan ulang)*

### Fase 2 — Login & hak akses
> Catatan: login memakai session database buatan sendiri (`lib/auth/session.ts`), bukan Auth.js. Provider Credentials di Auth.js tidak mendukung session database, padahal session database wajib. Token acak 32 byte di cookie httpOnly; yang disimpan di DB hanya hash SHA-256-nya.

- [x] Halaman `/login` (ID + password), mengikuti gaya gate login di HTML.
- [x] Password di-hash bcrypt (cost 12). Tambahkan rate limit percobaan login per IP dan per username. *(5 gagal/15 menit per ID, 20 per IP → kunci 15 menit; tabel `LoginAttempt`)*
- [x] `middleware.ts`: semua route di `(app)` wajib login. Cek izin menu di server layout **dan** di setiap server action/route handler. Jangan cukup menyembunyikan menu. *(`AreaGate`, `guardedAction`, `withArea`)*
- [x] Admin melihat semua menu termasuk Akun. Staff hanya melihat menu yang dicentang.
- [x] Halaman Data → **Akun & akses**: CRUD user, ubah peran & izin, nonaktifkan, reset password, dan cegah menghapus admin terakhir.
- [x] Catat `createdBy` di setiap transaksi (ganti `nameOf(by)` di HTML). *(Operasional, Marketing, dan Finance: PO, faktur, pembayaran, pemindahan dana.)*

**Kriteria terima:** staff tanpa izin Finance yang memanggil endpoint Finance langsung mendapat 403. ✅ *(`GET /api/finance/summary`: tes Vitest + uji HTTP ke server yang berjalan)*

### Fase 3 — Porting logika ke `lib/` (inti pekerjaan)
Untuk tiap modul: tulis versi TypeScript, lalu buat tes Vitest yang membandingkan hasilnya dengan angka dari HTML (pakai fixture JSON, lihat Fase 9).

| Fungsi di HTML | Tujuan | Catatan |
|---|---|---|
| `num`, `parseTs`, `norm`, `toks`, `autoMap` | `lib/parse` | format angka Indonesia, serial date Excel |
| `feeOf`, `learnRates`, `enrich`, `compute`, `fin` | `lib/marketplace` | per baris → agregat katalog/SKU/toko, ROAS impas |
| `bestCat`, `autoMatchAll`, `adCat` | `lib/marketplace/adMatching` | nama iklan terpotong → katalog |
| `opModel`, `stockCalcWh`, `stockCalc` | `lib/ops/stock` | per gudang, baseline opname |
| `hppCalc`, `packRule`, `convRatio`, `decantsOf`, `geserTargets` | `lib/ops/hpp`, `lib/ops/conversion` | moving average + rumus susut |
| `avgDaily`, `taskRows` | `lib/ops/tasks` | prioritas Tinggi/Sedang/Aman/Tidak ada histori |
| `mutasiWh`, `mutasi` | `lib/ops/mutasi` | kartu stok multi gudang |
| `pgAge` (logika status) | `lib/ops/umurStok` | status Restock/Produksi/Sales/Safe, aturan 21 hari |
| `finLedger`, `glAgg`, `invTotals`, `invPaid`, `bebanRest`, `payCalc` | `lib/finance` | double entry, harus selalu seimbang |
| arus kas (`fnCF`), `fnSt`, `fnRs` | `lib/finance/{cashflow,settlement,restock}` | |
| `mkAdvice`, `adsAction`, BCG, `planSuggest` | `lib/marketing` | |

- [x] Semua fungsi murni (input → output), tanpa akses DOM. Akses database lewat layer `lib/repo/*`.
- [x] Ledger dibangkitkan dari data sumber (bukan disimpan ganda). Cache per periode, dan invalidate saat ada transaksi baru. *(`unstable_cache` dengan tag `finance`/`marketplace`/`ops`; server action nanti memanggil `invalidate(...)`)*
- [x] Tes khusus: total debit = total kredit untuk data seed apa pun. *(20 seed acak)*

**Kriteria terima:** semua tes Vitest hijau, dan selisih angka dengan HTML ≤ Rp1 (pembulatan). ✅ *(`tests/parity`: fungsi asli `reference/cuan-lens.html` dijalankan di sandbox Node dan dibandingkan dengan `lib/` pada data uji yang sama. Fixture data nyata menyusul di Fase 9.)*

### Fase 4 — Import / export data
- [x] Upload file di route handler (`multipart/form-data`). Batas ukuran 20 MB, dan baca dengan SheetJS di server. *(`/api/import/parse`; SheetJS 0.20.3 dari CDN resmi; hasil parse disimpan sementara dengan token 1 jam di `UPLOAD_DIR/tmp`)*
- [x] UI mapping kolom seperti di HTML: tebak otomatis pakai `autoMap`, user bisa koreksi, preview 3 baris, lalu impor.
- [x] **Export pesanan** → `Order` + `OrderLine` + `Catalog`.
  - Lewati pesanan batal/retur.
  - Upsert per (store, orderNo).
  - Setelah impor, bangkitkan ulang `DailySale` untuk tanggal yang terdampak (menggantikan "Kirim penjualan ke Operasional").
- [x] **Laporan penghasilan/settlement** → `OrderFee`, termasuk `settledAt` dari kolom "Tanggal dana dilepaskan". *(`OrderFee` dikunci per toko + no. pesanan, jadi boleh diupload sebelum export pesanan)*
- [x] **Laporan iklan** → `AdRecord` (periode dari–sampai atau per tanggal) + pencocokan otomatis ke katalog + halaman koreksi manual. *(`/data/import-export/iklan`; plus input biaya iklan manual)*
- [x] **Master SKU & HPP**: upload + **download template kosong** + **download master sekarang** (nama kolom sama persis dengan HTML).
- [x] **Stock opname**: download template per gudang (No, Nama Brand, Kode SKU, Qty Tercatat, Qty Stock Opname) + upload hasil. *(upload masuk ke opname draft gudang + tanggal; opname final ditolak)*
- [x] **Info barang (CS)**: download template semua varian + upload bulk. Sel kosong tidak menimpa data lama.
- [x] Semua impor berjalan dalam transaksi database, dan menampilkan ringkasan: berhasil, dilewati, error per baris.

Tambahan: kelola toko & tarif cadangan di halaman yang sama (membuat toko otomatis membuat akun "Saldo <toko>" di buku besar).
Verifikasi: 70 tes Vitest + `tests/e2e/import.e2e.ts` (33/33 lolos): laba rugi dari data hasil impor sama dengan `lib/` (≤ Rp1).

### Fase 5 — Halaman Marketplace & Marketing
- [x] Marketplace: Ringkasan (bar "ke mana omzet pergi", grafik omzet vs laba, donut biaya, top/bocor), Katalog (detail variasi + pengeluaran), Per SKU, Per Toko (ROAS impas). Ikuti filter periode/channel/brand/toko di HTML.
- [x] Marketing:
  - Dashboard saran (toggle katalog/SKU).
  - BCG matrix per toko (SVG + tabel saran).
  - Ads: rekap, grafik mingguan, saran weekly/monthly, log perubahan.
  - Schedule & planning: kalender + saran event (twin date, payday, review mingguan/bulanan).

*(Semua halaman tampil tanpa error dengan data uji e2e lewat HTTP. Belum dicek visual di browser / HP.)*

### Fase 6 — Halaman Operasional
- [x] Task produksi (+ kebutuhan botol fullsize).
- [x] Produksi: produksi decant & geser decant, pilih gudang, cek yield ml.
- [x] Barang keluar masuk: masuk/restock (harga beli opsional), keluar (alasan), pindah gudang.
- [x] Stok real-time: checklist gudang, kolom per gudang, filter ready/habis/minus, modal **Riwayat** (kartu stok).
- [x] Umur stock.
- [x] Stock opname per gudang: input bareng, selesaikan → baseline, template. *(+ upload hasil opname langsung di sesi)*
- [x] Retur (scan barcode, catatan saja).
- [x] Absensi (grid bulanan + catatan).
- [x] Master & aturan: Master & HPP, Gudang, Aturan konversi (+ kemasan), Aturan sumber fullsize, Botol & kemasan, Lead time, Rata-rata & target, Cek data. *(+ upload histori rata-rata jual harian di Rata-rata & target)*
- [x] Input yang dipakai bersamaan (opname, absensi) memakai update per baris, bukan menimpa seluruh dokumen.

*(Verifikasi: `tests/e2e/ops.e2e.ts` 73/73 lewat HTTP: stok per gudang, HPP, opname baseline, izin, kebocoran halaman. Belum dicek visual di browser / HP.)*

### Fase 7 — Halaman Finance
- [x] Pembelian: PO & faktur (SKU terdaftar + barang lain dengan akun), buat faktur dari PO, faktur SKU → `StockMovement` IN otomatis (edit/hapus faktur ikut memperbarui/menghapus pergerakan stoknya).
- [x] Pembayaran: beban (multi baris), faktur, top up saldo iklan, penerimaan lain. Lunas/DP (Rp/%), bayar sisa, upload bukti (gambar/PDF, simpan di luar `public`, akses lewat route yang cek izin).
- [x] Pemindahan dana: saldo marketplace per toko → rekening, biaya penarikan.
- [x] Schedule restock: penjualan 3 bulan, konversi decant → fullsize, filter brand & supplier, **buat PO dari saran**.
- [x] Laporan: Laba rugi (format seperti Accurate), Arus kas (metode langsung), Ringkasan buku besar (+ detail per akun), Settlement.
- [x] Pengaturan akun: rekening bank, tanggal mulai & saldo awal (tombol ambil nilai persediaan dari stok), daftar akun custom.
- [x] Export PDF/Excel untuk laba rugi, arus kas, dan buku besar (fitur baru, belum ada di HTML). *(Excel lewat `/api/export/{laba-rugi,arus-kas,buku-besar}`; PDF lewat tombol "Cetak / PDF" = dialog cetak browser dengan CSS cetak, tanpa library PDF.)*

*(Verifikasi: `tests/e2e/finance.e2e.ts` 51/51 lewat HTTP: faktur → barang masuk & stok, DP/lunas dihitung server, laba rugi & buku besar seimbang, bukti bayar, export, izin. Belum dicek visual di browser / HP.)*

### Fase 8 — Halaman CS
- [x] Info stock: pencarian varian/brand → semua size, stok total semua gudang (tooltip per gudang), harga, ready/habis.
- [x] Info barang: expired (warna status), size ready, notes wangi, link look visual.
- [x] Input info barang: satu per satu + bulk template, dan panel kelengkapan.
- [ ] (Opsional) Upload gambar look visual ke server supaya bisa tampil langsung. Di versi HTML ini tidak bisa karena keterbatasan artifact. *(Belum dibuat: link look visual sudah cukup untuk alur sekarang. Kalau perlu, pola upload bukti bayar Finance bisa dipakai ulang.)*

*(Verifikasi: `tests/e2e/cs.e2e.ts` 14/14 lewat HTTP; parity `csVariants`/`csSearch` dengan HTML. Belum dicek visual di browser / HP.)*

### Fase 9 — Migrasi data dari versi HTML
- [ ] Tambahkan tombol **"Export semua data (JSON)"** di versi HTML (Data → Import/export). Isinya gabungan `localStorage` (`cuanlens-v2`: toko, pesanan, potongan, iklan, katalog) dan dokumen database artifact (ops, prod, opname, retur, absen, sales, mkt, fin).
- [ ] `scripts/migrate-from-html.ts`: baca JSON itu → isi tabel Prisma. Idempotent, jadi aman dijalankan ulang.
- [ ] Simpan sampel JSON yang sudah dianonimkan di `tests/fixtures/` untuk tes parity Fase 3.
- [ ] Cek setelah migrasi: stok per gudang, HPP sekarang, laba rugi bulan berjalan, dan saldo buku besar harus sama dengan versi HTML.

### Fase 10 — Deploy ke Hostinger
- [ ] Build `standalone`, upload, jalankan dengan PM2 (VPS) atau Node.js app manager (paket Hostinger yang mendukung).
- [ ] Jalankan `prisma migrate deploy` di server.
- [ ] HTTPS aktif, `AUTH_SECRET` kuat, cookie `secure`.
- [ ] Backup harian database MySQL + folder upload.
- [ ] Halaman status sederhana `/api/health`.

---

## 3. Definition of Done (berlaku untuk semua task)
- Tipe TypeScript tanpa `any` di `lib/`.
- Setiap server action memvalidasi input dengan Zod **dan** mengecek izin user.
- Semua teks UI dalam bahasa Indonesia, format angka `id-ID`, mata uang Rupiah.
- Responsif di HP (staf gudang & CS banyak memakai HP), dan dark mode mengikuti sistem.
- Tidak ada perhitungan uang/stok yang hanya ada di client.
- Angka sama dengan versi HTML untuk data yang sama (lihat tes parity).

## 4. Urutan prioritas kalau waktu terbatas
1. Fase 0–2 (fondasi, login aman).
2. Fase 3–4 untuk Marketplace + Operasional (paling sering dipakai tim).
3. Fase 6 + Fase 9 (pindahkan tim operasional dari HTML ke Next.js).
4. Fase 7 Finance.
5. Fase 5 Marketing, Fase 8 CS.
6. Fase 10 berjalan paralel sejak awal (deploy kecil-kecilan supaya masalah hosting ketahuan lebih dulu).

## 5. Pertanyaan yang perlu dijawab pemilik sebelum mulai
- Paket Hostinger yang dipakai sekarang apa? Kalau shared hosting biasa, perlu upgrade ke paket dengan dukungan Node.js atau VPS.
- Selama transisi, apakah versi HTML tetap dipakai (perlu sinkron data dua arah) atau langsung pindah total setelah migrasi?
- Apakah penjualan toko offline Siniparfum mau diimpor juga (dari Accurate/POS)? Ini mengubah stok gudang Toko Siniparfum.
- Apakah expired perlu per batch/size, atau cukup per varian seperti sekarang?