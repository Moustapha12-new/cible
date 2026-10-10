import { htmlToText } from "./scrape";
import type { EnrichedOfferData } from "./gmail-enrich";

/** Extraction de secours : uniquement des termes réellement présents dans la source. */
export function groundedOfferData(source: string): Partial<EnrichedOfferData> {
  const text = htmlToText(source).replace(/<\/?[a-z][^>]*(?:>|$)/gi, " ").replace(/\r/g, "").trim();
  const vocabulary = /(?<![\p{L}\p{N}_])(?:génie électrique|génie civil|génie mécanique|études techniques|conception électrique|dimensionnement|installation électrique|électrotechnique|électricité|automatisme|maintenance|bureau d'études|gestion de projet|analyse technique|calculs?|simulation|réseaux électriques|énergies? renouvelables|photovoltaïque|bilan de puissance|schémas électriques|caneco|autocad|revit|solidworks|catia|matlab|simulink|python|javascript|typescript|java|sql|excel|power bi|tableau|c\+\+|git|linux|docker|kubernetes|anglais|français|communication|travail en équipe|analyse de données|machine learning|intelligence artificielle|supply chain|logistique|qualité|sécurité|finance|comptabilité|marketing|développement commercial|recrutement|électronique|systèmes embarqués|iot|courants de foucault|contrôle non destructif|batteries|matériaux|convertisseurs|asservissement|mécatronique|vhdl|fpga|cfo|cfa|labview)(?![\p{L}\p{N}_])/giu;
  const keywords = [...new Map([...text.matchAll(vocabulary)].map(match => [match[0].toLowerCase(), match[0]])).values()].slice(0, 24);
  const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const labeled = (label: string) => lines.find(line => line.startsWith(label + " : "))?.slice(label.length + 3).trim();
  const missions = lines.filter(line => /(?:conception|concevoir|concev|dimensionn|rédaction|rédig|réalis|développ|calcul|simul|analyser|analyserez|vérifi|suivi|contribu|particip|assur)/i.test(line) && !/^(?:profil|formation|vous êtes|vous etes|qualités|compétences requises)/i.test(line) && line.length > 35).slice(0, 8).map(line => line.slice(0, 600));
  const prerequisites = lines.filter(line => /(?:profil|bac\s*\+\s*[2-5]|master|ingénieur|formation|expérience|compétences?|maîtri)/i.test(line) && line.length > 35).slice(0, 6).map(line => line.slice(0, 500));
  const summary = (lines.find(line => line.length > 120 && !/^https?:/.test(line)) || text).slice(0, 450);
  const title = labeled("Poste") || (lines[0]?.length < 180 && /stage|internship|alternance|ingénieur/i.test(lines[0]) ? lines[0] : undefined);
  const company = labeled("Entreprise");
  const location = labeled("Lieu");
  return { ...(title ? { title } : {}), ...(company ? { company } : {}), ...(location ? { location } : {}), description: text.slice(0, 9000), summary, keywords, skills: keywords, missions, prerequisites };
}
