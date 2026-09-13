import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getBoardClient, useBoardAuth } from './auth/boardAuth';

interface QueueRow {
  id: string;
  queue_number: number | null;
  is_priority: boolean;
  patient_display_name: string;
  doctor_name: string;
  status: string;
  room: string | null;
  scheduled_time?: string;
}

type ConnState = 'connecting' | 'live' | 'reconnecting' | 'polling';

const FALLBACK_POLL_MS = 7000; // 5–10s polling when realtime is down
const SAFETY_POLL_MS = 30000; // backup poll even when live (catches missed events)

const CONN: Record<ConnState, { short: string; foot: string; dot: string }> = {
  connecting: { short: '● Connecting', foot: 'Connecting…', dot: 'bg-amber-400' },
  live: { short: '● Live', foot: 'Realtime connected', dot: 'bg-green-400' },
  reconnecting: { short: '● Reconnecting', foot: 'Reconnecting…', dot: 'bg-amber-400' },
  polling: { short: '● Polling', foot: 'Polling mode', dot: 'bg-red-400' },
};

function ticketCode(r: { is_priority: boolean; queue_number: number | null }): string {
  if (r.queue_number == null) return '—';
  return `${r.is_priority ? 'P' : 'R'}-${String(r.queue_number).padStart(3, '0')}`;
}

function statusLabel(s: string): string {
  if (s === 'checked_in') return 'Checked in';
  if (s === 'in_progress') return 'In service';
  return 'Waiting';
}

function agoText(since: Date | null, now: Date): string {
  if (!since) return 'Loading…';
  const s = Math.max(0, Math.round((now.getTime() - since.getTime()) / 1000));
  if (s < 5) return 'Updated just now';
  if (s < 60) return `Updated ${s} seconds ago`;
  return `Updated ${Math.floor(s / 60)} min ago`;
}

// Board reads ONLY via get_queue_today() (SECURITY DEFINER, role-checked).
// Realtime + staff broadcast pings are invalidation signals only; every event
// triggers a refetch of the view function (which itself filters to today).
export default function BoardDisplay() {
  const { user, deviceLabel, loading, signOut } = useBoardAuth();
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [conn, setConn] = useState<ConnState>('connecting');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const mounted = useRef(true);

  // Live clock (display only — re-renders every second, no data fetching).
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchQueue = useCallback(async () => {
    try {
      const { data, error } = await getBoardClient().rpc('get_queue_today');
      if (error) throw error;
      if (!mounted.current) return;
      setRows((data as QueueRow[]) ?? []);
      setLastUpdated(new Date());
      setFetchError(null);
    } catch (e) {
      if (!mounted.current) return;
      setFetchError(e instanceof Error ? e.message : 'Failed to load queue.');
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!user) return;
    const sb = getBoardClient();
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let safetyTimer: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    setConn('connecting');
    void fetchQueue();

    const startFallback = () => {
      if (fallbackTimer || closed) return;
      fallbackTimer = setInterval(() => {
        if (!closed) void fetchQueue();
      }, FALLBACK_POLL_MS);
    };
    const stopFallback = () => {
      if (fallbackTimer) clearInterval(fallbackTimer);
      fallbackTimer = null;
    };

    // Safety net: slow poll even while live, in case an event is missed.
    safetyTimer = setInterval(() => {
      if (!closed) void fetchQueue();
    }, SAFETY_POLL_MS);

    const channel = sb
      .channel('queue-today')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => {
          // Best-effort: RLS may withhold row events from the board role,
          // so this is NOT the primary signal (see broadcast below).
          void fetchQueue();
        }
      )
      .on('broadcast', { event: 'queue-changed' }, () => {
        // Primary instant signal: staff app pings this after check-in /
        // booking / status changes. Carries no row data — the board still
        // reads ONLY via get_queue_today(), so the boundary holds.
        void fetchQueue();
      })
      .subscribe((status) => {
        if (closed) return;
        if (status === 'SUBSCRIBED') {
          setConn('live');
          stopFallback();
          void fetchQueue();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConn('polling');
          startFallback();
        } else {
          // CLOSED / other transient states
          setConn('reconnecting');
          startFallback();
        }
      });

    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchQueue();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      closed = true;
      mounted.current = false;
      stopFallback();
      if (safetyTimer) clearInterval(safetyTimer);
      document.removeEventListener('visibilitychange', onVisible);
      void sb.removeChannel(channel);
    };
  }, [user, fetchQueue]);

  if (loading) return <p className="p-8 text-center">Loading board session…</p>;
  if (!user) return <Navigate to="/queue-board/login" replace />;

  const c = CONN[conn];
  const byQ = (a: QueueRow, b: QueueRow) => (a.queue_number ?? 9999) - (b.queue_number ?? 9999);
  const serving = rows.filter((r) => r.status === 'in_progress').sort(byQ)[0] ?? null;
  const lane = rows.filter((r) => r.status !== 'in_progress').sort(byQ);
  const priority = lane.filter((r) => r.is_priority);
  const regular = lane.filter((r) => !r.is_priority);

  return (
    <div className="min-h-screen bg-[#070c0a] p-4 text-white md:p-6">
      <div className="mx-auto max-w-6xl">
        {/* Header: site + clock left, Live + sign out right */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold md:text-2xl">{deviceLabel ?? 'RHU Lobby'}</h1>
            <p className="text-sm text-slate-400 tabular-nums">
              {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
              {' · '}
              {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-semibold text-green-400">
              {c.short}
            </span>
            <button
              className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-white/5 hover:text-slate-300"
              onClick={() => void signOut()}
              title="Sign out kiosk"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Hero: now serving */}
        <div className="mt-4 rounded-2xl bg-[#101815] p-8 text-center ring-1 ring-white/5 md:p-10">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Now serving</p>
          <p className="mt-2 text-7xl font-bold tracking-tight tabular-nums md:text-8xl">
            {serving ? ticketCode(serving) : '—'}
          </p>
          <p className="mt-3 text-lg text-[#4ea895]">
            {serving ? (
              <>
                {serving.room ? `Room ${serving.room}` : 'No room'} <span className="mx-2 text-slate-600">·</span> {serving.doctor_name}
              </>
            ) : (
              <span className="text-slate-500">No patient in service</span>
            )}
          </p>
          {fetchError && <p className="mt-2 text-sm text-red-400">Error: {fetchError}</p>}
        </div>

        {/* Lanes */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
            <h2 className="text-sm font-bold uppercase tracking-widest text-amber-400">
              Priority lane ({priority.length})
            </h2>
            <div className="mt-3 space-y-2">
              {priority.map((r) => (
                <div key={r.id} className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-amber-100 tabular-nums">{ticketCode(r)}</span>
                  <span className="text-sm text-slate-400">{statusLabel(r.status)}</span>
                </div>
              ))}
              {priority.length === 0 && <p className="text-sm text-slate-500">No patients</p>}
            </div>
          </div>
          <div className="rounded-2xl border border-[#4ea895]/30 bg-[#4ea895]/10 p-5">
            <h2 className="text-sm font-bold uppercase tracking-widest text-[#4ea895]">
              Regular lane ({regular.length})
            </h2>
            <div className="mt-3 space-y-2">
              {regular.map((r) => (
                <div key={r.id} className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-emerald-100 tabular-nums">{ticketCode(r)}</span>
                  <span className="text-sm text-slate-400">{statusLabel(r.status)}</span>
                </div>
              ))}
              {regular.length === 0 && <p className="text-sm text-slate-500">No patients</p>}
            </div>
          </div>
        </div>

        {/* Footer: freshness + connection */}
        <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-sm text-slate-500">
          <span className="tabular-nums">{agoText(lastUpdated, now)}</span>
          <span className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${c.dot}`} />
            {c.foot}
          </span>
        </div>
      </div>
    </div>
  );
}
