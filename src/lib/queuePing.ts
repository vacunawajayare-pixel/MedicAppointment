// Queue refresh ping — shared, auth-free helper (NOT auth logic).
// Staff pages call pingQueueChanged() after any mutation that affects the
// queue; the board listens for the broadcast and refetches get_queue_today().
// Why broadcast instead of postgres_changes alone: Realtime postgres_changes
// honors RLS, and the board role has no SELECT on `appointments` (by design),
// so change events may never reach it. Broadcast carries no row data — the
// board still reads ONLY via get_queue_today() — so the hard boundary holds.
import type { SupabaseClient } from '@supabase/supabase-js';

export const QUEUE_CHANNEL = 'queue-today';
export const QUEUE_CHANGED_EVENT = 'queue-changed';

export function pingQueueChanged(sb: SupabaseClient): void {
  try {
    const ch = sb.channel(QUEUE_CHANNEL);
    void ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.send({ type: 'broadcast', event: QUEUE_CHANGED_EVENT, payload: {} });
        void sb.removeChannel(ch);
      }
    });
    // Safety: never leave the ephemeral channel hanging.
    setTimeout(() => {
      void sb.removeChannel(ch).catch(() => undefined);
    }, 5000);
  } catch {
    // Best-effort only; board polling fallback covers failures.
  }
}
