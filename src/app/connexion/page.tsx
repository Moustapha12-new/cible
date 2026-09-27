import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth";
import ConnexionForm from "./form";

export const metadata: Metadata = {
  title: "Connexion",
};

export default function ConnexionPage() {
  return (
    <AuthProvider>
      <ConnexionForm />
    </AuthProvider>
  );
}
