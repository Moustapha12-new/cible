"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { getOrCreateData, saveData, mergeUserData, type UserData } from "@/lib/data";
export default function CloudBackup() {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function action(mode: "save" | "restore" | "export") {
    if (!user || busy) return;
    setBusy(true);
    try {
      const local = getOrCreateData(user.name, user.email);
      if (mode === "export") {
        const url = URL.createObjectURL(new Blob([JSON.stringify(local, null, 2)], { type: "application/json" }));
        const a = document.createElement("a"); a.href = url; a.download = "cible-dossier-sauvegarde.json"; a.click(); URL.revokeObjectURL(url);
        setMessage("Export créé : conserve-le dans un endroit privé."); return;
      }
      const response = await fetch("/api/user-data", { cache: "no-store" });
      const result = await response.json(); if (!result.ok) throw new Error(result.error);
      if (mode === "save") {
        /* Fusion avec le dossier serveur : sauvegarder cet appareil ne doit
           jamais effacer ce qui n'existe que sur le compte (candidatures
           archivées depuis un autre écran, CV importé…). */
        const remote = result.record?.data as UserData | undefined;
        const merged = remote ? mergeUserData(remote, local) : local;
        const saved = await fetch("/api/user-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: merged, version: result.record?.version || 0 }) });
        const r = await saved.json(); if (!r.ok) throw new Error(r.error);
        setMessage("Dossier sauvegardé sur ton compte. La version précédente reste conservée côté serveur.");
      } else {
        const data = result.record?.data as UserData | undefined;
        if (!data) throw new Error("Aucune sauvegarde serveur. Sauvegarde d’abord depuis ton appareil principal.");
        window.localStorage.setItem(`cible:backup:${user.email}:${Date.now()}`, JSON.stringify(local));
        saveData(user.email, data);
        setMessage("Sauvegarde restaurée. Actualise la page pour afficher le dossier restauré ; le dossier précédent reste conservé en copie locale.");
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Sauvegarde impossible. Les données locales sont conservées."); }
    finally { setBusy(false); }
  }
  return <section className="glass-card p-5 mb-6"><h2 className="font-semibold">Mon dossier sur plusieurs appareils</h2><p className="text-sm text-muted mt-2">Sauvegarde ton CV et tes candidatures sur ton compte, ou exporte une copie. Gmail conserve déjà son propre catalogue serveur.</p><div className="flex flex-wrap gap-3 mt-4"><button className="btn-secondary" disabled={busy} onClick={() => action("save")}>Sauvegarder sur mon compte</button><button className="btn-line" disabled={busy} onClick={() => action("restore")}>Restaurer avec copie de sécurité</button><button className="btn-line" disabled={busy} onClick={() => action("export")}>Exporter mon dossier</button></div><p className="text-sm mt-3" role="status">{message}</p></section>;
}
