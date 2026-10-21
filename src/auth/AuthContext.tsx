import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';

interface AuthContextValue {
  /** true mientras se recupera la sesión inicial o el perfil. */
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  /** Vuelve a leer el perfil (por ej. después de cambiar la contraseña temporal). */
  refreshProfile: () => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
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
      setProfileFor(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setProfile(data as Profile | null);
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

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      profile,
      isAdmin: profile?.role === 'superadmin' && profile.active && !profile.must_change_password,
      refreshProfile,
      login,
      logout,
      sendPasswordReset,
    }),
    [loading, session, profile, refreshProfile, login, logout, sendPasswordReset],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
