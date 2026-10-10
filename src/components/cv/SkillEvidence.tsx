"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getOrCreateData, saveData, type SkillEvidence as Evidence } from "@/lib/data";
export default function SkillEvidence() {
  const { user } = useAuth();
  const [items, setItems] = useState<Evidence[]>([]);
  useEffect(() => {
    if (!user) return;
    const refresh = () => { const data = getOrCreateData(user.name, user.email); setItems(data.profile.skillEvidence || data.profile.skills.map(term => ({ term, status: "verify", autonomy: "unknown", evidence: "", updatedAt: "" }))); };
    const timer = setTimeout(refresh, 0); window.addEventListener("cible:data-changed", refresh);
    return () => { clearTimeout(timer); window.removeEventListener("cible:data-changed", refresh); };
  }, [user]);
  function change(index: number, patch: Partial<Evidence>) {
    if (!user) return; const updated = items.map((item, i) => {
      if (i !== index) return item;
      const next = { ...item, ...patch, updatedAt: new Date().toISOString() };
      if (next.status === "demonstrated" && !next.evidence.trim()) next.status = "verify";
      return next;
    });
    setItems(updated); const data = getOrCreateData(user.name, user.email); saveData(user.email, { ...data, profile: { ...data.profile, skillEvidence: updated } });
  }
  return <section className="glass-card p-5 mb-6"><h2 className="font-semibold">Les preuves de mes compétences</h2><p className="text-sm text-muted mb-4">Relie chaque compétence à un projet, cours, stage ou livrable. Une déclaration seule reste une déclaration. <a href="/app/matching" className="text-mint underline">Ouvrir le registre complet</a>.</p>{items.map((item, index) => <div key={item.id || `${item.term}-${index}`} className="grid gap-2 mb-4"><strong>{item.term}</strong><select className="input" aria-label={`Statut de ${item.term}`} value={item.status} onChange={e => change(index, { status: e.target.value as Evidence["status"] })}><option value="verify">À vérifier</option><option value="declared">Déclarée</option><option value="studied">Étudiée</option><option value="demonstrated">Démontrée</option><option value="missing">Non acquise</option></select><input className="input" aria-label={`Preuve de ${item.term}`} placeholder="Projet, cours, stage, lien vers un livrable…" value={item.evidence} onChange={e => change(index, { evidence: e.target.value })} /><input className="input" aria-label={`Source de ${item.term}`} placeholder="Source : projet, cours, stage, document…" value={item.source || ""} onChange={e => change(index, { source: e.target.value })} /><select className="input" aria-label={`Autonomie en ${item.term}`} value={item.autonomy} onChange={e => change(index, { autonomy: e.target.value as Evidence["autonomy"] })}><option value="unknown">Autonomie à préciser</option><option value="assisted">Avec accompagnement</option><option value="independent">En autonomie</option></select></div>)}</section>;
}
