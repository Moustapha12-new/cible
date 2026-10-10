"use client";

import Link from "next/link";
import type { UserData } from "@/lib/data";
import { pfeFingerprint } from "@/lib/pfe-matching";
import { adaptationStale, getApprovedCV } from "@/lib/cv-adaptation";

type Stage = "matching" | "adaptation" | "dossier" | "ready";

export default function ApplicationJourney({ data, offerId, current }: { data: UserData; offerId: string; current: Stage }) {
  const offer = data.offers.find(item => item.id === offerId);
  if (!offer) return null;
  const encoded = encodeURIComponent(offerId);
  const analysis = data.pfeAnalyses?.[offerId];
  const matchingDone = !!analysis && analysis.fingerprint === pfeFingerprint(offer, data);
  const approved = getApprovedCV(data, offerId);
  const cvDone = matchingDone && !!approved && !adaptationStale(approved, offer, data);
  const dossier = data.dossiers?.[offerId];
  const dossierDone = !!dossier && !!(dossier.cvText?.trim() || dossier.letterText?.trim() || dossier.notes?.trim());
  const steps = [
    { label: "Offre", href: `/app/offers?offer=${encoded}`, done: true },
    { label: "Matching", href: `/app/matching?offer=${encoded}`, done: matchingDone },
    { label: "CV", href: `/app/adaptation?offer=${encoded}`, done: cvDone },
    { label: "Dossier", href: `/app/dossier?offer=${encoded}`, done: dossierDone },
    { label: "Prêt à postuler", href: `/app/dossier?offer=${encoded}&step=3`, done: false },
  ];
  const currentIndex = current === "matching" ? 1 : current === "adaptation" ? 2 : current === "ready" ? 4 : 3;
  const next = !matchingDone ? steps[1] : !cvDone ? steps[2] : !dossierDone ? steps[3] : steps[4];
  return <nav aria-label="Parcours de candidature" className="glass-card p-4 mb-5 space-y-3">
    <p className="text-sm font-semibold break-words">{offer.title} · {offer.company}</p>
    <ol className="flex flex-wrap gap-2 text-xs">
      {steps.map((step, index) => <li key={step.label}><Link href={step.href} aria-current={index === currentIndex ? "step" : undefined} className={`inline-flex min-h-10 items-center rounded-full border px-3 py-2 ${index === currentIndex ? "border-mint text-mint font-semibold" : "border-line text-text-dim"}`}><span className="sr-only">{step.done ? "Terminée : " : index === 4 ? "À vérifier : " : "Action requise : "}</span>{step.done ? "✓ " : "○ "}{step.label}</Link></li>)}
    </ol>
    <p className="text-xs text-text-dim">Matching : {matchingDone ? "à jour" : analysis ? "à actualiser" : "à faire"} · CV : {cvDone ? "approuvé et à jour" : approved ? "à actualiser" : "à approuver"} · Dossier : {dossierDone ? "contenu enregistré" : "à préparer"}</p>
    <Link href={next.href} className="text-sm font-semibold text-mint underline underline-offset-4">Prochaine action : {next.label} →</Link>
  </nav>;
}
