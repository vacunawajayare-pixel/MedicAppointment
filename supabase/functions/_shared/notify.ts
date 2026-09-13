// Shared provider stubs — import from ../_shared/notify.ts
// Env (set via `supabase secrets set`):
//   RESEND_API_KEY, NOTIFY_FROM_EMAIL   -> email via Resend
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER -> SMS via Twilio
// If none are set, send() logs the message and returns { stubbed: true }
// so the app works end-to-end before a provider is chosen.

export interface NotifyPayload {
  to_email?: string | null;
  to_phone?: string | null;
  subject: string;
  text: string;
}

export interface NotifyResult {
  channel: 'email' | 'sms' | 'none';
  stubbed: boolean;
  ok: boolean;
  detail: string;
}

export async function sendNotification(p: NotifyPayload): Promise<NotifyResult[]> {
  const out: NotifyResult[] = [];
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('NOTIFY_FROM_EMAIL') ?? 'clinic@example.com';
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromNum = Deno.env.get('TWILIO_FROM_NUMBER');

  if (p.to_email) {
    if (resendKey) {
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: fromEmail, to: p.to_email, subject: p.subject, text: p.text }),
        });
        out.push({ channel: 'email', stubbed: false, ok: r.ok, detail: `resend:${r.status}` });
      } catch (e) {
        out.push({ channel: 'email', stubbed: false, ok: false, detail: String(e) });
      }
    } else {
      console.log(`[notify-stub][email] to=${p.to_email} subject=${p.subject} :: ${p.text}`);
      out.push({ channel: 'email', stubbed: true, ok: true, detail: 'no RESEND_API_KEY; logged only' });
    }
  }
  if (p.to_phone) {
    if (sid && token && fromNum) {
      try {
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + btoa(`${sid}:${token}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ From: fromNum, To: p.to_phone, Body: `${p.subject} — ${p.text}` }),
        });
        out.push({ channel: 'sms', stubbed: false, ok: r.ok, detail: `twilio:${r.status}` });
      } catch (e) {
        out.push({ channel: 'sms', stubbed: false, ok: false, detail: String(e) });
      }
    } else {
      console.log(`[notify-stub][sms] to=${p.to_phone} :: ${p.subject} — ${p.text}`);
      out.push({ channel: 'sms', stubbed: true, ok: true, detail: 'no TWILIO_* env; logged only' });
    }
  }
  if (out.length === 0) {
    console.log(`[notify-stub][none] ${p.subject} :: ${p.text}`);
    out.push({ channel: 'none', stubbed: true, ok: true, detail: 'no destination address on file' });
  }
  return out;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
