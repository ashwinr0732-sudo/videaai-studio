import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "./types";
import { uid } from "./id";

/**
 * Auth adapter boundary.
 *
 * The app only ever talks to this interface, so wiring a real backend
 * (Lovable Cloud / Supabase auth) later means replacing `localAuthAdapter`
 * with a Supabase-backed implementation — no component changes required.
 */
export interface AuthAdapter {
  getUser(): Promise<User | null>;
  signIn(email: string, password: string): Promise<User>;
  signUp(email: string, password: string, fullName: string): Promise<User>;
  signOut(): Promise<void>;
}

const STORAGE_KEY = "videaai.session";

function read(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function write(user: User | null) {
  if (typeof window === "undefined") return;
  if (user) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  else window.localStorage.removeItem(STORAGE_KEY);
}

/** Temporary client-side adapter. No credentials are validated or stored server-side. */
export const localAuthAdapter: AuthAdapter = {
  async getUser() {
    return read();
  },
  async signIn(email) {
    const existing = read();
    const user: User =
      existing && existing.email === email
        ? existing
        : {
            id: uid(),
            email,
            full_name: email.split("@")[0] ?? null,
            avatar_url: null,
            created_at: new Date().toISOString(),
          };
    write(user);
    return user;
  },
  async signUp(email, _password, fullName) {
    const user: User = {
      id: uid(),
      email,
      full_name: fullName || (email.split("@")[0] ?? null),
      avatar_url: null,
      created_at: new Date().toISOString(),
    };
    write(user);
    return user;
  },
  async signOut() {
    write(null);
  },
};

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({
  children,
  adapter = localAuthAdapter,
}: {
  children: ReactNode;
  adapter?: AuthAdapter;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    adapter.getUser().then((u) => {
      if (!active) return;
      setUser(u);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [adapter]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setUser(await adapter.signIn(email, password));
    },
    [adapter],
  );

  const signUp = useCallback(
    async (email: string, password: string, fullName: string) => {
      setUser(await adapter.signUp(email, password, fullName));
    },
    [adapter],
  );

  const signOut = useCallback(async () => {
    await adapter.signOut();
    setUser(null);
  }, [adapter]);

  const value = useMemo(
    () => ({ user, loading, signIn, signUp, signOut }),
    [user, loading, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
