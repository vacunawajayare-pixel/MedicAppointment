# MedicAppointment

Clinic staff portal + live queue-board kiosk for a Rural Health Unit (RHU).
Staff manage appointments, check-ins, patients, doctors, and reports.
A separate kiosk display shows the live queue (priority + regular lanes).

> Full local setup: see **[setup.md](./setup.md)**.

## Features

**Staff portal** (`/appointments/*`)
- Dashboard, appointment booking with slot picker, check-in / status flow
- Patients, doctors (+ schedules / unavailable dates), reports, settings
- Dark / light theme (persisted, follows OS on first visit)
- Responsive login with DOH emblem watermark that never crops or stretches

**Queue board kiosk** (`/queue-board/*`)
- Now-serving hero, priority lane + regular lane, live clock
- Realtime updates with polling + safety-net fallback and freshness footer
- Kiosk-only session, fully isolated from staff auth

**Platform**
- Role-based access (RLS): `receptionist` / `doctor` / `admin` (staff), `board` (kiosk)
- Booking confirmation + daily reminder Edge Functions
  (provider-agnostic stubs — log only until Resend/Twilio keys are added).
  Details: `supabase/NOTIFICATIONS.md`

## Tech stack

| Layer | Choice |
|---|---|
| UI | React 18, React Router 6, Tailwind CSS 3 |
| Build | Vite 5, TypeScript 5 |
| Backend | Supabase (Auth, Postgres + RLS, Realtime, Edge Functions) |
| Dev server port | `5173` |

## Routes

| Path | Who | What |
|---|---|---|
| `/` | — | Redirects to `/appointments/login` |
| `/appointments/login` | Staff | Staff sign-in |
| `/appointments/dashboard` … `/booking`, `/check-in`, `/patients`, `/doctors`, `/reports`, `/settings` | `receptionist` / `doctor` / `admin` | Staff workspace |
| `/queue-board/login` | Kiosk | Board sign-in |
| `/queue-board/display` | `board` | Live lobby display |

Staff and board sessions are isolated (separate Supabase clients / storage keys) —
a staff login never leaks into the kiosk and vice versa.

## Quickstart

```bash
npm install
cp .env.example .env   # then fill in your Supabase values
npm run dev            # http://localhost:5173
```

Then set up the database and users per **[setup.md](./setup.md)**.

## Scripts

| Command | What |
|---|---|
| `npm run dev` | Start Vite dev server (port 5173) |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run preview` | Preview the production build |

> Windows note: `npm run build` runs `tsc --noEmit; vite build`, and `;`
> is not a `cmd.exe` separator, so it can fail with
> `error TS5025: Unknown compiler option '--noEmit;'`.
> Workaround in PowerShell:
> `npx tsc --noEmit; if ($?) { npx vite build }`

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | e.g. `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon (public) key |
| `VITE_NOTIFY_ENABLED` | No | Set `'true'` only after deploying the `send-confirmation` Edge Function; otherwise booking skips the invoke (default off) |

See `.env.example`. Never commit `.env` (already git-ignored).

## Project structure

```
├── index.html
├── public/
│   ├── background.jpg        # DOH emblem (login watermark, contained — never cover)
│   └── rhu.jpg               # RHU logo / favicon
├── src/
│   ├── App.tsx               # route groups: /appointments/*, /queue-board/*
│   ├── main.tsx
│   ├── index.css             # Tailwind + responsive login-background system
│   ├── components/LoginShell.tsx
│   ├── lib/                  # theme, supabase client factory, slots, types
│   └── pages/
│       ├── appointments/     # staff portal + auth/
│       └── queue-board/      # kiosk display + auth/
├── supabase/
│   ├── schema.sql            # full schema + RLS (run once, re-runnable)
│   ├── seedusers.sql / seed.cjs
│   ├── seed_admin.sql / create_admin.cjs   # admin bootstrap guide
│   ├── cron.sql / rls_tests.sql
│   └── functions/            # send-confirmation, send-reminders, _shared/notify
└── scripts/verify_stage6.mjs
```

## Database & auth (summary)

1. Run `supabase/schema.sql` once in the Supabase SQL Editor (plus the
   realtime line in section 6).
2. Optionally run `supabase/seedusers.sql` for demo doctors / schedules /
   patients / appointments.
3. Create users via **Authentication > Users**, then link `profiles` rows
   with roles — walkthrough in `supabase/seed_admin.sql`.
4. Default bootstrap admin: `vacunawa@rhu.com.ph` / `admin123`
   (create it manually — passwords can't be inserted via SQL).

Full steps: **[setup.md](./setup.md)**.
