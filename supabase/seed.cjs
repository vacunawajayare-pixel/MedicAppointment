// Clean seed based on schema.sql: one account per profiles.role
// (admin, receptionist, doctor, board) + the directory rows the schema
// expects (doctors row linked to the doctor login, weekday schedules,
// one sample patient). No sample appointments — booking/queue/tests start
// from a clean slate (double-booking + no-show stats stay meaningful).
// Idempotent — safe to re-run. Run: node supabase/seed.cjs
// Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (+ SUPABASE_ANON_KEY
// for the login smoke test). Service key via environment only, never .env.
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

const ACCOUNTS = [
  { email: 'vacunawa@rhu.com.ph', password: 'admin123', full_name: 'RHU Admin', role: 'admin', device_label: null, login: '/appointments/login' },
  { email: 'reception@rhu.com.ph', password: 'reception123', full_name: 'Front Desk', role: 'receptionist', device_label: null, login: '/appointments/login' },
  { email: 'doctor@rhu.com.ph', password: 'doctor123', full_name: 'Clinic Doctor', role: 'doctor', device_label: null, login: '/appointments/login' },
  { email: 'kiosk-01@rhu.local', password: 'kiosk123', full_name: 'Lobby Kiosk 01', role: 'board', device_label: 'Lobby Kiosk 01', login: '/queue-board/login' },
];

(async () => {
  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const ids = {};

  for (const a of ACCOUNTS) {
    const { data: list } = await supabase.auth.admin.listUsers();
    let user = list.users.find((u) => u.email === a.email);
    if (!user) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: a.email, password: a.password, email_confirm: true,
        user_metadata: { full_name: a.full_name },
      });
      if (error) {
        console.error(`createUser ${a.email} failed:`, error.message);
        process.exit(1);
      }
      user = data.user;
      console.log(`auth created: ${a.email} (${user.id})`);
    } else {
      const { error } = await supabase.auth.admin.updateUserById(user.id, { password: a.password, email_confirm: true });
      if (error) {
        console.error(`password reset ${a.email} failed:`, error.message);
        process.exit(1);
      }
      console.log(`auth exists: ${a.email} (${user.id}), password ensured`);
    }
    ids[a.role] = user.id;
    const { error: pErr } = await supabase.from('profiles').upsert(
      { id: user.id, full_name: a.full_name, role: a.role, device_label: a.device_label },
      { onConflict: 'id' }
    );
    if (pErr) {
      console.error(`profiles upsert ${a.email} failed:`, pErr.message);
      process.exit(1);
    }
    console.log(`profile linked: ${a.email} -> ${a.role}`);
  }

  // Doctor directory row linked to the doctor login + Mon-Fri 09:00-17:00 / 30min
  const { data: existing } = await supabase.from('doctors').select('id').eq('profile_id', ids.doctor).limit(1);
  let doctorId = existing?.[0]?.id;
  if (!doctorId) {
    const { data, error } = await supabase.from('doctors')
      .insert({ profile_id: ids.doctor, full_name: 'Dr. Clinic Doctor', specialty: 'General Medicine' })
      .select('id').single();
    if (error) {
      console.error('doctors insert failed:', error.message);
      process.exit(1);
    }
    doctorId = data.id;
    console.log(`doctors row created: ${doctorId}`);
  } else {
    console.log(`doctors row exists: ${doctorId}`);
  }
  const { data: scheds } = await supabase.from('doctor_schedules').select('day_of_week').eq('doctor_id', doctorId);
  const have = new Set((scheds ?? []).map((s) => s.day_of_week));
  for (let dow = 1; dow <= 5; dow++) {
    if (have.has(dow)) continue;
    const { error } = await supabase.from('doctor_schedules').insert(
      { doctor_id: doctorId, day_of_week: dow, start_time: '09:00', end_time: '17:00', slot_duration_minutes: 30 }
    );
    if (error) {
      console.error(`schedule dow=${dow} failed:`, error.message);
      process.exit(1);
    }
  }
  console.log('schedules ensured: Mon-Fri 09:00-17:00 x 30min');

  // One sample patient so booking / check-in / queue can be tried immediately
  const { data: existingPat } = await supabase.from('patients')
    .select('id').eq('full_name', 'Sample Patient').eq('date_of_birth', '1990-01-01').limit(1);
  if (!existingPat?.length) {
    const { error } = await supabase.from('patients').insert({
      full_name: 'Sample Patient', date_of_birth: '1990-01-01',
      contact_number: '09170000000', address: 'Sample address (edit or delete me)',
    });
    console.log(error ? `sample patient: FAIL ${error.message}` : 'sample patient created');
  } else {
    console.log('sample patient exists');
  }

  // Login smoke test for all three (same path the apps use)
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (anonKey) {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    for (const a of ACCOUNTS) {
      const { error } = await anon.auth.signInWithPassword({ email: a.email, password: a.password });
      console.log(error ? `login FAIL ${a.email}: ${error.message}` : `login ok ${a.email} (${a.role})`);
      await anon.auth.signOut();
    }
  } else {
    console.log('skipped login check (no SUPABASE_ANON_KEY in env)');
  }
  console.log('SEED DONE');
})();
