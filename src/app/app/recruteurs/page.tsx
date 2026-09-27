"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getOrCreateData, type UserData } from "@/lib/data";
import { AppPageHead, NAV_LABEL } from "@/components/app/AppShell";
import LoadingState from "@/components/alertes-gmail/LoadingState";

const TEMPLATES = [
  {
    id: "relance",
    label: "Relance J+7",
    subject: (r: string) => `Suivi de ma candidature — ${r}`,
    body: (n: string, role: string, company: string) =>
      `Bonjour ${n},\n\nJe me permets de revenir vers vous concernant ma candidature au poste de ${role} chez ${company}, envoyée la semaine dernière.\n\nMon profil a été calibré sur les mots-clés exacts de votre annonce et je reste très motivé·e à l'idée d'échanger avec vous. Je suis disponible pour un entretien dès cette semaine.\n\nBien cordialement,`,
  },
  {
    id: "spontane",
    label: "Candidature spontanée",
    subject: () => `Candidature spontanée — échanger avec votre équipe`,
    body: (n: string, _role: string, company: string) =>
      `Bonjour ${n},\n\nVotre entreprise ${company} correspond précisément à l'environnement dans lequel je veux grandir. Je vous adresse donc une candidature spontanée : mon CV est calibré et mes réalisations sont chiffrées.\n\nSeriez-vous disponible 15 minutes pour un échange ?\n\nBien cordialement,`,
  },
  {
    id: "merci",
    label: "Remerciement entretien",
    subject: () => `Merci pour notre échange`,
    body: (n: string) =>
      `Bonjour ${n},\n\nMerci pour le temps consacré à notre entretien. Notre échange a renforcé ma motivation à rejoindre votre équipe.\n\nJe reste bien entendu disponible pour toute information complémentaire.\n\nBien cordialement,`,
  },
];

export default function RecruteursPage() {
  const { user } = useAuth();
  const [data, setData] = useState<UserData | null>(null);
  const [selIdx, setSelIdx] = useState(0);
  const [tplId, setTplId] = useState("relance");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    const id = window.setTimeout(() => setData(getOrCreateData(user.name, user.email)), 0);
    return () => window.clearTimeout(id);
  }, [user]);

  /* P2-9 : état de chargement visible au lieu d'un écran blanc. */
  if (!data || !user) return <LoadingState />;

  const recruiter = data.recruiters[selIdx] ?? data.recruiters[0];
  const tpl = TEMPLATES.find((t) => t.id === tplId) ?? TEMPLATES[0];
  const firstName = recruiter ? recruiter.name.split(" ")[0] : "";
  const myRole = data.profile.title.includes("—")
    ? data.profile.title.split("—")[1].trim()
    : "alternant·e";
  const signature = `\n\n${data.profile.firstName} ${data.profile.lastName}\n${data.profile.phone} · ${data.profile.email}`;
  const body = recruiter
    ? tpl.body(firstName, myRole, recruiter.company) + signature
    : "";
  const subject = recruiter ? tpl.subject(recruiter.company) : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Objet : ${subject}\n\n${body}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard indisponible */
    }
  };

  const initials = (name: string) =>
    name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <>
      <AppPageHead
        eyebrow={NAV_LABEL["/app/recruteurs"]}
        title="Contacts recruteurs"
        sub="Les bonnes personnes, au bon moment. Chaque contact affiche son taux de réponse réel sur des profils similaires au tien."
      />

      {/* Messages types */}
      <section className="glass-card p-7 mb-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 mb-5">
          <h2 className="font-display text-lg font-semibold mr-auto">Message prêt à envoyer</h2>
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTplId(t.id)}
              className={`rounded-full border px-3.5 py-1.5 text-[0.78rem] transition-all duration-300 ${
                t.id === tplId
                  ? "border-mint/60 bg-mint/10 text-mint-strong"
                  : "border-line text-muted hover:text-text-dim"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {recruiter && (
          <>
            <p className="mono-label mb-2">
              Destinataire : {recruiter.name} — {recruiter.role}, {recruiter.company}
            </p>
            <div className="rounded-xl border border-line bg-surface p-5 text-[0.88rem] leading-relaxed whitespace-pre-wrap">
              <p className="mono-label mb-3">Objet : {subject}</p>
              {body}
            </div>
            <div className="flex flex-wrap gap-2 mt-5">
              <button type="button" onClick={copy} className="btn-primary">
                {copied ? "Copié ✓" : "Copier le message"}
              </button>
              <a
                className="btn-line"
                href={`mailto:${recruiter.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
              >
                ✉ Ouvrir dans ma messagerie
              </a>
            </div>
          </>
        )}
      </section>

      {/* Annuaire */}
      <section>
        <h2 className="font-display text-xl font-semibold mb-5">
          Ton annuaire <span className="text-muted font-normal text-base">({data.recruiters.length})</span>
        </h2>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.recruiters.map((r, i) => (
            <article
              key={r.email}
              className={`glass-card p-6 cursor-pointer transition-all duration-300 ${
                i === selIdx ? "border-mint/50 shadow-[0_0_40px_-18px_rgba(79,227,178,.5)]" : "hover:-translate-y-1"
              }`}
              onClick={() => setSelIdx(i)}
            >
              <div className="flex items-center gap-4 mb-4">
                <span className="grid place-items-center w-11 h-11 rounded-full bg-violet/15 border border-violet/30 font-display font-semibold text-sm text-violet shrink-0">
                  {initials(r.name)}
                </span>
                <div className="min-w-0">
                  <h3 className="font-medium truncate">{r.name}</h3>
                  <p className="text-[0.72rem] text-muted truncate">{r.role} · {r.company}</p>
                </div>
              </div>

              <p className="mono-label mb-1.5">Taux de réponse</p>
              <div className="h-1 rounded-full bg-surface-2 overflow-hidden mb-4" aria-hidden="true">
                <div className="h-full rounded-full bg-mint" style={{ width: `${r.responseRate}%`, transition: "width .9s cubic-bezier(.16,1,.3,1)" }} />
              </div>
              <p className="text-[0.78rem] text-muted mb-4 tabular-nums">{r.responseRate} % · profils similaires au tien</p>

              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                <a href={`mailto:${r.email}`} className="btn-line">✉ Email</a>
                <a href={`https://${r.linkedin}`} target="_blank" rel="noreferrer" className="btn-line">in LinkedIn</a>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
