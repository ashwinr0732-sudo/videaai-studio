import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "./types";

/**
 * Real Supabase-backed auth. Sessions, passwords and roles live server-side;
 * the browser only ever holds a short-lived access token.
 */

function toUser(u: SupabaseUser): User {
  const meta = (u.user_metadata ?? {}) as { full_name?: string; avatar_url?: string };
  return {
    id: u.id,
    email: u.email ?? "",
    full_name: meta.full_name ?? (u.email ? (u.email.split("@")[0] ?? null) : null),
    avatar_url: meta.avatar_url ?? null,
    created_at: u.created_at,
  };
}

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** True only when the database says this account holds the `admin` role. */
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id ?? null;

  useEffect(() => {
    let active = true;
    if (!userId) {
      setIsAdmin(false);
      return;
    }
    // Role is read from the roles table under RLS — never from client storage.
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => {
        if (active) setIsAdmin(Boolean(data));
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const redirect = typeof window !== "undefined" ? `${window.location.origin}/app` : "";
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: redirect
        ? { data: { full_name: fullName }, emailRedirectTo: redirect }
        : { data: { full_name: fullName } },
    });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setIsAdmin(false);
  }, []);

  const value = useMemo(
    () => ({
      user: session?.user ? toUser(session.user) : null,
      session,
      loading,
      isAdmin,
      signIn,
      signUp,
      signOut,
    }),
    [session, loading, isAdmin, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
