"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { BrandMark } from "@/components/Navbar";

const readNext = () => {
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") ? n : "/app";
};

export default function ConnexionForm() {
  const { user, loading, login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* Pré-remplissage depuis la landing (?email=…) */
  useEffect(() => {
    const id = window.setTimeout(() => {
      const e = new URLSearchParams(window.location.search).get("email");
      if (e) setEmail(e);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  /* Déjà connecté → directement l'espace */
  useEffect(() => {
    if (!loading && user) {
      const id = window.setTimeout(() => router.replace(readNext()), 0);
      return () => window.clearTimeout(id);
    }
  }, [loading, user, router]);

  const submit = async (e?: React.FormEvent, credentials?: { email: string; password: string }) => {
    const enteredEmail = credentials?.email ?? email;
    const enteredPassword = credentials?.password ?? password;
    e?.preventDefault();
    if (busy) return;
    setError(null);
    if (!enteredEmail.trim() || !enteredPassword) {
      setError("Renseigne ton e-mail et ton mot de passe.");
      return;
    }
    setBusy(true);
    const res = await login(enteredEmail, enteredPassword);
    if (res.ok) {
      router.replace(readNext());
    } else {
      setError(res.error ?? "Connexion impossible.");
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="aurora" aria-hidden="true" />
      <div className="bg-grid" aria-hidden="true" />

      <div className="relative z-10 auth-card">
        <Link href="/" className="inline-flex items-center gap-2.5 font-display font-semibold text-lg mb-8">
          <BrandMark />
          cible<span className="text-mint">.</span>
        </Link>

        <div className="glass-card p-8">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Content de te revoir.</h1>
          <p className="mt-2 text-[0.88rem] text-muted">
            Connecte-toi pour retrouver ton pilotage et tes candidatures.
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
            <label className="block">
              <span className="mono-label mb-2 block">E-mail</span>
              <input
                type="email"
                autoComplete="email"
                className="input"
                placeholder="camille@exemple.fr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mono-label mb-2 block">Mot de passe</span>
              <input
                type="password"
                autoComplete="current-password"
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            {error && (
              <p className="form-error" role="alert">
                <span aria-hidden="true">⚠</span> {error}
              </p>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full justify-center">
              {busy ? "Connexion…" : "Se connecter"}
            </button>
          </form>

          <p className="mt-5 text-[0.8rem] text-muted">Ancien compte local ? Crée un compte sécurisé avec la même adresse. Tes CV et candidatures conservés sur cet appareil resteront disponibles. Confirme ensuite ton adresse par e-mail.</p>

          <p className="mt-6 text-center text-[0.85rem] text-muted">
            Pas encore de compte ?{" "}
            <Link href="/inscription" className="text-mint hover:text-mint-strong transition-colors font-medium">
              Créer un compte gratuit →
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center">
          <Link href="/" className="mono-label hover:text-mint transition-colors">
            ← retour au site
          </Link>
        </p>
      </div>
    </div>
  );
}
