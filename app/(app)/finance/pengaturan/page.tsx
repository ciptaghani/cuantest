import type { Metadata } from 'next';
import { ActBtn } from '@/components/ActBtn';
import { requireArea } from '@/lib/auth/guard';
import { ACC, ACCOUNT_TYPE_LABEL, type AccountType } from '@/lib/finance';
import { getFinanceInput, getFinanceSettings } from '@/lib/repo/finance';
import { AddForm, SaveField } from '../../operasional/inputs';
import { accountAdd, accountRemove, bankAdd, bankRemove, bankUpdate, openingFromStock, setOpening, setStart } from '../actions';

export const metadata: Metadata = { title: 'Pengaturan akun · Cuan Lens' };

const CUSTOM_TYPES = (Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).filter((t) => t !== 'REVENUE' && t !== 'COGS');

export default async function Page() {
  await requireArea('FINANCE');
  const [fin, set] = await Promise.all([getFinanceInput(), getFinanceSettings()]);
  const openAccs = set.accounts.filter((a) => a.type === 'ASSET' || a.type === 'LIABILITY');

  return (
    <div className="panel">
      <h2 className="text-lg">Pengaturan akun</h2>

      <h3 className="dh">Rekening bank & kas</h3>
      <div className="tbl-wrap max-w-[760px]">
        <table className="tbl">
          <thead>
            <tr>
              <th>Kode</th>
              <th>Nama bank</th>
              <th>No. rekening</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {set.banks.map((b) => (
              <tr key={b.id}>
                <td>{b.code}</td>
                <td>
                  <SaveField action={bankUpdate} input={{ id: b.id }} field="name" type="text" value={b.name} label="Nama bank" />
                </td>
                <td>
                  <SaveField action={bankUpdate} input={{ id: b.id }} field="number" type="text" value={b.number} label="No. rekening" />
                </td>
                <td>
                  <ActBtn action={bankRemove} input={{ id: b.id }} confirm={`Hapus rekening ${b.name}?`}>
                    Hapus
                  </ActBtn>
                </td>
              </tr>
            ))}
            {!set.banks.length && (
              <tr>
                <td colSpan={4} className="text-muted">
                  Belum ada rekening.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <AddForm
        action={bankAdd}
        submit="Tambah rekening"
        fields={[
          { name: 'name', label: 'Nama bank', placeholder: 'mis. BCA', width: 160, required: true },
          { name: 'number', label: 'No. rekening (+ atas nama)', width: 240 },
        ]}
      />
      <p className="note">Kas Tunai selalu tersedia. Saldo marketplace dibuat otomatis untuk tiap toko di menu Data.</p>

      <h3 className="dh">Saldo awal pembukuan</h3>
      <label className="field w-max">
        <span>Tanggal mulai pembukuan</span>
        <SaveField action={setStart} input={{}} field="start" type="date" value={fin.start} label="Tanggal mulai pembukuan" />
      </label>
      <div className="tbl-wrap mt-3 max-w-[760px]">
        <table className="tbl">
          <thead>
            <tr>
              <th>Akun</th>
              <th>Tipe</th>
              <th className="r">Saldo awal</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {openAccs.map((a) => (
              <tr key={a.code}>
                <td>{a.name}</td>
                <td>{ACCOUNT_TYPE_LABEL[a.type]}</td>
                <td className="r">
                  {/* key: nilai baru dari "ambil dari stok" langsung tampil */}
                  <SaveField key={fin.opening[a.code] ?? ''} action={setOpening} input={{ code: a.code }} field="amount" value={fin.opening[a.code] ?? null} emptyNull className="qin !w-[150px]" label={`Saldo awal ${a.name}`} />
                </td>
                <td>
                  {a.code === ACC.inventory && (
                    <ActBtn action={openingFromStock} input={{}} className="btn-ghost btn-sm" confirm="Isi saldo awal persediaan dari stok sekarang × HPP sekarang?">
                      Ambil dari nilai stok Operasional
                    </ActBtn>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">Selisih aset dan kewajiban otomatis masuk ke Ekuitas Saldo Awal. Transaksi sebelum tanggal mulai tidak dihitung.</p>

      <h3 className="dh">Daftar akun</h3>
      <div className="tbl-wrap max-w-[760px]">
        <table className="tbl">
          <thead>
            <tr>
              <th>Kode</th>
              <th>Nama</th>
              <th>Tipe</th>
              <th>Grup laporan</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {set.accounts
              .filter((a) => !a.isBank && !a.isWallet)
              .map((a) => (
                <tr key={a.code}>
                  <td>{a.code}</td>
                  <td>{a.name}</td>
                  <td>{ACCOUNT_TYPE_LABEL[a.type]}</td>
                  <td>{a.group}</td>
                  <td>
                    {!a.isSystem && (
                      <ActBtn action={accountRemove} input={{ code: a.code }} confirm={`Hapus akun ${a.code} ${a.name}?`}>
                        Hapus
                      </ActBtn>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <AddForm
        action={accountAdd}
        submit="Tambah akun"
        fields={[
          { name: 'code', label: 'Kode', placeholder: '6-700', width: 90, required: true },
          { name: 'name', label: 'Nama akun', width: 220, required: true },
          { name: 'type', label: 'Tipe', type: 'select', defaultValue: 'EXPENSE', options: CUSTOM_TYPES.map((t) => [t, ACCOUNT_TYPE_LABEL[t]]) },
          { name: 'group', label: 'Grup (opsional)', width: 150 },
        ]}
      />
    </div>
  );
}
