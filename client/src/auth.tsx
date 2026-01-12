import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AuthUser } from "./types";
import { getAuthMe, loginUser, logoutUser, registerUser } from "./api";

type AuthContextValue = {
  user: AuthUser | null;
  impersonator: { id: number; username: string; email: string } | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (identity: string, password: string) => Promise<void>;
  register: (payload: { username: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [impersonator, setImpersonator] = useState<{ id: number; username: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const result = await getAuthMe();
      setUser(result.user);
      setImpersonator(result.impersonator);
    } catch {
      setUser(null);
      setImpersonator(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function login(identity: string, password: string) {
    await loginUser(identity, password);
    await refresh();
  }

  async function register(payload: { username: string; email: string; password: string }) {
    await registerUser(payload);
  }

  async function logout() {
    await logoutUser();
    setUser(null);
    setImpersonator(null);
  }

  const value = useMemo<AuthContextValue>(() => ({
    user,
    impersonator,
    loading,
    refresh,
    login,
    register,
    logout
  }), [user, impersonator, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
