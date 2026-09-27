import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth";
import InscriptionForm from "./form";

export const metadata: Metadata = {
  title: "Créer un compte",
};

export default function InscriptionPage() {
  return (
    <AuthProvider>
      <InscriptionForm />
    </AuthProvider>
  );
}
