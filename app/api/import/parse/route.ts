import { withArea } from '@/lib/auth/guard';
import { ALLOWED_EXT, ANY_IMPORT_AREAS, MAX_UPLOAD_BYTES } from '@/lib/import/kinds';
import { stage } from '@/lib/import/staging';
import { readWorkbook } from '@/lib/parse/workbook';

export const runtime = 'nodejs';

/** Upload file Excel/CSV (multipart, field "file") → header, 3 baris preview, dan token untuk langkah impor. */
export const POST = withArea(ANY_IMPORT_AREAS, async (req, _ctx: unknown, user) => {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) return Response.json({ error: 'File terlalu besar (maks. 20 MB).' }, { status: 413 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: 'Upload tidak terbaca. Kirim sebagai multipart/form-data.' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) return Response.json({ error: 'Pilih file dulu.' }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: 'File terlalu besar (maks. 20 MB).' }, { status: 413 });
  if (!ALLOWED_EXT.test(file.name)) return Response.json({ error: 'Format file harus .xlsx, .xls, atau .csv.' }, { status: 400 });
  let sheet;
  try {
    sheet = readWorkbook(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return Response.json({ error: 'File tidak bisa dibaca. Pastikan file Excel/CSV tidak rusak atau terkunci password.' }, { status: 400 });
  }
  if (!sheet.headers.length || !sheet.rows.length) return Response.json({ error: 'File kosong atau baris header tidak ditemukan.' }, { status: 400 });
  const token = await stage(user.id, file.name, sheet);
  return Response.json({
    token,
    fileName: file.name,
    sheet: sheet.sheet,
    headers: sheet.headers,
    rowCount: sheet.rows.length,
    preview: sheet.rows.slice(0, 3).map((r) => r.cells),
  });
});
