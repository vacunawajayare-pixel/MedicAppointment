# Setup Guide — MedicAppointment

Local development setup from zero to running app.

## Prerequisites

- **Node.js 18+** and **npm** (`node -v`, `npm -v`)
- **Git**
- A **Supabase** project (free tier is fine):
  - Project URL — `https://<project-ref>.supabase.co`
  - `anon` public key — Project Settings → API
  - (Only for admin bootstrap / scripts) `service_role` key — keep secret,
    never put it in `.env` or frontend code
- Optional: Supabase CLI (only if deploying Edge Functions / cron)

## 1. Clone and install

```bash
git clone https://github.com/vacunawajayare-pixel/MedicAppointment.git
cd MedicAppointment   # folder on disk is MedicalAppointment
npm install
```

## 2. Environment file

```bash
cp .env.example .env
```

Edit `.env`:

```ini
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_NOTIFY_ENABLED=false
```

- Leave `VITE_NOTIFY_ENABLED=false` until the `send-confirmation`
  Edge Function is deployed (otherwise booking skips the invoke —
  this is intentional, avoids CORS noise).
- `.env` is git-ignored. Never commit keys.

## 3. Database — schema + realtime

1. Open your Supabase project → **SQL Editor**.
2. Paste the entire `supabase/schema.sql` and run it.
   - Safe to re-run (all statements are `IF NOT EXISTS` / `DROP IF EXISTS` /
     `CREATE OR REPLACE`).
3. Run the realtime line from **section 6** of that file separately
   (as the header comment instructs).

## 4. Demo data (optional but recommended)

Run `supabase/seedusers.sql` in the SQL Editor **after** the schema.
It inserts (all `ON CONFLICT DO NOTHING`, safe to re-run):

- 4 doctors (General medicine, Pediatrics, OB-Gyne, Dentistry)
- Mon–Fri 08:00–17:00 schedules, 30-min slots
- Patients and appointments across yesterday / today / tomorrow / next week
  covering every status — so Dashboard, Booking, Check-in, Patients,
  Doctors, and Reports all render immediately.

## 5. Users — admin + kiosk

Auth passwords are hashed by GoTrue and **cannot** be inserted with SQL.
Follow `supabase/seed_admin.sql` (three options, easiest first):

**Option A — Dashboard (recommended)**
1. Authentication → Users → Add user → Create new user:
   - Email: `vacunawa@rhu.com.ph`, Password: `admin123`, **Auto Confirm User** ✓
2. Copy the new user's UUID, then in SQL Editor:
   ```sql
   insert into profiles (id, full_name, role)
   values ('<PASTE_UUID_HERE>', 'RHU Admin', 'admin')
   on conflict (id) do update set role = 'admin', full_name = 'RHU Admin';
   ```
3. Verify: `select id, full_name, role from profiles where id = '<PASTE_UUID_HERE>';`
   → expect `role = 'admin'`.

**Option B** — Auth Admin API with `service_role` key (curl in `seed_admin.sql`).
**Option C** — `node create_admin.cjs` from the `supabase/` folder
(needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env vars).

**Board / kiosk accounts** (after admin works) — same flow with
`role = 'board'`, e.g. `board-kiosk-01@rhu.local`:

```sql
insert into profiles (id, full_name, role, device_label)
values ('<BOARD_UUID>', 'Lobby Kiosk 01', 'board', 'lobby-kiosk-01')
on conflict (id) do update set role = 'board', device_label = 'lobby-kiosk-01';
```

The staff login form pre-fills `vacunawa@rhu.com.ph` for convenience.

## 6. Run the app

```bash
npm run dev
```

Open **http://localhost:5173** (Vite default for this project: port `5173`).

| URL | Login | Result |
|---|---|---|
| `/appointments/login` | `vacunawa@rhu.com.ph` / `admin123` | Staff workspace (`/appointments/dashboard` …) |
| `/queue-board/login` | your `board-*` account | Live display (`/queue-board/display`) |

## 7. Build / preview

```bash
npm run build     # type-check + build to dist/
npm run preview   # serve the production build locally
```

> Windows PowerShell note: `npm run build` may fail with
> `error TS5025: Unknown compiler option '--noEmit;'` because the script
> uses `;` (not a `cmd.exe` separator). Run instead:
> ```powershell
> npx tsc --noEmit; if ($?) { npx vite build }
> ```

## 8. Notifications (optional)

Edge Functions are provider-agnostic stubs — with no keys configured they
log and return `stubbed: true`, and booking shows "logged (no provider)".

1. Read `supabase/NOTIFICATIONS.md` (source of truth).
2. Deploy:
   ```bash
   supabase functions deploy send-confirmation
   supabase functions deploy send-reminders
   supabase secrets set CRON_SECRET=$(openssl rand -hex 32)
   ```
3. When ready to send for real:
   ```bash
   supabase secrets set RESEND_API_KEY=... NOTIFY_FROM_EMAIL=...
   supabase secrets set TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_FROM_NUMBER=...
   ```
4. Fill `<PROJECT_REF>` / `<CRON_SECRET>` in `supabase/cron.sql` and run it
   (or schedule 07:00 daily in Dashboard → Edge Functions → Schedules).
5. Set `VITE_NOTIFY_ENABLED=true` in `.env` and restart dev server.
6. Test: book an appointment → "Confirmation sent ✓";
   board sessions invoking `send-confirmation` get `403 staff only` (by design).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY` | `.env` missing or dev server started before creating it — create `.env`, restart `npm run dev` |
| Login succeeds but redirected back to login | No `profiles` row / wrong `role` for that portal — check `select * from profiles where id = '<uuid>'`; staff needs `receptionist`/`doctor`/`admin`, kiosk needs `board` |
| Queue board stuck on Connecting/Polling | Realtime not enabled or section-6 line not run; app falls back to 7s polling + 30s safety poll — run the realtime statement, check browser console |
| Booking shows notification error / CORS noise | `VITE_NOTIFY_ENABLED` is true but function not deployed — set it back to `false` until deployed |
| `TS5025 --noEmit;` on `npm run build` (Windows) | See §7 workaround |
| Port 5173 in use | `npx vite --port 5174` or stop the other process |
| Pushed 403 `Permission denied` | Collaborator invite not accepted or stale Windows credential — accept invite as that GitHub user, then `echo "url=https://github.com" \| git credential-manager reject` and push again |
