import type { StoreView } from './StoreManager';

const pct = (v: number) => `${(v * 100).toFixed(2).replace('.', ',')}%`;
const rp = (v: number) => `Rp${new Intl.NumberFormat('id-ID').format(Math.round(v))}`;

export function FeeAutomationSection({ stores }: { stores: StoreView[] }) {
  return (
    <div className="panel">
      <h2 className="text-lg">Potongan otomatis per toko</h2>
      <p className="note !mt-0.5">Potongan asli dipakai setelah tersedia minimal 5 pesanan. Sebelum itu sistem memakai tarif cadangan.</p>
      <div className="tbl-wrap mt-3"><table className="tbl"><thead><tr><th className="!text-left">Toko</th><th>Sumber tarif</th><th>Admin</th><th>Gratis Ongkir</th><th>Layanan</th><th>Pajak</th><th>AMS</th><th>Proses/pesanan</th></tr></thead><tbody>{stores.map((s) => <tr key={s.id}><td className="!text-left">{s.name}</td><td>{s.effective ? <span className="chip chip-ok">Otomatis · {s.actualOrders} pesanan</span> : <span className="chip chip-mid">Cadangan · {s.actualOrders}/5</span>}</td>{s.effective ? <><td>{pct(s.effective.admin)}</td><td>{pct(s.effective.freeShip)}</td><td>{pct(s.effective.service)}</td><td>{pct(s.effective.tax)}</td><td>{pct(s.effective.ams)}</td><td>{rp(s.effective.process)}</td></> : <><td>{pct(s.fees.feeAdmin)}</td><td>{pct(s.fees.feeFreeShip)}</td><td>{pct(s.fees.feeService)}</td><td>{pct(s.fees.feeTax)}</td><td>{pct(s.fees.feeAms)}</td><td>{rp(s.fees.feeProcess)}</td></>}</tr>)}</tbody></table></div>
    </div>
  );
}
