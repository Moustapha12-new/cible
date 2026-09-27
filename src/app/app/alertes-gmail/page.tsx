import type { Metadata } from "next";
import AlertesGmailDashboard from "@/components/alertes-gmail/AlertesGmailDashboard";

export const metadata: Metadata = {
  title: "Alertes Gmail",
  description:
    "Dashboard d'observabilité des alertes Gmail : synchronisation, offres détectées, preuves d'extraction, erreurs et relances.",
};

/**
 * Page /app/alertes-gmail — Server Component (metadata + shell).
 * Le dashboard interactif (fetch GET/POST, expand, actions) est un Client
 * Component car l'auth est côté navigateur (localStorage session).
 */
export default function AlertesGmailPage() {
  return <AlertesGmailDashboard />;
}
