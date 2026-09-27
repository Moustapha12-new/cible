"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { BrandMark } from "@/components/Navbar";

const readNext = () => {
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") ? n : "/app";
};

export default function ConnexionForm() {
  const { user, loading, login, register } = useAuth();
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

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    setError(null);
    if (!email.trim() || !password) {
      setError("Renseigne ton e-mail et ton mot de passe.");
      return;
    }
    setBusy(true);
    let res = await login(email, password);
    /* Compte démo : créé à la volée s'il n'existe pas encore */
    if (!res.ok && email.trim().toLowerCase() === "demo@cible.app") {
      res = await register("Camille Dubois", "demo@cible.app", "demo123");
    }
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

          <div className="mt-5 rounded-xl border border-dashed border-mint/35 bg-mint/5 p-4 text-center">
            <p className="text-[0.78rem] text-text-dim leading-relaxed">
              Envie d&apos;essayer sans créer de compte ?
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEmail("demo@cible.app");
                setPassword("demo123");
                void submit();
              }}
              className="btn-line mt-3"
            >
              Entrer avec le compte démo
            </button>
          </div>

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
