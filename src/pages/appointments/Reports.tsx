import { useEffect, useMemo, useState } from 'react';
import { getStaffClient } from './auth/staffAuth';

interface ApptRow {
  id: string;
  status: string;
  source: string;
  scheduled_time: string;
  doctor?: { id?: string; full_name: string } | null;
  patient?: { id?: string; full_name: string; contact_number?: string | null } | null;
}

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  created_at: string;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [header.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const NO_SHOW_FLAG_THRESHOLD = 2; // patients with >=2 no-shows get flagged
const REPEAT_NO_SHOW = 3; // >=3 gets the strong "repeat" badge

export default function Reports() {
  const sb = getStaffClient();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return isoDay(d);
  });
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [doctorFilter, setDoctorFilter] = useState('all');
  const [rows, setRows] = useState<ApptRow[]>([]);
  const [doctors, setDoctors] = useState<string[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditAction, setAuditAction] = useState('all');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const s = new Date(`${from}T00:00:00`).toISOString();
    const e = new Date(`${to}T23:59:59`).toISOString();
    setMsg(null);
    sb.from('appointments')
      .select('id,status,source,scheduled_time,doctor:doctors!inner(full_name),patient:patients(full_name,contact_number)')
      .gte('scheduled_time', s)
      .lte('scheduled_time', e)
      .order('scheduled_time')
      .limit(5000)
      .then(({ data, error }) => {
        if (error) {
          setMsg(error.message);
          return;
        }
        const list = (data as unknown as ApptRow[]) ?? [];
        setRows(list);
        setDoctors([...new Set(list.map((r) => r.doctor?.full_name ?? 'Unknown'))].sort());
      });
    sb.from('audit_log')
      .select('id,action,entity,created_at')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setAudit((data as AuditRow[]) ?? []));
  }, [from, to, sb]);

  const scoped = useMemo(
    () => (doctorFilter === 'all' ? rows : rows.filter((r) => (r.doctor?.full_name ?? 'Unknown') === doctorFilter)),
    [rows, doctorFilter]
  );

  const stats = useMemo(() => {
    const perDoctor: Record<string, { total: number; completed: number; cancelled: number; noShow: number; walkIn: number }> = {};
    const perDay: Record<string, number> = {};
    const perPatient: Record<string, { name: string; contact: string; total: number; noShow: number }> = {};
    let ns = 0, cx = 0, walk = 0;
    for (const r of scoped) {
      const dn = r.doctor?.full_name ?? 'Unknown';
      perDoctor[dn] ??= { total: 0, completed: 0, cancelled: 0, noShow: 0, walkIn: 0 };
      perDoctor[dn].total += 1;
      if (r.status === 'completed') perDoctor[dn].completed += 1;
      if (r.status === 'cancelled') { perDoctor[dn].cancelled += 1; cx += 1; }
      if (r.status === 'no_show') { perDoctor[dn].noShow += 1; ns += 1; }
      if (r.source === 'walk_in') { perDoctor[dn].walkIn += 1; walk += 1; }
      const dk = r.scheduled_time.slice(0, 10);
      perDay[dk] = (perDay[dk] ?? 0) + 1;
      const pn = r.patient?.full_name ?? 'Unknown';
      const key = `${pn}|${r.patient?.contact_number ?? ''}`;
      perPatient[key] ??= { name: pn, contact: r.patient?.contact_number ?? '', total: 0, noShow: 0 };
      perPatient[key].total += 1;
      if (r.status === 'no_show') perPatient[key].noShow += 1;
    }
    const total = scoped.length;
    const dayKeys = Object.keys(perDay).sort();
    const maxDay = Math.max(1, ...Object.values(perDay));
    const noShowPatients = Object.values(perPatient)
      .filter((p) => p.noShow >= NO_SHOW_FLAG_THRESHOLD)
      .sort((a, b) => b.noShow - a.noShow);
    return {
      total, perDoctor, perDay, dayKeys, maxDay,
      noShowRate: total ? (ns / total) * 100 : 0,
      cancelRate: total ? (cx / total) * 100 : 0,
      walkInShare: total ? (walk / total) * 100 : 0,
      noShowPatients,
      perDoctorRows: Object.entries(perDoctor).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total),
    };
  }, [scoped]);

  const auditFiltered = auditAction === 'all' ? audit : audit.filter((a) => a.action === auditAction);

  function setPreset(days: number) {
    const t = new Date();
    const f = new Date();
    f.setDate(t.getDate() - (days - 1));
    setFrom(isoDay(f));
    setTo(isoDay(t));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Reports and admin</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {[
              { label: 'Today', days: 1 },
              { label: '7D', days: 7 },
              { label: '30D', days: 30 },
              { label: '90D', days: 90 },
            ].map((p) => (
              <button key={p.label} className="dk-btn-ghost px-2.5 py-1.5 text-xs" onClick={() => setPreset(p.days)}>
                {p.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            From
            <input className="dk-input max-w-[150px]" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            To
            <input className="dk-input max-w-[150px]" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <select className="dk-input max-w-[160px]" value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)}>
            <option value="all">All doctors</option>
            {doctors.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>
      {msg && <p className="text-sm text-red-400">{msg}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="dk-panel">
          <p className="text-xs text-slate-400">Total appointments</p>
          <p className="mt-1 text-3xl font-bold">{stats.total}</p>
        </div>
        <div className="dk-panel">
          <p className="text-xs text-slate-400">No-show rate</p>
          <p className="mt-1 text-3xl font-bold text-red-400">{stats.noShowRate.toFixed(1)}%</p>
        </div>
        <div className="dk-panel">
          <p className="text-xs text-slate-400">Walk-in rate</p>
          <p className="mt-1 text-3xl font-bold">{stats.walkInShare.toFixed(0)}%</p>
        </div>
      </div>

      <div className="dk-panel">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Appointments per doctor</h2>
          <button
            className="dk-btn-ghost px-3 py-1 text-xs"
            onClick={() => downloadCsv('appointments-per-doctor.csv', ['doctor', 'total', 'completed', 'cancelled', 'no_show', 'walk_in'],
              stats.perDoctorRows.map((d) => [d.name, d.total, d.completed, d.cancelled, d.noShow, d.walkIn]))}
          >
            ⭳ CSV
          </button>
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="dk-th">Doctor</th>
                <th className="dk-th">Total</th>
                <th className="dk-th">Done</th>
                <th className="dk-th">No-show rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {stats.perDoctorRows.map((d) => (
                <tr key={d.name}>
                  <td className="dk-td font-medium">{d.name}</td>
                  <td className="dk-td">{d.total}</td>
                  <td className="dk-td">{d.completed}</td>
                  <td className={`dk-td font-semibold ${d.noShow > 0 ? 'text-red-400' : 'text-slate-400'}`}>
                    {d.total ? ((d.noShow / d.total) * 100).toFixed(1) : '0.0'}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats.perDoctorRows.length === 0 && <p className="py-2 text-sm text-slate-500">No data in range.</p>}
        </div>
      </div>

      <div className="dk-panel">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Appointments per day</h2>
          <button
            className="dk-btn-ghost px-3 py-1 text-xs"
            onClick={() => downloadCsv('appointments-per-day.csv', ['date', 'count'], stats.dayKeys.map((k) => [k, stats.perDay[k]]))}
          >
            ⭳ CSV
          </button>
        </div>
        {stats.dayKeys.length === 0 ? (
          <p className="py-2 text-sm text-slate-500">No data in range.</p>
        ) : (
          <div className="mt-3 flex items-end gap-1 overflow-x-auto" style={{ minHeight: 120 }}>
            {stats.dayKeys.map((k) => (
              <div key={k} className="flex w-10 shrink-0 flex-col items-center" title={`${k}: ${stats.perDay[k]}`}>
                <span className="text-[10px] text-slate-400">{stats.perDay[k]}</span>
                <div className="w-6 rounded-t bg-[#4ea895]" style={{ height: `${Math.max(4, (stats.perDay[k] / stats.maxDay) * 100)}px` }} />
                <span className="text-[9px] text-slate-500">{k.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {stats.noShowPatients.length === 0 ? (
        <div className="dk-panel border-green-500/20 bg-green-500/10">
          <p className="text-sm font-medium text-green-400">✓ No repeat no-shows in this range.</p>
        </div>
      ) : (
        <div className="dk-panel">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">No-show tracking (flagged ≥ {NO_SHOW_FLAG_THRESHOLD})</h2>
            <button
              className="dk-btn-ghost px-3 py-1 text-xs"
              onClick={() => downloadCsv('no-show-patients.csv', ['patient', 'contact', 'appointments', 'no_shows'],
                stats.noShowPatients.map((p) => [p.name, p.contact, p.total, p.noShow]))}
            >
              ⭳ CSV
            </button>
          </div>
          <div className="mt-2 divide-y divide-white/5 text-sm">
            {stats.noShowPatients.map((p) => (
              <div key={`${p.name}|${p.contact}`} className="flex flex-wrap items-center gap-2 py-1.5">
                <span className="font-medium">{p.name}</span>
                <span className="text-slate-500">{p.contact}</span>
                <span className="dk-pill bg-red-500/15 text-red-400">{p.noShow} no-show / {p.total} appts</span>
                {p.noShow >= REPEAT_NO_SHOW && <span className="dk-pill bg-red-600 text-white">repeat no-show — call patient</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="dk-panel">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Audit log (admin only)</h2>
          <select className="dk-input max-w-[180px]" value={auditAction} onChange={(e) => setAuditAction(e.target.value)}>
            <option value="all">all actions</option>
            {[...new Set(audit.map((a) => a.action))].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="mt-2 divide-y divide-white/5 text-sm">
          {auditFiltered.slice(0, 100).map((a) => (
            <div key={a.id} className="py-1.5 text-slate-300">{new Date(a.created_at).toLocaleString()} · {a.entity} · {a.action}</div>
          ))}
          {auditFiltered.length === 0 && <p className="py-2 text-sm text-slate-500">Empty — no activity yet, filter excludes all, or you are not admin (RLS).</p>}
        </div>
      </div>
    </div>
  );
}
