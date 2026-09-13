// One-off admin bootstrap. Run: node create_admin.cjs
// Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Creates vacunawa@rhu.com.ph / admin123 and links profiles.role='admin'.
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

(async () => {
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.admin.createUser({
    email: 'vacunawa@rhu.com.ph',
    password: 'admin123',
    email_confirm: true,
    user_metadata: { full_name: 'RHU Admin' },
  });
  if (error) {
    console.error('createUser failed:', error.message);
    process.exit(1);
  }
  const userId = data.user.id;
  console.log('auth user created:', userId);
  const { error: pErr } = await supabase.from('profiles').upsert(
    { id: userId, full_name: 'RHU Admin', role: 'admin' },
    { onConflict: 'id' }
  );
  if (pErr) {
    console.error('profiles upsert failed:', pErr.message);
    process.exit(1);
  }
  console.log('profiles row linked as admin. Done.');
})();
