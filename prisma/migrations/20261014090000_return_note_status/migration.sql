-- Retur: kondisi barang (Sesuai / Tidak sesuai) dan status proses di Desty, sama seperti versi HTML.
ALTER TABLE "ReturnNote" ADD COLUMN "matches" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "processed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ReturnNote_code_idx" ON "ReturnNote"("code");
