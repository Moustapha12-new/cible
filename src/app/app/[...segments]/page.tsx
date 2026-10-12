import { redirect } from "next/navigation";

/** Anciennes pages absorbées par les trois nouvelles routes principales. */
const REDIRECTS: Record<string, string> = {
  "/app/adaptation": "/app/cv",
  "/app/alertes-gmail": "/app/offres",
  "/app/alertes-gmail/offre": "/app/offres",
  "/app/cv/builder": "/app/cv",
  "/app/cv/nouveau": "/app/cv",
  "/app/dossier": "/app/cv",
  "/app/lettres": "/app/cv",
  "/app/matching": "/app/offres",
  "/app/offers": "/app/offres",
  "/app/recruteurs": "/app/candidatures",
};

export default function AppIndexPage({ params }: { params: { segments?: string[] } }) {
  const segments = params.segments ?? [];
  const path = `/app/${segments.join("/")}`;
  redirect(REDIRECTS[path] ?? "/app/offres");
}
