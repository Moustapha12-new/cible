import assert from "node:assert/strict";
import { emptyData, mergeUserData, type Application, type DetectedOffer, type UserData } from "./data";

const offer = (id: string, title: string): DetectedOffer => ({ id, title, company: "Test", location: "", salary: "", match: 0, keywords: [], text: "Texte de l'annonce" });
const application = (id: string, offerId: string): Application => ({ id, offerId, company: "Test", role: "Stage", status: "sent", daysAgo: 0, source: "cible", date: "2026-10-21T00:00:00.000Z" });

// Scénario réel : offre ajoutée manuellement + candidature archivée via
// /api/candidatures/apply (donc présente côté serveur UNIQUEMENT), puis un
// push local partiel (page offres / CloudBackup) : la candidature serveur
// doit survivre à la fusion.
const server: UserData = {
  ...emptyData("Alice", "alice@example.test"),
  offers: [offer("manual-1", "Stage manuel")],
  applications: [application("app-server", "manual-1")],
  originalCv: { name: "maitre.pdf", text: "CV maître importé" },
};
const local: UserData = {
  ...emptyData("Alice", "alice@example.test"),
  offers: [offer("local-1", "Offre locale"), offer("manual-1", "Stage manuel")],
  applications: [application("app-local", "local-1")],
};
const merged = mergeUserData(server, local);
assert.deepEqual(merged.applications.map((a) => a.id).sort(), ["app-local", "app-server"]);
assert.deepEqual(merged.offers.map((o) => o.id).sort(), ["local-1", "manual-1"]);
assert.equal(merged.originalCv?.text, "CV maître importé");

// Un CV importé uniquement localement est conservé si le serveur n'en a pas.
const serverWithoutCv = emptyData("Alice", "alice@example.test");
const localWithCv: UserData = { ...emptyData("Alice", "alice@example.test"), originalCv: { name: "local.pdf", text: "CV local" } };
assert.equal(mergeUserData(serverWithoutCv, localWithCv).originalCv?.text, "CV local");

// Les cartes serveur (PDF par offre, file d'adaptation) ne sont pas perdues
// face à un état local vide.
const serverWithMaps: UserData = {
  ...emptyData("Alice", "alice@example.test"),
  offerCvOverrides: { "manual-1": { offerId: "manual-1", fileName: "cv.pdf", documentId: "doc-1", versionId: "v-1", sha256: "a".repeat(64), uploadedAt: "2026-10-21T00:00:00.000Z" } },
};
const mergedMaps = mergeUserData(serverWithMaps, emptyData("Alice", "alice@example.test"));
assert.equal(mergedMaps.offerCvOverrides?.["manual-1"]?.fileName, "cv.pdf");

// L'ajout local enrichit aussi les cartes sans écraser la valeur serveur.
const enriched = mergeUserData(serverWithMaps, { ...emptyData("Alice", "alice@example.test"), offerCvOverrides: { "local-2": { offerId: "local-2", fileName: "local.pdf", documentId: "doc-2", versionId: "v-2", sha256: "b".repeat(64), uploadedAt: "2026-10-21T00:00:00.000Z" } } });
assert.equal(enriched.offerCvOverrides?.["manual-1"]?.fileName, "cv.pdf");
assert.equal(enriched.offerCvOverrides?.["local-2"]?.fileName, "local.pdf");

// Une seule candidature par offre : marquage local (sans CV) + candidature
// serveur archivée (avec CV) pour la MÊME offre → une seule entrée, la plus riche.
const archived: Application = {
  ...application("app-serveur", "manual-1"),
  sentDocumentVersions: [{ documentId: "doc-1", versionId: "v-1", fileName: "cv.pdf", sentAt: "2026-10-21T00:00:00.000Z", source: "personal" }],
};
const markedOnly: Application = { ...application("app-locale", "manual-1"), notes: "Marqué manuellement" };
const deduped = mergeUserData(
  { ...emptyData("Alice", "alice@example.test"), applications: [archived] },
  { ...emptyData("Alice", "alice@example.test"), applications: [markedOnly] }
);
assert.equal(deduped.applications.length, 1, "une seule candidature par offre");
assert.equal(deduped.applications[0].id, "app-serveur", "la candidature avec CV archivé l'emporte");

// Les candidatures sans offre liée ne sont jamais fusionnées entre elles.
const noOffer = mergeUserData(
  { ...emptyData("Alice", "alice@example.test"), applications: [application("a1", "")] },
  { ...emptyData("Alice", "alice@example.test"), applications: [application("a2", "")] }
);
assert.equal(noOffer.applications.length, 2);

console.log("mergeUserData : candidatures serveur préservées, ajouts locaux fusionnés, une entrée par offre, cartes conservées.");
