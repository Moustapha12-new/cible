"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
type User = { name: string; email: string };
type Result = { ok: boolean; error?: string; confirmationRequired?: boolean; user?: User };
interface AuthContextValue {
  user: User | null; loading: boolean;
  login: (email: string, password: string) => Promise<Result>;
  register: (name: string, email: string, password: string) => Promise<Result>;
  logout: () => void;
}
const AuthContext = createContext<AuthContextValue>({ user: null, loading: true, login: async () => ({ ok: false }), register: async () => ({ ok: false }), logout: () => undefined });
async function request(path: string, body: object): Promise<Result> {
  try {
    const response = await fetch(`/api/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return await response.json();
  } catch { return { ok: false, error: "Connexion indisponible. Réessaie." }; }
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const restore = () => fetch("/api/auth/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", cache: "no-store", signal: controller.signal })
      .then(r => r.json()).then(result => { if (!controller.signal.aborted) setUser(result.user ?? null); })
      .catch(() => {}).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    void restore();
    const timer = window.setInterval(() => { void restore(); }, 25 * 60_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);
  const login = useCallback(async (email: string, password: string) => {
    const result = await request("login", { email, password });
    if (result.ok && result.user) setUser(result.user);
    return result;
  }, []);
  const register = useCallback(async (name: string, email: string, password: string) => request("register", { name, email, password }), []);
  const logout = useCallback(() => { void request("logout", {}).then(result => { if (result.ok) { setUser(null); router.replace("/connexion"); router.refresh(); } }); }, [router]);
  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
