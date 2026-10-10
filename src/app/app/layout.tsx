import { verifiedUser } from "@/lib/auth-server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import AppShell from "@/components/app/AppShell";

export const metadata: Metadata = {
  title: "Mon espace",
};

export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!await verifiedUser()) redirect("/connexion?next=/app");
  return (
    <AuthProvider>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  );
}
