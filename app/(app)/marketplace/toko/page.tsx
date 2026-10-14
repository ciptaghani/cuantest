import type { Metadata } from 'next';
import { Empty } from '@/components/Kpi';
import { requireArea } from '@/lib/auth/guard';
import type { SP } from '@/components/qs';
import { formatNumber as NF, pc, rp, xx } from '@/lib/format';
import { marginClass, type Aggregate } from '@/lib/marketplace';
import { MpFilters } from '../MpFilters';
import { ChannelChip, netCls } from '../ui';
import { loadMpView } from '../view';

export const metadata: Metadata = { title: 'Per Toko · Cuan Lens' };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  await requireArea('MARKETPLACE');
  const v = await loadMpView(await searchParams);
  const rows = v.R ? [...v.R.stores].sort((a, b) => b.omzet - a.omzet) : [];
  const Row = ({ s, name, tot }: { s: Aggregate; name: React.ReactNode; tot?: boolean }) => {
    const cls = !Number.isFinite(s.roas) ? '' : !Number.isFinite(s.be) ? 'neg' : s.roas < s.be ? 'neg' : 'pos';
    return (
      <tr className={tot ? 'tot' : ''}>
        <td>{name}</td>
        <td className="r">{NF(s.orderN)}</td>
        <td className="r">{s.qty}</td>
        <td className="r">{rp(s.omzet)}</td>
        <td className="r">{rp(s.hpp)}</td>
        <td className="r">{rp(s.gp)}</td>
        <td className="r">{rp(s.mp)}</td>
        <td className="r">{pc(s.omzet ? s.mp / s.omzet : NaN)}</td>
        <td className="r">{rp(s.ams)}</td>
        <td className="r">{rp(s.ads)}</td>
        <td className={`r ${netCls(s.net)}`}>{rp(s.net)}</td>
        <td className={`r ${marginClass(s.margin, v.target)}`}>{pc(s.margin)}</td>
        <td className={`r ${cls}`}>{xx(s.roas)}</td>
        <td className="r">{Number.isFinite(s.be) ? xx(s.be) : 'rugi'}</td>
        <td className="r">{pc(s.estPct, 0)}</td>
      </tr>
    );
  };
  return (
    <>
      <MpFilters v={v} />
      <div className="panel">
        <h2 className="text-lg">Ringkasan per toko</h2>
        <p className="sub">ROAS impas = ROAS minimum supaya iklan tidak bikin rugi. Kalau ROAS aktual di bawahnya, setiap rupiah iklan menggerus laba.</p>
        {v.R ? (
          <div className="tbl-wrap mt-4">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Toko</th>
                  <th className="r">Pesanan</th>
                  <th className="r">Qty</th>
                  <th className="r">Omzet</th>
                  <th className="r">HPP</th>
                  <th className="r">Laba kotor</th>
                  <th className="r">Potongan</th>
                  <th className="r">% potongan</th>
                  <th className="r">AMS</th>
                  <th className="r">Iklan</th>
                  <th className="r">Laba bersih</th>
                  <th className="r">Margin</th>
                  <th className="r">ROAS</th>
                  <th className="r">ROAS impas</th>
                  <th className="r">Estimasi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <Row
                    key={s.id}
                    s={s}
                    name={
                      <>
                        {s.name} <ChannelChip channel={s.channel} />
                      </>
                    }
                  />
                ))}
                {rows.length > 1 && <Row s={v.R.total} name="Total" tot />}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Belum ada data pesanan" />
        )}
        <p className="note">Estimasi = porsi baris pesanan yang potongannya masih memakai tarif (belum ada di laporan penghasilan). Target margin bersih {v.target}% diatur di Data → Import / export.</p>
      </div>
    </>
  );
}
