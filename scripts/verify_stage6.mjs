// Stage 6 verification: board isolation, double-booking, live-update wiring.
// Static checks ALWAYS run. Live Supabase checks run only when env is set:
//   SUPABASE_URL, SUPABASE_ANON_KEY, BOARD_EMAIL, BOARD_PASSWORD
//   [STAFF_EMAIL, STAFF_PASSWORD] for the live double-booking test.
// Usage: node scripts/verify_stage6.mjs
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}
const read = (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : '');

const schema = read('supabase/schema.sql');
const board = read('src/pages/queue-board/BoardDisplay.tsx');
const boardAuth = read('src/pages/queue-board/auth/boardAuth.tsx');
const staffAuth = read('src/pages/appointments/auth/staffAuth.tsx');
const booking = read('src/pages/appointments/Booking.tsx');

// 1. Double-booking constraint at DB level
check(
  'double-booking unique index (doctor_id, scheduled_time) excluding cancelled/no_show',
  /create unique index if not exists uq_doctor_slot[\s\S]*?where status not in \('cancelled','no_show'\)/.test(schema)
);
check('booking UI surfaces 23505 as taken-slot', /23505/.test(booking));

// 2. Board isolation in SQL: staff policies never include 'board' on base tables
const staffPolicyBlocks = [...schema.matchAll(/create policy "staff_all_\w+" on (\w+)[\s\S]*?with check \(([\s\S]*?)\);/g)];
const baseTables = ['doctors', 'doctor_schedules', 'doctor_unavailable_dates', 'patients', 'patient_visit_notes', 'appointments'];
for (const t of baseTables) {
  const covered = staffPolicyBlocks.some((m) => m[1] === t);
  check(`base table ${t} has staff-only RLS policy`, covered);
}
check(
  'no base-table policy grants role=board',
  !/create policy "staff_all_\w+"[\s\S]*?role in \([^)]*'board'/.test(schema),
  'staff_all_* policies list receptionist/doctor/admin only'
);
check(
  'get_queue_today() enforces board/staff role + 42501',
  /create function get_queue_today[\s\S]*?role in \('board'/.test(schema) && /42501/.test(schema)
);

// 3. Board app reads ONLY via get_queue_today()
// ('appointments' may appear ONLY as the postgres_changes subscription
// filter — an invalidation signal carrying no row data, not a read.)
check('board display calls rpc get_queue_today', /rpc\(['"]get_queue_today['"]\)/.test(board));
const boardFromTables = [...board.matchAll(/\.from\(['"](\w+)['"]\)/g)].map((m) => m[1]);
check('board display queries zero base tables', boardFromTables.length === 0, `found: ${boardFromTables.join(',') || 'none'}`);
const boardApptRefs = [...board.matchAll(/['"]appointments['"]/g)];
const boardApptOk = boardApptRefs.every((m) => {
  const line = board.slice(Math.max(0, m.index - 120), m.index);
  return /postgres_changes/.test(line) || /table:\s*$/.test(line);
});
check('board references appointments only as realtime filter (no reads)', boardApptOk);
for (const t of ['patients', 'doctors', 'audit_log']) {
  check(`board display never references '${t}'`, !board.includes(`'${t}'`) && !board.includes(`"${t}"`));
}
check('board listens for queue-changed broadcast ping', /broadcast/.test(board) && /queue-changed/.test(board));
check('board has live clock + now-serving/waiting lanes',
  /setInterval\(\(\) => setNow/.test(board) && /Priority lane/.test(board) && /Regular lane/.test(board) && /Now serving/.test(board));
check('schema exposes is_priority to the board (view + rpc, default false)',
  /is_priority boolean not null default false/.test(schema) && /a\.is_priority/.test(schema) && /is_priority boolean,/.test(schema));

// 4. Separate sessions, no cross-imports (strip comments first — the
// boundary is documented in header comments, which must not trip the check)
check('staff + board use distinct storage keys',
  /medical-appointments-staff/.test(staffAuth) && /medical-queue-board/.test(boardAuth));
const stripComments = (s) => s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const boardCode = stripComments(board + '\n' + boardAuth);
const staffCode = stripComments(staffAuth);
const importRe = /from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const boardImports = [...boardCode.matchAll(importRe)].map((m) => m[1] ?? m[2]);
const staffImports = [...staffCode.matchAll(importRe)].map((m) => m[1] ?? m[2]);
check('board never imports appointments-section code',
  !boardImports.some((p) => p.includes('pages/appointments') || p.includes('../appointments')),
  boardImports.join(', ') || 'no section imports');
check('staff auth never imports queue-board code',
  !staffImports.some((p) => p.includes('queue-board')),
  staffImports.join(', ') || 'no section imports');
const ping = read('src/lib/queuePing.ts');
const checkIn = read('src/pages/appointments/CheckIn.tsx');
check('staff emits queue-changed ping after mutations (auth-free lib helper)',
  /pingQueueChanged/.test(ping) && /pingQueueChanged\(sb\)/.test(checkIn) && /pingQueueChanged\(sb\)/.test(booking));
check('booking never sends raw text to recurrence_parent_id (Bug 2)',
  /isUuid\(followUpOf\)/.test(booking) && /Follow-up of… \(optional\)/.test(booking) && !/placeholder="Follow-up of appointment id/.test(booking));
check('booking notes go to patient_visit_notes text column (Bug 2)',
  /from\('patient_visit_notes'\)\.insert\([\s\S]*?appointment_id: newId/.test(booking));
check('dashboard + check-in share dayRangeIso bounds (Bugs 3/4)',
  /dayRangeIso/.test(read('src/lib/slots.ts')) && /dayRangeIso\(dateKey\)/.test(read('src/pages/appointments/Dashboard.tsx')) && /dayRangeIso\(dateKey\)/.test(checkIn));
check('router future flags set (Bug 7)', /v7_startTransition/.test(read('src/main.tsx')) && /v7_relativeSplatPath/.test(read('src/main.tsx')));
check('shared LoginShell holds no auth logic (boundary)',
  !/supabase|useStaffAuth|useBoardAuth|signIn/.test(read('src/components/LoginShell.tsx')));
check('staff shell uses dark sidebar layout',
  /staff-dark/.test(read('src/pages/appointments/StaffLayout.tsx')) && /Clinic staff/.test(read('src/pages/appointments/StaffLayout.tsx')));
check('staff pages use dark panels (no light card/input leftovers)',
  ['Dashboard.tsx', 'Booking.tsx', 'CheckIn.tsx', 'Patients.tsx', 'Doctors.tsx', 'Reports.tsx'].every((f) => {
    const c = read(`src/pages/appointments/${f}`);
    return /dk-panel/.test(c) && !/className="card[ "]/.test(c) && !/className="input[ "]/.test(c);
  }));

// 5. Realtime wiring: channel on appointments + refetch + fallback + states
check('board subscribes postgres_changes on appointments',
  /postgres_changes/.test(board) && /table:\s*['"]appointments['"]/.test(board));
check('board refetches queue on change events', /\.on\(\s*['"]postgres_changes['"][\s\S]*?fetchQueue\(\)/.test(board));
check('board has polling fallback interval', /FALLBACK_POLL_MS/.test(board) && /setInterval/.test(board));
check('board shows reconnecting/live/polling states', /reconnecting/.test(board) && /polling/.test(board) && /SUBSCRIBED/.test(board));
check('realtime publication statement documented', /supabase_realtime add table appointments/.test(schema));

// ---- Live checks (skipped without env) ----
const env = process.env;
if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.BOARD_EMAIL && env.BOARD_PASSWORD) {
  const { createClient } = await import('@supabase/supabase-js');
  const b = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: loginErr } = await b.auth.signInWithPassword({ email: env.BOARD_EMAIL, password: env.BOARD_PASSWORD });
  check('live: board login succeeds', !loginErr, loginErr?.message ?? '');
  if (!loginErr) {
    for (const t of ['patients', 'appointments', 'doctors', 'audit_log']) {
      const { data, error } = await b.from(t).select('id').limit(1);
      check(`live: board sees 0 rows on ${t}`, !error && (data ?? []).length === 0, error?.message ?? `${(data ?? []).length} rows`);
    }
    const { data: q, error: qErr } = await b.rpc('get_queue_today');
    check('live: board rpc get_queue_today works', !qErr && Array.isArray(q), qErr?.message ?? '');
    await b.auth.signOut();
  }
  if (env.STAFF_EMAIL && env.STAFF_PASSWORD) {
    const s = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    await s.auth.signInWithPassword({ email: env.STAFF_EMAIL, password: env.STAFF_PASSWORD });
    const { data: docs } = await s.from('doctors').select('id').eq('is_active', true).limit(1);
    const { data: pats } = await s.from('patients').select('id').limit(1);
    if (docs?.length && pats?.length) {
      const slot = new Date(Date.now() + 7 * 864e5).toISOString();
      const first = await s.from('appointments').insert({ doctor_id: docs[0].id, patient_id: pats[0].id, scheduled_time: slot }).select('id').single();
      if (!first.error) {
        const second = await s.from('appointments').insert({ doctor_id: docs[0].id, patient_id: pats[0].id, scheduled_time: slot });
        check('live: double-booking rejected (23505)', second.error?.code === '23505', second.error?.message ?? 'second insert succeeded!');
        await s.from('appointments').delete().eq('id', first.data.id);
      } else check('live: double-booking setup insert', false, first.error.message);
    } else check('live: double-booking setup (need 1 doctor + 1 patient)', false, 'seed data missing');
    await s.auth.signOut();
  } else console.log('SKIP  live double-booking (set STAFF_EMAIL/STAFF_PASSWORD)');
} else {
  console.log('SKIP  live Supabase checks (set SUPABASE_URL/ANON_KEY/BOARD_EMAIL/BOARD_PASSWORD)');
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
