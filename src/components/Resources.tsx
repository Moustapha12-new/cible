"use client";

import SectionHead from "./SectionHead";

const GUIDES = [
  {
    tag: "Guide · 8 min",
    title: "Le guide du premier CV : les 11 sections qui font la différence",
    desc: "Même sans aucune expérience. Surtout sans aucune expérience.",
    accent: "var(--mint)",
  },
  {
    tag: "Explication · 5 min",
    title: "ATS : comment ces logiciels lisent votre CV (et comment passer)",
    desc: "Le filtre invisible entre vous et un humain, enfin démystifié.",
    accent: "var(--violet)",
  },
  {
    tag: "Méthode · 4 min",
    title: "Relancer sans harceler : le timing qui obtient des réponses",
    desc: "J+7, pas J+2. Le message de relance type, prêt à copier.",
    accent: "var(--amber)",
  },
];

export default function Resources() {
  return (
    <section aria-label="Ressources et guides" className="section-pad !pt-0">
      <div className="container-x">
        <div className="hairline mb-16" aria-hidden="true" />
        <SectionHead
          eyebrow="Apprendre entre deux candidatures"
          title={
            <>
              Des ressources qui vous rendent{" "}
              <span className="grad-text">autonome, pas dépendant.</span>
            </>
          }
          sub="Comprendre le recrutement moderne en quelques minutes de lecture — écrit par des gens qui ont passé des milliers d'heures des deux côtés de la table."
        />

        <div className="mt-14 grid md:grid-cols-3 gap-5">
          {GUIDES.map((g, i) => (
            <a
              key={i}
              href="#cta"
              className="card card-spot group p-7 flex flex-col"
              data-reveal
              style={{ ["--rd" as string]: i }}
              onClick={(e) => e.preventDefault()}
            >
              <span
                className="chip self-start"
                style={{ color: g.accent, borderColor: g.accent }}
              >
                {g.tag}
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold leading-snug tracking-tight">
                {g.title}
              </h3>
              <p className="mt-3 text-sm text-muted leading-relaxed">{g.desc}</p>
              <span className="mt-auto pt-6 inline-flex items-center gap-2 text-sm font-medium text-text-dim transition-colors group-hover:text-mint">
                Lire l&apos;article
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform duration-500 group-hover:translate-x-1"
                  aria-hidden="true"
                >
                  <path d="M3 8h10m0 0L9 4m4 4-4 4" />
                </svg>
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
