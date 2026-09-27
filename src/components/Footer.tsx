"use client";

import { useLang } from "@/lib/i18n";
import { Brand } from "./Brand";

const COLS: { title: string; links: [string, string][] }[] = [
  {
    title: "footer.product",
    links: [
      ["footer.link.features", "#fonctionnalites"],
      ["footer.link.pricing", "/inscription"],
      ["footer.link.security", "#faq"],
      ["footer.link.changelog", "#top"],
    ],
  },
  {
    title: "footer.resources",
    links: [
      ["footer.link.guide", "#methode"],
      ["footer.link.blog", "#temoignages"],
      ["footer.link.templates", "#demo"],
      ["footer.link.faq", "#faq"],
    ],
  },
  {
    title: "footer.legal",
    links: [
      ["footer.link.privacy", "#"],
      ["footer.link.terms", "#"],
      ["footer.link.imprint", "#"],
    ],
  },
];

export default function Footer() {
  const { t } = useLang();

  return (
    <footer className="site-footer">
      <div className="container-x">
        <div className="footer-grid">
          <div className="footer-brand">
            <Brand />
            <p>{t("footer.tagline")}</p>
          </div>

          {COLS.map((col) => (
            <nav key={col.title} className="footer-col" aria-label={t(col.title)}>
              <h4>{t(col.title)}</h4>
              {col.links.map(([key, href]) => (
                <a key={key} href={href}>
                  {t(key)}
                </a>
              ))}
            </nav>
          ))}
        </div>

        <div className="footer-bottom">
          <span>
            {t("footer.rights")} · {t("footer.made")}
          </span>
          <div className="social-row">
            <a href="#" aria-label="LinkedIn">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor" aria-hidden="true">
                <path d="M3.4 5.6H1.2v8.2h2.2V5.6ZM2.3 4.6a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6ZM13.8 9c0-2.2-1.2-3.6-3-3.6-1 0-1.7.5-2.1 1.2V5.6H6.5v8.2h2.2V9.4c0-1 .5-1.6 1.4-1.6.8 0 1.3.6 1.3 1.6v4.4h2.4V9Z" />
              </svg>
            </a>
            <a href="#" aria-label="X (Twitter)">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                <path d="M8.3 5.9 13.4.1h-1.2L7.8 5.2 4.2.1H.1l5.4 7.4L.1 13.9h1.2l4.7-5.4 3.9 5.4h4L8.3 5.9Zm-1.7 1.9-.5-.8L1.8 1h1.9l3.5 4.8.5.8 4.6 6.3h-1.9L6.6 7.8Z" />
              </svg>
            </a>
            <a href="#" aria-label="Instagram">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                <rect x="1.2" y="1.2" width="12.6" height="12.6" rx="3.6" stroke="currentColor" strokeWidth="1.3" />
                <circle cx="7.5" cy="7.5" r="2.9" stroke="currentColor" strokeWidth="1.3" />
                <circle cx="11.2" cy="3.8" r="0.9" fill="currentColor" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
