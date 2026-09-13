import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBoardAuth } from './auth/boardAuth';
import LoginShell, { LoginOptionsRow } from '../../components/LoginShell';
import PasswordInput from '../../components/PasswordInput';

// Logic below is unchanged: board-only sign-in, navigate to display.
export default function BoardLogin() {
  const { signIn } = useBoardAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const msg = await signIn(email.trim(), password);
    setBusy(false);
    if (msg) setErr(msg);
    else nav('/queue-board/display', { replace: true });
  }

  return (
    <LoginShell
      brand="RHU PORTAL"
      portalTag="KIOSK"
      title="Queue Board Display"
      features={[
        'Now Serving Display',
        'Priority Lane',
        'Regular Lane',
        'Realtime Updates',
        'Kiosk Mode',
      ]}
      tabs={[
        { label: 'Staff Login', to: '/appointments/login', active: false },
        { label: 'Board Login', to: '/queue-board/login', active: true },
      ]}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
          <input
            className="w-full rounded-lg border-[1.5px] border-[#0f3d2e]/80 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#4ea895]"
            type="email"
            placeholder="kiosk@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Password</label>
          <PasswordInput
            className="w-full rounded-lg border-[1.5px] border-[#0f3d2e]/80 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#4ea895]"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            required
          />
        </div>
        <LoginOptionsRow />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button
          className="w-full rounded-lg bg-[#0a3a23] px-4 py-2.5 text-sm font-bold tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          disabled={busy}
        >
          {busy ? 'SIGNING IN…' : 'LOGIN'}
        </button>
      </form>
    </LoginShell>
  );
}
