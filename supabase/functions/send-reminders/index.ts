// send-reminders — finds appointments ~24h out (status='scheduled') and
// sends each a reminder. Trigger via Supabase Cron (see supabase/cron.sql).
// Guard: requires header `x-cron-secret: <CRON_SECRET>` matching env, or a
// service_role Authorization bearer. Board/staff JWTs are NOT accepted.
// Deploy: supabase functions deploy send-reminders
// Secrets: supabase secrets set CRON_SECRET=... [RESEND_API_KEY/TWILIO_* ...]
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { json, sendNotification } from '../_shared/notify.ts';

Deno.serve(async (req: Request) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  const got = req.headers.get('x-cron-secret');
  const auth = req.headers.get('Authorization') ?? '';
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const isCron = cronSecret && got === cronSecret;
  const isService = auth === `Bearer ${svcKey}`;
  if (!isCron && !isService) return json({ error: 'unauthorized (cron only)' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const svc = createClient(supabaseUrl, svcKey);
  const now = new Date();
  const lo = new Date(now);
  lo.setDate(lo.getDate() + 1);
  lo.setHours(0, 0, 0, 0);
  const hi = new Date(lo);
  hi.setHours(23, 59, 59, 999);

  const { data, error } = await svc
    .from('appointments')
    .select('id,scheduled_time,patient:patients(full_name,contact_number),doctor:doctors(full_name)')
    .eq('status', 'scheduled')
    .gte('scheduled_time', lo.toISOString())
    .lte('scheduled_time', hi.toISOString())
    .limit(1000);
  if (error) return json({ error: error.message }, 500);

  let sent = 0, stubbed = 0, failed = 0;
  for (const row of (data as unknown as {
    id: string; scheduled_time: string;
    patient?: { full_name: string; contact_number: string | null } | null;
    doctor?: { full_name: string } | null;
  }[]) ?? []) {
    const when = new Date(row.scheduled_time).toLocaleString();
    const results = await sendNotification({
      to_phone: row.patient?.contact_number ?? null,
      to_email: null,
      subject: 'Appointment reminder (tomorrow)',
      text: `Hi ${row.patient?.full_name ?? 'patient'}, reminder: appointment with ${row.doctor?.full_name ?? 'the doctor'} tomorrow at ${when}.`,
    });
    if (results.every((r) => r.ok)) sent += 1; else failed += 1;
    if (results.every((r) => r.stubbed)) stubbed += 1;
  }
  return json({ ok: true, window: { from: lo.toISOString(), to: hi.toISOString() }, sent, stubbed, failed });
});
