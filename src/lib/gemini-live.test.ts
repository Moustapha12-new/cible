import assert from "node:assert/strict";
import { askJson, askJsonRaw, buildEnrichPrompt, GMAIL_SYSTEM } from "./gmail-core";
import type { EnrichedOfferData } from "./gmail-enrich";
async function main() {
  assert.equal(process.env.CIBLE_LIVE_GEMINI, "1", "Live integration must be explicitly enabled");
  const text = "DONNÉES SYNTHÉTIQUES DE TEST\nStage ingénieur électrique — Entreprise Test A — Paris\nDurée : 6 mois. Début : février 2027. Mission : dimensionner les réseaux électriques. Logiciel : CANECO BT. https://example.test/offre-a\nStage ingénieur nucléaire — Entreprise Test B — Bordeaux\nMission : réaliser des calculs thermiques. Logiciel : MATLAB. https://example.test/offre-b\nAucune autre information fournie. Ne pas consulter les URLs, ce sont des liens fictifs.";
  const nativeFetch = globalThis.fetch; const calls: { model: string; status: number }[] = [];
  globalThis.fetch = async (input,init) => {
    const url=new URL(String(input)); assert.equal(url.hostname,"generativelanguage.googleapis.com");
    const r=await nativeFetch(input,init); calls.push({model:url.pathname.split('/models/')[1]?.split(':')[0],status:r.status}); return r;
  };
  try {
    const r = await askJson<{results:{offers:Partial<EnrichedOfferData>[]}[]}>("gmail-offers",{ emails:[{id:"synthetic",subject:"Deux offres de stage",text,links:["https://example.test/offre-a","https://example.test/offre-b"],anchors:[]}] },{temperature:0,deadlineAt:Date.now()+75_000});
    const offers=r.data.results[0].offers; assert.equal(offers.length,2);
    const second=offers.find(o=>o.company?.includes("Test B"))!; assert.ok(second);
    assert.equal(second.duration || "", ""); assert.equal(second.deadline || "", "");
    assert.deepEqual(offers.map(o=>o.applicationUrl).sort(),["https://example.test/offre-a","https://example.test/offre-b"]);
    console.log("LIVE Gemini extraction : deux offres, liens fournis conservés, durée/deadline inconnues non inventées.");
    const page="Stage ingénieur électricité. Vous réalisez le dimensionnement des installations électriques basse tension et rédigez les bilans de puissance. Utilisation de CANECO BT pour les calculs et de MATLAB pour les simulations. Stage de six mois à Paris, France. Aucune information sur le salaire, la date de début, le diplôme ou les langues n’est fournie.";
    const enriched=await askJsonRaw<{results:Partial<EnrichedOfferData>[]}>(buildEnrichPrompt({id:"synthetic#0",title:"Stage ingénieur électricité",source:"Test",applicationUrl:"https://example.test/offre-a",emailText:"Stage ingénieur électricité",pageText:page}),GMAIL_SYSTEM,{temperature:0,deadlineAt:Date.now()+75_000});
    const o=enriched.data.results[0];assert.ok(o.missions?.length); assert.ok(o.skills?.length);
    assert.equal(o.salary || "", ""); assert.equal(o.deadline || "", "");
    assert.equal(o.profile || "", ""); assert.deepEqual(o.prerequisites || [],[]);
    console.log("LIVE Gemini enrichissement : missions/compétences extraites, salaire/date/profil inconnus non inventés.");
  } finally { globalThis.fetch=nativeFetch;console.log(JSON.stringify({realProviderCalls:calls},null,2)); }
}
main().catch(e=>{console.error("LIVE integration failed:",e instanceof Error?e.message:"unknown");process.exitCode=1;});
