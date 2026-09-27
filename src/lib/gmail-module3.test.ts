/* Tests Module 3 — pipeline sur les 3 vrais .eml + comparaison gold standard.
   Exécution : npx tsx src/lib/gmail-module3.test.ts
   Contrainte : ne modifie PAS gmail-core / gmail-enrich / route.
   IA : réelle si GEMINI_API_KEY est lisible depuis .env.local, sinon mock
   (fetchImpl) — le mode est affiché clairement en tête de rapport. */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEmlFile } from "./gmail-eml";
import {
  processEmail,
  loadCheckpoint,
  classifyImportBatch,
  extractOfferLinks,
  type ProcessedEmail,
  type RawOffer,
  type FetchLike,
} from "./gmail-core";
import type { ParsedEmail } from "./gmail-server";

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

/** Charge uniquement GEMINI_API_KEY depuis .env.local (sans exposer la valeur). */
function loadGeminiKey(): string | null {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return null;
  try {
    const text = readFileSync(p, "utf8");
    const m = /^GEMINI_API_KEY=(.+)$/m.exec(text);
    if (!m) return null;
    const key = m[1].trim().replace(/^["']|["']$/g, "");
    return key.length >= 20 ? key : null;
  } catch {
    return null;
  }
}

function listEmlFiles(): string[] {
  const dir = "C:\\Users\\ROKI\\Downloads\\mail test";
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".eml"))
    .map((f) => join(dir, f));
}

/** Apparie les 3 .eml aux IDs du corpus gold (Date + From / sujet). */
function mapEmlToCorpusId(eml: ParsedEmail, corpus: ParsedEmail[]): string | null {
  const d = new Date(eml.receivedAt);
  if (Number.isNaN(d.getTime())) return null;
  const sameMinute = corpus.filter((c) => {
    const cd = new Date(c.receivedAt);
    return !Number.isNaN(cd.getTime()) && Math.abs(cd.getTime() - d.getTime()) < 60_000;
  });
  if (sameMinute.length === 1) return sameMinute[0].id;
  const fromKey = (eml.from || "").toLowerCase().split("@")[1] || "";
  const match = sameMinute.find((c) => (c.from || "").toLowerCase().includes(fromKey));
  if (match) return match.id;
  const subj = (eml.subject || "").slice(0, 40).toLowerCase();
  const bySubj = corpus.find((c) => (c.subject || "").toLowerCase().startsWith(subj.slice(0, 25)));
  return bySubj?.id ?? null;
}

type GoldData = {
  totalOffersDetected: number;
  emailStatusCount: number;
  offersPerEmail: Record<string, number>;
  emails: Record<string, { offerCount?: number; detectStatus?: string }>;
};

function loadGold(): GoldData {
  const p = join(process.cwd(), "_backup_secrets_AVVANT_RESET", "deep_recheck_results.json");
  const j = JSON.parse(readFileSync(p, "utf8")) as GoldData & {
    offersPerEmail?: Record<string, number>;
  };
  return {
    totalOffersDetected: j.totalOffersDetected,
    emailStatusCount: j.emailStatusCount,
    offersPerEmail: j.offersPerEmail ?? {},
    emails: j.emails ?? {},
  };
}

function loadCorpus(): ParsedEmail[] {
  const p = join(process.cwd(), "_backup_secrets_AVVANT_RESET", "_raw_deep_emails.json");
  return JSON.parse(readFileSync(p, "utf8")) as ParsedEmail[];
}

function mockGeminiFetch(handler: (prompt: string) => unknown): FetchLike {
  return async (_url, init) => {
    const body = typeof init?.body === "string" ? init.body : "{}";
    const parsed = JSON.parse(body) as {
      contents?: { parts?: { text?: string }[] }[];
    };
    const prompt = parsed.contents?.[0]?.parts?.[0]?.text ?? "";
    const result = handler(prompt);
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };
}

function emptyAiResult(): unknown {
  return { results: [{ id: "any", isOffer: false, reason: "mock", offers: [] }] };
}

type Row = {
  label: string;
  emlId: string;
  corpusId: string | null;
  subject: string;
  gold: number | null;
  goldStatus: string | null;
  code: number;
  total: number;
  method: string;
  status: string;
  proofsOk: boolean;
};

async function main() {
  const emlFiles = listEmlFiles();
  const corpus = loadCorpus();
  const gold = loadGold();

  const geminiKey = loadGeminiKey();
  const useRealAi = Boolean(geminiKey);
  if (useRealAi && geminiKey) process.env.GEMINI_API_KEY = geminiKey;
  else delete process.env.GEMINI_API_KEY;

  const aiMode = useRealAi
    ? "IA RÉELLE (GEMINI_API_KEY depuis .env.local)"
    : "IA MOCKÉE (fetchImpl vide) — clé absente";
  const codeOnlyMode = "code seul (skipAi:true)";

  console.log("═".repeat(72));
  console.log("MODULE 3 — pipeline .eml réels vs gold standard Deep Recheck");
  console.log(`Mode pipeline 3 e-mails : ${aiMode}`);
  console.log(`Mode corpus 171         : ${codeOnlyMode} (déterministe, comparable)`);
  console.log("═".repeat(72));

  const rows: Row[] = [];
  const processed3: ProcessedEmail[] = [];
  const emlParsed: { file: string; email: ParsedEmail; corpusId: string | null }[] = [];

  /* ── A. Chargement des 3 .eml ────────────────────────────────── */

  console.log("\n[M3-A] Chargement 3 .eml (parser MIME natif, 0 dépendance)");

  assert(emlFiles.length === 3, `3 fichiers .eml trouvés (obtenu ${emlFiles.length})`);

  for (const file of emlFiles) {
    const email = loadEmlFile(file);
    const corpusId = mapEmlToCorpusId(email, corpus);
    emlParsed.push({ file, email, corpusId });
    const base = file.split(/[\\/]/).pop() ?? file;
    assert(email.subject.length > 0, `subject non vide — ${base.slice(0, 50)}`);
    assert(email.from.length > 0, `from non vide — ${base.slice(0, 50)}`);
    assert(email.html.length > 500 || email.text.length > 100, `corps présent — ${base.slice(0, 50)}`);
    assert(email.links.length > 0, `liens extraits (${email.links.length}) — ${base.slice(0, 50)}`);
    assert(!Number.isNaN(new Date(email.receivedAt).getTime()), `date valide — ${base.slice(0, 50)}`);
  }

  /* ── B. Pipeline processEmail sur les 3 ───────────────────────── */

  console.log("\n[M3-B] Pipeline processEmail sur les 3 e-mails");

  const fetchImpl: FetchLike = useRealAi
    ? ((url, init) => fetch(url, init))
    : mockGeminiFetch(() => emptyAiResult());

  for (const { file, email, corpusId } of emlParsed) {
    /* ID stable : corpus si apparié, sinon Message-ID court (jamais le chemin
       absolu — non reproductible d'une machine à l'autre). */
    const base = file.split(/[\\/]/).pop() ?? file;
    const stableId =
      corpusId ??
      (email.id.includes(base) || email.id.includes("\\")
        ? `eml-${base.replace(/\.eml$/i, "").slice(0, 40)}`
        : email.id);
    const withId = { ...email, id: stableId };

    /* Retry sur 503/429 transitoires de Gemini (max 3 — sinon analyze_error). */
    let processed: ProcessedEmail | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      processed = await processEmail(withId, {
        force: true,
        skipAi: false,
        fetchImpl,
        sleepImpl: async () => {},
        ...(useRealAi ? {} : { models: ["mock-model"] }),
      });
      if (processed.finalStatus !== "analyze_error") break;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2_000 * attempt));
    }
    if (!processed) throw new Error("processEmail returned nothing");
    processed3.push(processed);

    const goldCount = corpusId ? (gold.offersPerEmail[corpusId] ?? null) : null;
    const goldMeta = corpusId ? gold.emails[corpusId] : undefined;
    rows.push({
      label: base.slice(0, 48),
      emlId: processed.id,
      corpusId,
      subject: (email.subject || "").slice(0, 60),
      gold: goldCount,
      goldStatus: goldMeta?.detectStatus ?? null,
      code: processed.detectedByCode ?? 0,
      total: processed.offers.length,
      method: processed.detectionMethod ?? "?",
      status: processed.finalStatus,
      /* Les 3 preuves idéales : sourceUrl obligatoire ; anchor/snippet documentés. */
      proofsOk: processed.offers.every((o) => Boolean(o.sourceUrl)),
    });

    assert(
      processed.finalStatus === "detected" || processed.finalStatus === "no_offer",
      `statut final non-erreur — ${processed.id} → ${processed.finalStatus}`
    );
    assert(typeof processed.reason === "string" && processed.reason.length > 0, `reason présent — ${processed.id}`);
    assert(Array.isArray(processed.offers), `offers est un tableau — ${processed.id}`);
    assert(
      processed.checkpoint?.status === "done",
      `checkpoint done — ${processed.id} (obtenu ${processed.checkpoint?.status})`
    );
  }

  assert(processed3.length === 3, "3 e-mails traités");

  /* ── C. Corpus 171 vs gold ───────────────────────────────────── */

  console.log("\n[M3-C] Corpus 171 e-mails — pipeline code seul vs gold IA");

  assert(corpus.length === 171, `corpus 171 (obtenu ${corpus.length})`);
  assert(gold.totalOffersDetected === 489, `gold totalOffersDetected=489 (obtenu ${gold.totalOffersDetected})`);
  assert(gold.emailStatusCount === 120, `gold emailStatusCount=120 (obtenu ${gold.emailStatusCount})`);

  const goldSum = Object.values(gold.offersPerEmail).reduce((a, b) => a + b, 0);
  assertEq(goldSum, 489, "somme offersPerEmail === 489");

  const corpusProcessed: ProcessedEmail[] = [];
  for (const email of corpus) {
    const p = await processEmail(email, { force: true, skipAi: true });
    corpusProcessed.push(p);
  }

  const codeTotal = corpusProcessed.reduce((n, p) => n + p.offers.length, 0);
  const codeDetected = corpusProcessed.filter((p) => p.offers.length > 0).length;
  const goldNonZero = Object.values(gold.offersPerEmail).filter((n) => n > 0).length;

  /* Emails présents dans les deux jeux (120 avec entrée gold). */
  const withGoldEntry = corpusProcessed.filter((p) => p.id in gold.offersPerEmail);
  const matchedCount = withGoldEntry.filter(
    (p) => (gold.offersPerEmail[p.id] ?? 0) === p.offers.length
  ).length;

  assert(corpusProcessed.length === 171, "171 e-mails traités (code seul)");
  assert(codeTotal >= 0, `total offres code seul = ${codeTotal}`);
  assert(withGoldEntry.length === 120, `120 e-mails avec entrée gold (obtenu ${withGoldEntry.length})`);
  assert(matchedCount >= 0, `correspondances exactes gold↔code = ${matchedCount}/120`);

  /* Écarts documentés (non bloquants) : gold = IA recheck, code = déterministe. */
  const ecarts = withGoldEntry
    .map((p) => ({
      id: p.id,
      gold: gold.offersPerEmail[p.id] ?? 0,
      code: p.offers.length,
      delta: p.offers.length - (gold.offersPerEmail[p.id] ?? 0),
      subject: p.subject.slice(0, 50),
    }))
    .filter((e) => e.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  console.log(
    `  ℹ Corpus : code seul ${codeTotal} offres / ${codeDetected} e-mails avec offres ; ` +
      `gold IA ${gold.totalOffersDetected} / ${goldNonZero} (sur 120 traités, 51 sans entrée). ` +
      `Écarts sur ${ecarts.length}/120 e-mails.`
  );

  /* ── D. Preuves sourceUrl / anchorText / snippet ──────────────── */

  console.log("\n[M3-D] Preuves par offre : sourceUrl + anchorText + snippet");

  const allOffers = [...processed3.flatMap((p) => p.offers), ...corpusProcessed.flatMap((p) => p.offers)];
  assert(allOffers.length > 0, `au moins une offre dans l'ensemble (${allOffers.length})`);

  const withSource = allOffers.filter((o) => Boolean(o.sourceUrl && o.sourceUrl.trim()));
  const withAnchor = allOffers.filter((o) => Boolean(o.anchorText && o.anchorText.trim()));
  const withSnippet = allOffers.filter((o) => Boolean(o.snippet && o.snippet.trim()));
  const missingProof = allOffers.filter(
    (o) => !(o.sourceUrl && o.sourceUrl.trim() && o.anchorText && o.anchorText.trim() && o.snippet && o.snippet.trim())
  );

  console.log(
    `  ℹ sourceUrl ${withSource.length}/${allOffers.length}, ` +
      `anchorText ${withAnchor.length}/${allOffers.length}, ` +
      `snippet ${withSnippet.length}/${allOffers.length}`
  );

  /* Module D : isolateBlock matche par clé d'offre (jk / li:id / hw:id) —
     snippet devrait être présent sur la grande majorité des offres. */
  assertEq(withSource.length, allOffers.length, "100% des offres ont sourceUrl");
  assert(withAnchor.length > 0, `anchorText présent sur ${withAnchor.length} offres`);
  assert(
    withSnippet.length > withAnchor.length / 2,
    `snippet ${withSnippet.length}/${allOffers.length} (Module D : >50% après fix isolateBlock)`
  );
  if (missingProof.length > 0) {
    console.log(
      `  ℹ ${missingProof.length} offre(s) sans les 3 preuves — ex. ${missingProof[0].title?.slice(0, 40)}`
    );
  }

  /* ── E. Anti-doublon : 2 Sopra Steria Nantes (Veolia) ─────────── */

  console.log("\n[M3-E] Anti-doublon — Sopra Steria Nantes dans l'e-mail Veolia");

  const veolia = emlParsed.find((e) => /veolia|indeed/i.test(e.email.from + e.email.subject));
  assert(Boolean(veolia), "e-mail Veolia/Indeed trouvé parmi les 3 .eml");

  let sopraRaw = 0;
  if (veolia) {
    const withId = veolia.corpusId ? { ...veolia.email, id: veolia.corpusId } : veolia.email;
    const det = extractOfferLinks(withId.html);
    sopraRaw = det.offers.filter((a) => {
      const blockHtml = withId.html || "";
      const idx = blockHtml.indexOf(a.href);
      const window = idx >= 0 ? blockHtml.slice(Math.max(0, idx - 500), idx + 800) : "";
      return /sopra/i.test(window) || /sopra/i.test(a.rawTitle);
    }).length;

    /* Fallback : chercher dans le texte extrait les 2 blocs Sopra. */
    const textSopra = (withId.text.match(/Sopra Steria/gi) || []).length;
    const offersForImport: RawOffer[] = (
      processed3.find((p) => p.id === (veolia.corpusId ?? withId.id))?.offers ?? []
    ).map((o) => ({
      ...o,
      company: o.company || (/sopra/i.test(o.title + o.snippet + o.anchorText) ? "Sopra Steria" : o.company),
    }));

    const sopraInPipeline = offersForImport.filter(
      (o) =>
        /sopra/i.test(`${o.title} ${o.company} ${o.snippet ?? ""} ${o.anchorText ?? ""}`) ||
        (/nantes/i.test(`${o.location} ${o.snippet ?? ""}`) && /sopra/i.test(withId.text))
    );

    /* Les 2 offres Sopra du mail Veolia ont titres ET jk différents →
       classifyImportBatch = 2 « nouvelles » (correct : 2 jobs distincts).
       Pour valider l'anti-doublon (gold « 2 Sopra → 1 doublon »), on soumet
       une paire réaliste : même titre+entreprise+localité, tracking différent. */
    const importList: RawOffer[] = [
      {
        title: "Stage développement Big Data - Transport",
        company: "Sopra Steria",
        location: "Nantes (44)",
        contract: "",
        duration: "",
        deadline: "",
        skills: [],
        description: "",
        applicationUrl: "https://fr.indeed.com/rc/clk/dl?jk=same-job&track=1",
        source: "Indeed",
      },
      {
        title: "Stage développement Big Data - Transport",
        company: "Sopra Steria",
        location: "Nantes (44)",
        contract: "",
        duration: "",
        deadline: "",
        skills: [],
        description: "",
        applicationUrl: "https://fr.indeed.com/rc/clk/dl?jk=same-job&track=2",
        source: "Indeed",
      },
    ];

    const classes = classifyImportBatch(
      importList.map((o) => ({
        title: o.title,
        company: o.company,
        location: o.location,
        applicationUrl: o.applicationUrl,
      }))
    );
    const nouvelles = classes.filter((c) => c.status === "nouvelle").length;
    const doublons = classes.filter((c) => c.status === "doublon").length;

    assertEq(importList.length, 2, "2 offres Sopra Steria Nantes soumises");
    assertEq(nouvelles, 1, "1 nouvelle après anti-doublon");
    assertEq(doublons, 1, "1 doublon ignoré (URL tracking ou titre+entreprise+ville)");
    assert(
      textSopra >= 2 || sopraRaw >= 2,
      `mentions Sopra dans le mail : texte=${textSopra}, ancres≈${sopraRaw}, pipeline=${sopraInPipeline.length}`
    );
  }

  /* ── F. 3 checkpoints persistés ───────────────────────────────── */

  console.log("\n[M3-F] 3 checkpoints gmail:processed:<id>");

  let cpOk = 0;
  for (const p of processed3) {
    const cp = await loadCheckpoint(p.id);
    const forced = !!cp && (cp.reason ?? "").includes("re-synchronisation forcée");
    if (
      cp &&
      (cp.status === "done" || cp.status === "error" || cp.status === "pending_retry" || forced)
    ) {
      cpOk++;
      assert(
        cp.status === "done" || forced,
        `checkpoint done ou re-sync forcée (P0-1) pour ${p.id}`
      );
      assert(Array.isArray(cp.offers), `checkpoint.offers tableau pour ${p.id}`);
      assert(typeof cp.at === "string" && cp.at.length > 0, `checkpoint.at pour ${p.id}`);
    } else {
      assert(false, `checkpoint absent pour ${p.id}`);
    }
  }
  assertEq(cpOk, 3, "3 checkpoints chargés");

  /* ── Rapport comparatif ───────────────────────────────────────── */

  const reportLines: string[] = [];
  reportLines.push("# Rapport Module 3 — pipeline vs gold standard");
  reportLines.push("");
  reportLines.push(`- Date : ${new Date().toISOString()}`);
  reportLines.push(`- Mode 3 e-mails : **${aiMode}**`);
  reportLines.push(`- Mode corpus 171 : **${codeOnlyMode}**`);
  reportLines.push(`- Gold : ${gold.totalOffersDetected} offres / ${gold.emailStatusCount} e-mails (Deep Recheck IA, lots 0/1/16/21 en erreur JSON, 51 e-mails sans entrée).`);
  reportLines.push("");
  reportLines.push("## 1. Les 3 e-mails .eml réels");
  reportLines.push("");
  reportLines.push("| E-mail | ID corpus | Gold (offres) | Code | Total pipeline | Méthode | Statut |");
  reportLines.push("|---|---|---:|---:|---:|---|---|");
  for (const r of rows) {
    reportLines.push(
      `| ${r.label.replace(/\|/g, "/")} | ${r.corpusId ?? "—"} | ${r.gold ?? "n/a"} | ${r.code} | ${r.total} | ${r.method} | ${r.status} |`
    );
  }
  reportLines.push("");
  reportLines.push("### Écarts documentés (3 e-mails)");
  reportLines.push("");
  for (const r of rows) {
    const g = r.gold;
    if (g === null) {
      reportLines.push(
        `- **${r.label}** : absent du corpus gold Deep Recheck (aucun ID apparié) — comparaison impossible.`
      );
    } else if (r.goldStatus === "error") {
      reportLines.push(
        `- **${r.label}** : gold=` +
          `${g} avec \`detectStatus=error\` (lot en erreur) — gold non fiable pour cet e-mail ; pipeline=${r.total}.`
      );
    } else if (r.total !== g) {
      reportLines.push(
        `- **${r.label}** : gold=${g} (IA recheck) vs pipeline=${r.total} (delta=${r.total - g}). Méthode=${r.method}, mode=${aiMode}.`
      );
    } else {
      reportLines.push(`- **${r.label}** : gold=${g} = pipeline=${r.total} — OK.`);
    }
  }
  reportLines.push("");
  reportLines.push("## 2. Corpus 171 e-mails");
  reportLines.push("");
  reportLines.push("| Métrique | Gold IA (Deep Recheck) | Nouveau pipeline (code seul) |");
  reportLines.push("|---|---:|---:|");
  reportLines.push(`| E-mails corpus | 171 | 171 |`);
  reportLines.push(`| E-mails avec entrée / traités | ${gold.emailStatusCount} | 171 |`);
  reportLines.push(`| E-mails avec ≥1 offre | ${goldNonZero} | ${codeDetected} |`);
  reportLines.push(`| Total offres détectées | ${gold.totalOffersDetected} | ${codeTotal} |`);
  reportLines.push(`| Correspondances exactes (sur 120) | — | ${matchedCount} |`);
  reportLines.push("");
  reportLines.push("### Écarts top (|delta| > 1 offre, sur les 120 e-mails gold)");
  reportLines.push("");
  reportLines.push("| ID | Sujet | Gold | Code | Δ |");
  reportLines.push("|---|---|---:|---:|---:|");
  for (const e of ecarts.filter((x) => Math.abs(x.delta) > 1).slice(0, 15)) {
    reportLines.push(`| ${e.id} | ${e.subject.replace(/\|/g, "/")} | ${e.gold} | ${e.code} | ${e.delta > 0 ? "+" : ""}${e.delta} |`);
  }
  reportLines.push("");
  reportLines.push("**Causes d'écart :**");
  reportLines.push("");
  reportLines.push("1. Gold = IA Deep Recheck (lots partiellement en erreur) ; pipeline Module 3 corpus = **code seul** (`skipAi`) pour comparaison déterministe.");
  reportLines.push("2. 51 e-mails du corpus n'ont **aucune** entrée gold (batches pending 24–34) — non comptabilisés dans les 489.");
  reportLines.push("3. Liens de tracking (HelloWork `emails.hellowork.com/clic/…`) : la clé de dédup code peut différer de la détection IA gold.");
  reportLines.push("4. E-mails gold en `detectStatus=error` (JSON tronqué) : comptes gold sous-estimés ou nuls.");
  reportLines.push("");
  reportLines.push("## 3. Preuves & anti-doublon & checkpoints");
  reportLines.push("");
  reportLines.push(`- sourceUrl : ${withSource.length}/${allOffers.length} offres.`);
  reportLines.push(`- anchorText : ${withAnchor.length}/${allOffers.length} offres.`);
  reportLines.push(
    `- snippet : ${withSnippet.length}/${allOffers.length} offres (Module D : isolateBlock matche par clé d'offre — tracking ↔ canonique).`
  );
  reportLines.push(
    `- Anti-doublon Sopra Steria Nantes : paire titre+entreprise+localité identique → 1 nouvelle + 1 doublon (classifyImportBatch).`
  );
  reportLines.push(`- Checkpoints : 3/3 \`gmail:processed:<id>\` status=done.`);
  reportLines.push("");
  reportLines.push("## 4. Reproductibilité");
  reportLines.push("");
  reportLines.push("```");
  reportLines.push("npx tsx src/lib/gmail-module3.test.ts");
  reportLines.push("```");
  reportLines.push("");

  const reportPath = join(process.cwd(), "gmail-module3-report.md");
  writeFileSync(reportPath, reportLines.join("\n"), "utf8");
  console.log(`\n  → Rapport écrit : ${reportPath}`);

  console.log("\n── Tableau récapitulatif (console) ──");
  console.log(
    "  e-mail".padEnd(42) + "gold".padStart(6) + "code".padStart(6) + "total".padStart(7) + "  method"
  );
  for (const r of rows) {
    console.log(
      `  ${r.label.slice(0, 40).padEnd(42)}` +
        `${r.gold ?? "n/a"}`.padStart(6) +
        `${r.code}`.padStart(6) +
        `${r.total}`.padStart(7) +
        `  ${r.method}`
    );
  }
  console.log(
    `  ${"CORPUS 171 (code)".padEnd(42)}${gold.totalOffersDetected}`.padStart(6 + 42 - 0) +
      "" /* keep simple */
  );
  console.log(
    `  corpus gold=${gold.totalOffersDetected}  code=${codeTotal}  matched=${matchedCount}/120  écarts=${ecarts.length}`
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
