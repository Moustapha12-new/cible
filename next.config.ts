import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist"],
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
