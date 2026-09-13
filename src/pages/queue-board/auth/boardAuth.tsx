// BOARD-ONLY auth. Do not import anything from ../appointments or
// src/pages/appointments. Separate Supabase client + storage key so the
// staff session can never leak in here. Full realtime display is Stage 4;
// this file already enforces the board-only session boundary.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createAppClient } from '../../../lib/supabaseClient';

const boardSupabase: SupabaseClient = createAppClient('medical-queue-board');

export function getBoardClient(): SupabaseClient {
  return boardSupabase;
}

interface BoardAuthCtx {
  user: User | null;
  deviceLabel: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<BoardAuthCtx | null>(null);

export function BoardAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [deviceLabel, setDeviceLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadLabel(uid: string) {
    const { data } = await boardSupabase.from('profiles').select('device_label').eq('id', uid).single();
    setDeviceLabel((data as { device_label?: string } | null)?.device_label ?? null);
  }

  useEffect(() => {
    boardSupabase.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) await loadLabel(u.id);
      setLoading(false);
    });
    const { data: sub } = boardSupabase.auth.onAuthStateChange(async (_e, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) await loadLabel(u.id);
      else setDeviceLabel(null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string): Promise<string | null> {
    const { data, error } = await boardSupabase.auth.signInWithPassword({ email, password });
    if (error) return error.message;
    const uid = data.user?.id;
    if (!uid) return 'Login failed.';
    const { data: prof } = await boardSupabase
      .from('profiles')
      .select('role,device_label')
      .eq('id', uid)
      .single();
    const role = (prof as { role?: string } | null)?.role;
    if (role !== 'board') {
      await boardSupabase.auth.signOut();
      setUser(null);
      return 'This account is not a board/kiosk account. Staff must use /appointments/login.';
    }
    setUser(data.user);
    setDeviceLabel((prof as { device_label?: string } | null)?.device_label ?? null);
    return null;
  }

  async function signOut() {
    await boardSupabase.auth.signOut();
    setUser(null);
    setDeviceLabel(null);
  }

  return <Ctx.Provider value={{ user, deviceLabel, loading, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useBoardAuth(): BoardAuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useBoardAuth must be used inside BoardAuthProvider');
  return v;
}
