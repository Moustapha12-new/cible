"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type User = {
  name: string;
  email: string;
  password: string;
  createdAt: string;
};

const USERS_KEY = "cible:users";
const SESSION_KEY = "cible:session";

function readUsers(): User[] {
  try {
    return JSON.parse(window.localStorage.getItem(USERS_KEY) ?? "[]") as User[];
  } catch {
    return [];
  }
}

interface AuthContextValue {
  user: { name: string; email: string } | null;
  loading: boolean;
  login: (
    email: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string }>;
  register: (
    name: string,
    email: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => ({ ok: false }),
  register: async () => ({ ok: false }),
  logout: () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  /* Restaure la session après hydratation */
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(SESSION_KEY);
        if (raw) setUser(JSON.parse(raw));
      } catch {
        /* session illisible — on reste déconnecté */
      }
      setLoading(false);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const persistSession = useCallback((u: User) => {
    window.localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ name: u.name, email: u.email })
    );
    setUser({ name: u.name, email: u.email });
  }, []);

  const login = useCallback<AuthContextValue["login"]>(
    async (email, password) => {
      await new Promise((r) => setTimeout(r, 650));
      const found = readUsers().find(
        (u) => u.email.toLowerCase() === email.trim().toLowerCase()
      );
      if (!found)
        return { ok: false, error: "Aucun compte avec cet e-mail. Créez-le en 30 secondes." };
      if (found.password !== password)
        return { ok: false, error: "Mot de passe incorrect." };
      persistSession(found);
      return { ok: true };
    },
    [persistSession]
  );

  const register = useCallback<AuthContextValue["register"]>(
    async (name, email, password) => {
      await new Promise((r) => setTimeout(r, 750));
      const users = readUsers();
      if (users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase()))
        return { ok: false, error: "Un compte existe déjà avec cet e-mail." };
      const nu: User = {
        name: name.trim(),
        email: email.trim(),
        password,
        createdAt: new Date().toISOString(),
      };
      users.push(nu);
      window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
      persistSession(nu);
      return { ok: true };
    },
    [persistSession]
  );

  const logout = useCallback(() => {
    window.localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
