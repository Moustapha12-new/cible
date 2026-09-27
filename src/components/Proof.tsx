"use client";

import { type CSSProperties } from "react";
import { useLang } from "@/lib/i18n";
import Counter from "./Counter";

const COMPANIES = [
  "Capgemini",
  "L'OrÃ©al",
  "SNCF",
  "Dassault SystÃ¨mes",
  "Orange",
  "Decathlon",
  "BNP Paribas",
  "Ubisoft",
];

function Diamond() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="1.8" y="1.8" width="6.4" height="6.4" rx="1.2" transform="rotate(45 5 5)" fill="currentColor" />
    </svg>
  );
}

export default function Proof() {
  const { t } = useLang();
  const row = [...COMPANIES, ...COMPANIES];

  return (
    <section aria-label="Preuve sociale">
      <div className="proof-band">
        <div className="container-x">
          <p className="mono-label marquee-label">{t("proof.label")}</p>
          <div className="marquee">
            <div className="marquee-track">
              {row.map((c, i) => (
                <span key={`${c}-${i}`} className="marquee-item">
                  {c}
                  <span className="marquee-sep">
                    <Diamond />
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="container-x">
        <div className="stats-band">
          <div data-reveal style={{ "--rd": 0 } as CSSProperties}>
            <div className="stat-v">
              <Counter target={310000} suffix="+" />
            </div>
            <p className="stat-l">{t("stats.s1.label")}</p>
          </div>
          <div data-reveal style={{ "--rd": 1 } as CSSProperties}>
            <div className="stat-v">
              <Counter target={3} prefix="Ã—" />
            </div>
            <p className="stat-l">{t("stats.s2.label")}</p>
          </div>
          <div data-reveal style={{ "--rd": 2 } as CSSProperties}>
            <div className="stat-v">
              <Counter target={94} suffix=" %" />
            </div>
            <p className="stat-l">{t("stats.s3.label")}</p>
          </div>
          <div data-reveal style={{ "--rd": 3 } as CSSProperties}>
            <div className="stat-v">
              <Counter target={4.9} decimals={1} suffix="/5" />
            </div>
            <p className="stat-l">{t("stats.s4.label")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
