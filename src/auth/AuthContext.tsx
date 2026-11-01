import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile, SalesRep } from '../lib/types';

interface AuthContextValue {
  /** true mientras se recupera la sesión inicial o el perfil. */
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  /** Ficha del equipo de ventas vinculada al usuario (null si no es SDR ni closer). */
  rep: SalesRep | null;
  isSdr: boolean;
  isCloser: boolean;
  /** SDR o closer que no es admin: ve solo su panel, no el campus. */
  isTeamOnly: boolean;
  /** Vuelve a leer el perfil (por ej. después de cambiar la contraseña temporal). */
  refreshProfile: () => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Un rol pausado sigue trabajando lo suyo; dado de baja, no. */
const working = (s: SalesRep['sdr_status']) => s === 'activo' || s === 'pausado';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rep, setRep] = useState<SalesRep | null>(null);
  const [profileFor, setProfileFor] = useState<string | null>(null);
  const [profileTick, setProfileTick] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setRep(null);
      setProfileFor(null);
      return;
    }
    let cancelled = false;
    Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('sales_reps').select('*').eq('profile_id', userId).maybeSingle(),
    ]).then(([p, r]) => {
      if (cancelled) return;
      setProfile(p.data as Profile | null);
      setRep(r.data as SalesRep | null);
      setProfileFor(userId);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, profileTick]);

  useEffect(() => {
    if (userId) supabase.rpc('touch_last_seen').then(() => undefined);
  }, [userId]);

  const refreshProfile = useCallback(() => setProfileTick((t) => t + 1), []);

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/actualizar-clave`,
    });
    if (error) throw error;
  }, []);

  const loading = !sessionReady || (userId !== null && profileFor !== userId);

  const isAdmin = Boolean(profile?.role === 'superadmin' && profile.active && !profile.must_change_password);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      profile,
      isAdmin,
      rep,
      isSdr: working(rep?.sdr_status ?? null),
      isCloser: working(rep?.closer_status ?? null),
      isTeamOnly: Boolean(rep) && !isAdmin,
      refreshProfile,
      login,
      logout,
      sendPasswordReset,
    }),
    [loading, session, profile, isAdmin, rep, refreshProfile, login, logout, sendPasswordReset],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
