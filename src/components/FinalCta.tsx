"use client";

import { useRouter } from "next/navigation";
import { useState, type CSSProperties, type FormEvent } from "react";
import { useLang } from "@/lib/i18n";

export default function FinalCta() {
  const { t } = useLang();
  const router = useRouter();
  const [email, setEmail] = useState("");

  /* L'e-mail collecté pré-remplit l'inscription — tout le monde atterrit dans l'app. */
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const clean = email.trim();
    if (!clean) return;
    router.push(`/inscription?email=${encodeURIComponent(clean)}`);
  };

  return (
    <section id="cta" className="section-pad cta-section">
      {/* Fond : cibles concentriques + halos */}
      <div className="rings-bg" aria-hidden="true">
        <svg viewBox="0 0 1000 1000">
          <circle cx="500" cy="500" r="160" />
          <circle cx="500" cy="500" r="280" />
          <circle cx="500" cy="500" r="400" />
          <circle cx="500" cy="500" r="490" className="ring-dot" />
        </svg>
      </div>
      <div
        className="aurora aurora--sage w-[480px] h-[480px] left-1/2 top-[-140px]"
        style={{ translate: "-50% 0" }}
        aria-hidden="true"
      />

      <div className="container-x cta-inner">
        <span className="eyebrow" data-reveal>
          {t("cta.eyebrow")}
        </span>
        <h2 className="cta-title text-balance" data-reveal style={{ "--rd": 1 } as CSSProperties}>
          {t("cta.title")}
        </h2>
        <p className="cta-sub text-balance" data-reveal style={{ "--rd": 2 } as CSSProperties}>
          {t("cta.sub")}
        </p>

        <form className="cta-form" onSubmit={onSubmit} data-reveal style={{ "--rd": 3 } as CSSProperties}>
          <input
            type="email"
            required
            placeholder={t("cta.input.ph")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label={t("cta.input.ph")}
          />
          <button type="submit" className="btn-primary">
            {t("cta.btn")}
          </button>
        </form>

        <p className="cta-micro" data-reveal style={{ "--rd": 4 } as CSSProperties}>
          {t("cta.micro")}
        </p>
      </div>
    </section>
  );
}
