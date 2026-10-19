import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist"],
  /* Chromium est requis au runtime depuis node_modules (package déjà externalisé
     par défaut) mais Next/Vercel ne trace PAS ses binaires (.br) : sans cet
     explicit, la génération PDF échoue en production avec
     « The input directory .../@sparticuz/chromium/bin does not exist ». */
  outputFileTracingIncludes: {
    // PDF.js charge ce module dynamiquement : le traceur ne le détecte pas.
    // Nécessaire aux imports de CV maîtres et aux contrôles PDF en serverless.
    "/api/**/*": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    "/api/cv/pdf": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/cv/bulk": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
  turbopack: {
    root: process.cwd(),
  },
  devIndicators: false,
  async redirects() {
    return [
      { source: "/app/offers", destination: "/app/offres", permanent: false },
      { source: "/app/matching", destination: "/app/cv", permanent: false },
      { source: "/app/dossier", destination: "/app/cv", permanent: false },
      { source: "/app/lettres", destination: "/app/candidatures", permanent: false },
      { source: "/app/recruteurs", destination: "/app/candidatures", permanent: false },
    ];
  },
};

export default nextConfig;
