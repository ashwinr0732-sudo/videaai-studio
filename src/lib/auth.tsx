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

function toUser(u: SupabaseUser): User {
  const meta = (u.user_metadata ?? {}) as {
    full_name?: string;
    avatar_url?: string;
  };

  return {
    id: u.id,
    email: u.email ?? "",
    full_name:
      meta.full_name ??
      (u.email ? (u.email.split("@")[0] ?? null) : null),
    avatar_url: meta.avatar_url ?? null,
    created_at: u.created_at,
  };
}

export function describeAuthError(message: string): string {
  const m = message.toLowerCase();

  if (m.includes("already registered") || m.includes("user already exists")) {
    return "That email is already registered. Try logging in instead.";
  }

  if (m.includes("weak") || m.includes("pwned")) {
    return "That password has appeared in known data breaches. Please choose a stronger, unique password.";
  }

  if (m.includes("password should be at least")) {
    return "Password is too short. Use at least 6 characters.";
  }

  if (m.includes("invalid login credentials")) {
    return "Incorrect email or password.";
  }

  if (m.includes("email not confirmed")) {
    return "Please confirm your email address first — check your inbox for the confirmation link.";
  }

  if (m.includes("unable to validate email") || m.includes("invalid email")) {
    return "That email address doesn't look valid.";
  }

  if (
    m.includes("email logins are disabled") ||
    m.includes("signups not allowed")
  ) {
    return "Email sign-in is currently disabled for this app.";
  }

  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Please wait a minute and try again.";
  }

  if (m.includes("database error")) {
    return "Your account could not be set up. Please try again.";
  }

  if (m.includes("missing supabase") || m.includes("failed to fetch")) {
    return "Can't reach the authentication service right now. Please try again.";
  }

  return message;
}

export interface SignUpResult {
  needsConfirmation: boolean;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  credits: number | null;
  isAdmin: boolean;

  signIn: (email: string, password: string) => Promise<void>;

  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<SignUpResult>;

  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  /*
   * AUTH SESSION
   */
  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (!mounted) return;

      if (error) {
        console.error("Failed to load session:", error);
        setSession(null);
      } else {
        setSession(data.session);
      }

      setLoading(false);
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;

      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user?.id ?? null;

  /*
   * LOAD CREDITS
   *
   * Credits are stored only in the server-controlled
   * `credit_transactions` ledger. The browser never creates or edits
   * credit rows. The signup bonus is granted by the database trigger /
   * idempotent ensure_signup_bonus RPC.
   */
  useEffect(() => {
    let active = true;

    const loadCredits = async () => {
      if (!userId) {
        setCredits(null);
        return;
      }

      // Make sure accounts created before the trigger was deployed (or
      // accounts whose trigger execution was interrupted) still receive
      // the one-time 25-credit signup bonus. The RPC is idempotent and
      // can only operate on the currently authenticated user.
      const { error: bonusError } = await supabase.rpc(
        "ensure_signup_bonus" as never,
        {} as never,
      );

      if (bonusError) {
        console.error("Could not ensure signup bonus:", bonusError);
      }

      const { data, error } = await supabase
        .from("credit_transactions")
        .select("amount")
        .eq("user_id", userId);

      if (!active) return;

      if (error) {
        console.error("Failed to load credits:", error);
        setCredits(null);
        return;
      }

      const balance = (data ?? []).reduce(
        (sum, entry) => sum + Number(entry.amount ?? 0),
        0,
      );

      setCredits(balance);
    };

    void loadCredits();

    return () => {
      active = false;
    };
  }, [userId]);

  /*
   * LOAD ADMIN ROLE
   */
  useEffect(() => {
    let active = true;

    const loadAdminRole = async () => {
      if (!userId) {
        setIsAdmin(false);
        return;
      }

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();

      if (!active) return;

      if (error) {
        console.error("Failed to load admin role:", error);
        setIsAdmin(false);
        return;
      }

      setIsAdmin(Boolean(data));
    };

    loadAdminRole();

    return () => {
      active = false;
    };
  }, [userId]);

  /*
   * SIGN IN
   */
  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw new Error(describeAuthError(error.message));
      }
    },
    [],
  );

  /*
   * SIGN UP
   */
  const signUp = useCallback(
    async (
      email: string,
      password: string,
      fullName: string,
    ): Promise<SignUpResult> => {
      const redirect =
        typeof window !== "undefined"
          ? `${window.location.origin}/app`
          : "";

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
          ...(redirect
            ? {
                emailRedirectTo: redirect,
              }
            : {}),
        },
      });

      if (error) {
        throw new Error(describeAuthError(error.message));
      }

      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        throw new Error(
          "That email is already registered. Try logging in instead.",
        );
      }

      return {
        needsConfirmation: !data.session,
      };
    },
    [],
  );

  /*
   * SIGN OUT
   */
  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Sign out error:", error);
    }

    setSession(null);
    setCredits(null);
    setIsAdmin(false);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user: session?.user ? toUser(session.user) : null,
      session,
      loading,
      credits,
      isAdmin,
      signIn,
      signUp,
      signOut,
    }),
    [
      session,
      loading,
      credits,
      isAdmin,
      signIn,
      signUp,
      signOut,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return ctx;
}