"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getOrCreateData, saveData, type DetectedOffer, type UserData } from "@/lib/data";
import { confirmCvTerm, hasCvTerm } from "@/lib/cv-keywords";
import { cvToText } from "@/lib/cv";

export default function ConfirmedSkills({ offer, onChange }: { offer: DetectedOffer; onChange?: (data: UserData) => void }) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!user) return;
    const reload = () => { const data = getOrCreateData(user.name, user.email); setText(data.dossiers?.[offer.id]?.cvText || (data.cvData ? cvToText(data.cvData) : data.originalCv?.text || "")); };
    const timer = setTimeout(reload, 0);
    window.addEventListener("cible:data-changed", reload);
    return () => { clearTimeout(timer); window.removeEventListener("cible:data-changed", reload); };
  }, [user, offer.id]);
  function add(term: string) {
    if (!user) return;
    try {
      const next = confirmCvTerm(getOrCreateData(user.name, user.email), offer, term);
      saveData(user.email, next); onChange?.(next);
      setMessage(`« ${term.trim()} » ajouté à ton CV et au dossier de cette offre.`); setCustom("");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Ajout impossible"); }
  }
  const terms = [...new Map(offer.keywords.filter(k => !/^(stage|pfe|ats|recrutement|ingenieur|ingénieur)$/i.test(k.trim())).map(k => [k.toLocaleLowerCase("fr"), k])).values()];
  return <details className="mt-4 border-t border-line pt-3"><summary className="cursor-pointer text-sm font-semibold text-mint">Ajouter mes compétences au CV</summary><p className="text-xs text-muted mt-3 mb-3">Clique sur un terme uniquement si tu le maîtrises. Il sera ajouté à la rubrique Compétences de ton CV et de ce dossier.</p><div className="flex flex-wrap gap-2">{terms.map(term => { const present = hasCvTerm(text, term); return <button type="button" key={term} className={`chip ${present ? "chip--mint" : "chip--amber"}`} disabled={present} onClick={() => add(term)} aria-label={present ? `${term} déjà dans mon CV` : `Je maîtrise ${term} : ajouter au CV`}>{present ? "✓ " : "+ "}{term}</button>; })}</div><label className="block text-xs mt-4">Autre compétence ou logiciel que je maîtrise<input className="input w-full mt-2" value={custom} onChange={e => setCustom(e.target.value)} placeholder="Ex. : CANECO, Excel, AutoCAD…" maxLength={100} /></label><button type="button" className="btn-line btn-sm mt-2" disabled={!custom.trim()} onClick={() => add(custom)}>Je maîtrise ce terme · ajouter au CV</button>{message && <p className="text-xs text-mint mt-3" role="status">{message}</p>}</details>;
}
