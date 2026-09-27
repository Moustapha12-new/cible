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

const PERKS = [
  { t: "CV calibré pour chaque offre", d: "mots-clés alignés, score ATS avant/après" },
  { t: "Pilotage automatique", d: "détection, envoi et relances programmés" },
  { t: "Lettres prêtes en 30 s", d: "construites sur tes vraies expériences" },
];

export default function InscriptionForm() {
  const { user, loading, register } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [cgu, setCgu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* Pré-remplissage depuis la FinalCta (?email=…) */
  useEffect(() => {
    const id = window.setTimeout(() => {
      const e = new URLSearchParams(window.location.search).get("email");
      if (e) setEmail(e);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

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
    if (name.trim().length < 2) return setError("Indique ton nom complet.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Cet e-mail ne semble pas valide.");
    if (password.length < 6) return setError("Mot de passe : 6 caractères minimum.");
    if (password !== confirm) return setError("Les deux mots de passe ne correspondent pas.");
    if (!cgu) return setError("Accepte les conditions pour continuer.");
    setBusy(true);
    const res = await register(name, email, password);
    if (res.ok) {
      router.replace(readNext());
    } else {
      setError(res.error ?? "Inscription impossible.");
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="aurora" aria-hidden="true" />
      <div className="bg-grid" aria-hidden="true" />

      <div className="relative z-10 grid lg:grid-cols-[1fr_minmax(0,430px)] gap-12 items-center w-full max-w-4xl">
        {/* Promesse */}
        <div className="hidden lg:block">
          <p className="eyebrow">gratuit pendant la beta</p>
          <h2 className="font-display text-3xl font-semibold tracking-tight leading-tight mt-4">
            Ton prochain entretien,
            <br />
            <span className="grad-text">préparé par un copilote.</span>
          </h2>
          <ul className="mt-8 space-y-5">
            {PERKS.map((perk) => (
              <li key={perk.t} className="flex gap-3.5">
                <span className="grid place-items-center shrink-0 w-6 h-6 rounded-full border border-mint/40 text-mint text-[0.7rem] mt-0.5">
                  ✓
                </span>
                <div>
                  <p className="font-medium text-[0.95rem]">{perk.t}</p>
                  <p className="text-[0.8rem] text-muted mt-0.5">{perk.d}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Formulaire */}
        <div className="auth-card justify-self-center lg:justify-self-end">
          <Link href="/" className="inline-flex items-center gap-2.5 font-display font-semibold text-lg mb-8 lg:hidden">
            <BrandMark />
            cible<span className="text-mint">.</span>
          </Link>

          <div className="glass-card p-8">
            <h1 className="font-display text-2xl font-semibold tracking-tight">Créer mon compte.</h1>
            <p className="mt-2 text-[0.88rem] text-muted">30 secondes. Aucune carte bancaire.</p>

            <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
              <label className="block">
                <span className="mono-label mb-2 block">Nom complet</span>
                <input
                  type="text"
                  autoComplete="name"
                  className="input"
                  placeholder="Camille Dubois"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
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
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mono-label mb-2 block">Mot de passe</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    className="input"
                    placeholder="6 car. min."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mono-label mb-2 block">Confirmation</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    className="input"
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </label>
              </div>

              <label className="flex items-start gap-3 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={cgu}
                  onChange={(e) => setCgu(e.target.checked)}
                  className="mt-0.5 accent-mint w-4 h-4 shrink-0"
                />
                <span className="text-[0.78rem] text-muted leading-relaxed">
                  J&apos;accepte que mes données restent{" "}
                  <b className="text-text-dim">sur cet appareil</b> (démo locale, aucun serveur).
                </span>
              </label>

              {error && (
                <p className="form-error" role="alert">
                  <span aria-hidden="true">⚠</span> {error}
                </p>
              )}

              <button type="submit" disabled={busy} className="btn-primary w-full justify-center">
                {busy ? "Création…" : "Créer mon compte →"}
              </button>
            </form>

            <p className="mt-6 text-center text-[0.85rem] text-muted">
              Déjà inscrit·e ?{" "}
              <Link href="/connexion" className="text-mint hover:text-mint-strong transition-colors font-medium">
                Se connecter →
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
    </div>
  );
}
