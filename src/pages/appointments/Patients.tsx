import { useEffect, useState } from 'react';
import { getStaffClient } from './auth/staffAuth';
import type { Patient } from '../../lib/types';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export default function Patients() {
  const sb = getStaffClient();
  const [qName, setQName] = useState('');
  const [qDob, setQDob] = useState('');
  const [qContact, setQContact] = useState('');
  const [results, setResults] = useState<Patient[]>([]);
  const [searched, setSearched] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [form, setForm] = useState({ full_name: '', date_of_birth: '', contact_number: '', address: '' });
  const [msg, setMsg] = useState<string | null>(null);

  async function search() {
    setMsg(null);
    let query = sb.from('patients').select('*').order('full_name').limit(50);
    if (qName.trim()) query = query.ilike('full_name', `%${qName.trim()}%`);
    if (qContact.trim()) query = query.ilike('contact_number', `%${qContact.trim()}%`);
    if (qDob) query = query.eq('date_of_birth', qDob);
    const { data, error } = await query;
    if (error) setMsg(error.message);
    setResults((data as Patient[]) ?? []);
    setSearched(true);
  }

  useEffect(() => {
    void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startCreate() {
    setEditing({ id: '', full_name: qName, date_of_birth: qDob || null, contact_number: qContact || null } as Patient);
    setForm({ full_name: qName, date_of_birth: qDob, contact_number: qContact, address: '' });
  }

  function startEdit(p: Patient) {
    setEditing(p);
    setForm({
      full_name: p.full_name,
      date_of_birth: p.date_of_birth ?? '',
      contact_number: p.contact_number ?? '',
      address: p.address ?? '',
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!form.full_name.trim()) {
      setMsg('Full name is required.');
      return;
    }
    // Duplicate guard: exact name+DOB or exact contact match
    if (!editing?.id) {
      const { data: dup } = await sb
        .from('patients')
        .select('id,full_name,date_of_birth,contact_number')
        .ilike('full_name', form.full_name.trim())
        .limit(5);
      const same = (dup as Patient[] | null) ?? [];
      const clash = same.some(
        (d) =>
          (form.date_of_birth && d.date_of_birth === form.date_of_birth) ||
          (form.contact_number && d.contact_number === form.contact_number)
      );
      if (clash) {
        setMsg('Possible duplicate: a patient with the same name + DOB/contact already exists. Please reuse that record.');
        return;
      }
    }
    const payload = {
      full_name: form.full_name.trim(),
      date_of_birth: form.date_of_birth || null,
      contact_number: form.contact_number.trim() || null,
      address: form.address.trim() || null,
    };
    if (editing?.id) {
      const { error } = await sb.from('patients').update(payload).eq('id', editing.id);
      if (error) setMsg(error.message);
      else {
        setMsg('Patient updated.');
        setEditing(null);
        void search();
      }
    } else {
      const { error } = await sb.from('patients').insert(payload);
      if (error) setMsg(error.message);
      else {
        setMsg('Patient created.');
        setEditing(null);
        void search();
      }
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Patients</h1>
        <p className="text-sm text-slate-400">
          Search by name and date of birth or contact number before creating a new record.
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
        <input className="dk-input" placeholder="Name" value={qName} onChange={(e) => setQName(e.target.value)} />
        <input className="dk-input" type="date" value={qDob} onChange={(e) => setQDob(e.target.value)} />
        <input className="dk-input" placeholder="Contact number" value={qContact} onChange={(e) => setQContact(e.target.value)} />
        <button className="dk-btn-primary" onClick={() => void search()}>Search</button>
      </div>

      {msg && <p className="text-sm text-slate-300">{msg}</p>}

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{searched ? `${results.length} results` : 'Results'}</p>
        <button className="dk-btn-ghost" onClick={startCreate}>＋ New patient</button>
      </div>

      <div className="space-y-2">
        {results.map((p) => (
          <div key={p.id} className="dk-panel flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0e4a3a]/25 text-sm font-bold text-[#9fd8cb]">
              {initials(p.full_name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{p.full_name}</p>
              <p className="text-xs text-slate-500">
                Born {p.date_of_birth ?? '—'} · {p.contact_number ?? '—'}
              </p>
            </div>
            <button className="dk-btn-ghost shrink-0" onClick={() => startEdit(p)}>Edit</button>
          </div>
        ))}
        {searched && results.length === 0 && (
          <div className="dk-panel"><p className="py-2 text-sm text-slate-500">No matches — you may create a new patient.</p></div>
        )}
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setEditing(null)}
        >
          <form
            onSubmit={save}
            className="dk-panel w-full max-w-lg space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold">{editing.id ? 'Edit patient' : 'Create patient'}</h2>
            <input className="dk-input" placeholder="Full name *" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
            <div className="grid gap-2 md:grid-cols-2">
              <input className="dk-input" type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
              <input className="dk-input" placeholder="Contact number" value={form.contact_number} onChange={(e) => setForm({ ...form, contact_number: e.target.value })} />
            </div>
            <input className="dk-input" placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <div className="flex gap-2">
              <button className="dk-btn-primary" type="submit">Save</button>
              <button className="dk-btn-ghost" type="button" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
