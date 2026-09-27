/* Tests pont Alertes Gmail → Candidature (bridge, conversion, pipeline).
   Exécution : npx tsx src/lib/gmail-bridge.test.ts */

import {
  CANDIDATURE_STEPS,
  candidatureRank,
  getCandidature,
  loadCandidatures,
  offerBridgeKey,
  offerToDetectedOffer,
  offerToOfferText,
  saveCandidature,
  writeQuickAdapt,
  type CandidatureState,
  type OfferLike,
} from "./gmail-bridge";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function assertEq(actual: unknown, expected: unknown, msg: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(
      `  ✗ ${msg}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
}

/** Map localStorage minimal pour Node. */
function installLocalStorage(): Map<string, string> {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
  (globalThis as { window?: unknown }).window = {
    ...(typeof (globalThis as { window?: unknown }).window === "object"
      ? ((globalThis as { window?: unknown }).window as object)
      : {}),
    localStorage: ls,
  };
  return store;
}

function sampleOffer(over: Partial<OfferLike> = {}): OfferLike {
  return {
    title: "Développeur Full-Stack",
    company: "ACME",
    location: "Paris",
    contract: "CDI",
    duration: "Temps plein",
    deadline: "2026-10-15",
    salary: "45–55k€",
    skills: ["TypeScript", "React", "Node.js"],
    missions: ["Développer des API", "Maintenir le front"],
    profile: "3 ans d'expérience web",
    description: "Rejoignez une équipe produit agile pour construire des outils internes.",
    keywords: ["typescript", "react", "api rest"],
    prerequisites: ["Bac+5", "Anglais B2"],
    applicationInfo: "Envoyez votre CV à jobs@acme.fr",
    applicationUrl: "https://www.linkedin.com/jobs/view/123?trackingId=abc",
    source: "LinkedIn",
    sourceUrl: "https://example.com/mail/1",
    anchorText: "Voir l'offre",
    snippet: "<div>Missions…</div>",
    enrichStatus: "ok",
    ...over,
  };
}

function main() {
  console.log("═".repeat(72));
  console.log("GMAIL BRIDGE — offre → matching / adaptation / lettre / candidature");
  console.log("═".repeat(72));

  console.log("\n[1] offerBridgeKey — identité URL ou titre|entreprise|loc");

  {
    const withUrl = sampleOffer();
    const sameUrl = sampleOffer({ title: "Autre titre", company: "Other" });
    assertEq(offerBridgeKey(withUrl), offerBridgeKey(sameUrl), "même URL → même clé");
    assert(offerBridgeKey(withUrl).startsWith("u:"), "clé URL préfixée u:");

    const noUrl1 = sampleOffer({ applicationUrl: "" });
    const noUrl2 = sampleOffer({ applicationUrl: "" });
    assertEq(offerBridgeKey(noUrl1), offerBridgeKey(noUrl2), "sans URL → clé stable");
    assert(offerBridgeKey(noUrl1).startsWith("t:"), "clé titre préfixée t:");

    const other = sampleOffer({ applicationUrl: "", company: "Zorg" });
    assert(offerBridgeKey(noUrl1) !== offerBridgeKey(other), "entreprise différente → clé différente");

    assertEq(
      offerBridgeKey({ title: " A ", company: " B ", location: " C ", applicationUrl: " https://X.COM/j " }),
      "u:https://x.com/j",
      "URL trim lowercase"
    );
  }

  console.log("\n[2] offerToOfferText — texte ≥30 car. pour /api/ai");

  {
    const t = offerToOfferText(sampleOffer());
    assert(t.length >= 30, `texte enrichi ≥30 car. (${t.length})`);
    assert(t.includes("Développeur Full-Stack"), "titre présent");
    assert(t.includes("ACME"), "entreprise présente");
    assert(t.includes("Missions"), "missions présentes");
    assert(t.includes("TypeScript"), "skills présents");
    assert(t.includes("typescript"), "keywords présents");
    assert(t.includes("jobs@acme.fr"), "modalités présentes");

    const bare = offerToOfferText({
      title: "Stage",
      applicationUrl: "https://example.com/j/9",
    });
    assert(bare.length >= 30, `offre minimale ≥30 car. (${bare.length})`);

    const empty = offerToOfferText({});
    assert(empty.length >= 30, "objet vide → garde-fou ≥30 car.");

    const html = offerToOfferText({
      title: "Dev",
      description: "<p>Bonjour&nbsp;&amp;&nbsp;monde</p>",
    });
    assert(html.includes("Bonjour & monde"), "HTML strippé (nbsp/entities)");
    assert(!html.includes("<p>"), "pas de balises restantes");
  }

  console.log("\n[3] offerToDetectedOffer — pont vers UserData.offers");

  {
    const d = offerToDetectedOffer(sampleOffer(), 78);
    assert(d.title === "Développeur Full-Stack", "title copié");
    assert(d.company === "ACME", "company copié");
    assert(d.location === "Paris", "location copié");
    assert(d.salary === "45–55k€", "salary copié");
    assertEq(d.match, 78, "match plafonné/réglé");
    assert(d.text.length >= 30, "text présent");
    assert(d.keywords.includes("typescript"), "keywords depuis keywords/skills");
    assert(d.source === "LinkedIn", "source copiée");
    assert(Boolean(d.url?.includes("linkedin.com")), "url = applicationUrl");
    assert(d.id.startsWith("gmail-"), "id préfixé gmail-");

    const over = offerToDetectedOffer(sampleOffer(), 999);
    assertEq(over.match, 100, "match clamp 100");
    const under = offerToDetectedOffer(sampleOffer(), -5);
    assertEq(under.match, 0, "match clamp 0");
  }

  console.log("\n[4] Pipeline candidature — étiquettes + rangs");

  {
    assertEq(
      CANDIDATURE_STEPS.map((s) => s.label),
      ["Pas encore", "En préparation", "Lettre prête", "Candidature envoyée"],
      "4 étapes du pipeline"
    );
    assertEq(candidatureRank("none"), 0, "none → 0");
    assertEq(candidatureRank("adaptation"), 1, "adaptation → 1");
    assertEq(candidatureRank("letter_ready"), 2, "letter_ready → 2");
    assertEq(candidatureRank("sent"), 3, "sent → 3");
    assertEq(candidatureRank(undefined), 0, "undefined → 0");
    assert(candidatureRank("sent") > candidatureRank("none"), "sent > none");
  }

  console.log("\n[5] Candidature store + quick-adapt (localStorage)");

  {
    installLocalStorage();

    assertEq(loadCandidatures("user@x.fr"), {}, "store vide au départ");

    const key = offerBridgeKey(sampleOffer());
    const state: CandidatureState = {
      key,
      status: "letter_ready",
      score: 82,
      present: ["typescript"],
      missing: ["graphql"],
      strategy: "Ajoute GraphQL",
      letter: "Objet : Candidature…",
      updatedAt: new Date().toISOString(),
    };
    const saved = saveCandidature("user@x.fr", state);
    assert(saved.updatedAt.length > 0, "updatedAt renseigné");

    const back = getCandidature("user@x.fr", key);
    assert(back?.status === "letter_ready", "reload status");
    assertEq(back?.score, 82, "reload score");
    assertEq(back?.present, ["typescript"], "reload present");
    assert(Boolean(back?.letter?.includes("Candidature")), "reload letter");

    const other = getCandidature("user@x.fr", "t:missing");
    assert(other === null, "clé absente → null");

    writeQuickAdapt("Texte d'offre assez long pour l'adaptation IA…", ["graphql"], {
      title: "Développeur Full-Stack",
      company: "ACME",
      summary: "Offre full-stack 6 mois.",
      keywords: ["graphql", "react"],
      match: 78,
    });
    const raw = (globalThis as unknown as { window: { localStorage: { getItem(k: string): string | null } } })
      .window.localStorage.getItem("cible:quick-adapt");
    assert(Boolean(raw), "cible:quick-adapt écrit");
    const parsed = JSON.parse(raw!) as {
      offerText: string;
      selected: string[];
      at: number;
      meta?: { title?: string; summary?: string; match?: number; keywords?: string[] };
    };
    assert(parsed.offerText.includes("adaptation IA"), "offerText stocké");
    assertEq(parsed.selected, ["graphql"], "selected stocké");
    assert(typeof parsed.at === "number", "at = timestamp");
    assertEq(parsed.meta?.title, "Développeur Full-Stack", "meta.title pour Module 03");
    assertEq(parsed.meta?.match, 78, "meta.match score ATS");
    assertEq(parsed.meta?.summary, "Offre full-stack 6 mois.", "meta.summary résumé 3 phrases");
    assertEq(parsed.meta?.keywords, ["graphql", "react"], "meta.keywords ATS");
  }

  console.log("\n[6] OfferCard → href détail (intégration composant)");

  {
    /* Contrat de route attendu par OfferCard + page offre. */
    const key = offerBridgeKey(sampleOffer());
    const href = `/app/alertes-gmail/offre?k=${encodeURIComponent(key)}`;
    assert(href.includes("/app/alertes-gmail/offre"), "route détail");
    const qs = new URL(href, "http://localhost").searchParams.get("k");
    assertEq(qs, key, "clé round-trip via query param");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
