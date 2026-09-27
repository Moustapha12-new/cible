import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/fraunces/wght-italic.css";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./globals.css";
import "./hero-paper.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://cible.app"),
  title: {
    default: "Cible — Votre CV, calibré pour chaque offre",
    template: "%s · Cible",
  },
  description:
    "Collez une offre d'emploi : Cible aligne votre CV dessus, vérifie sa compatibilité ATS, rédige votre lettre et pilote vos candidatures. Sans jamais inventer quoi que ce soit.",
  keywords: [
    "CV",
    "lettre de motivation",
    "ATS",
    "recherche d'emploi",
    "premier emploi",
    "candidature",
    "IA",
  ],
  openGraph: {
    title: "Cible — Votre CV, calibré pour chaque offre",
    description:
      "L'assistant qui aligne votre CV sur chaque offre, sans rien inventer. Pour les débutants comme pour les pros.",
    locale: "fr_FR",
    type: "website",
    siteName: "Cible",
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f6f1",
  width: "device-width",
  initialScale: 1,
};

const jsClassScript = `document.documentElement.classList.add('js');`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className="h-full">
      <head>
        <script dangerouslySetInnerHTML={{ __html: jsClassScript }} />
      </head>
      <body className="min-h-full flex flex-col antialiased">
        <div className="noise" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
