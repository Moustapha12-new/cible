/* Jalon A — tests d'extraction multi-offres sur les fixtures fournies.
   Prouve Indeed 8/8, LinkedIn 10/10, HelloWork 8/8 (26/26) SANS faux positif,
   en comparant chaque offre aux identités attendues (docs/freebuff/fixtures). */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEmlFile, parseEml } from "./gmail-eml";
import { extractOffersFromEmail, normKey } from "./offer-extract";

type Expected = {
  sourceId?: string;
  title: string;
  company?: string;
  location?: string;
  match: "provider_id" | "title_company_location";
};

function loadExpected(): { expected: Record<string, Expected[]>; total: number } {
  const raw = readFileSync(
    join(process.cwd(), "docs", "freebuff", "fixtures", "attendus_offres.json"),
    "utf8"
  );
  const j = JSON.parse(raw) as {
    expected: Record<string, Expected[]>;
    expectedDistinctTotal: number;
  };
  return { expected: j.expected, total: j.expectedDistinctTotal };
}

function emlPath(file: string): string {
  return join(process.cwd(), "docs", "freebuff", "fixtures", file);
}

async function main() {
  const { expected, total } = loadExpected();
  const rows: {
    source: string;
    cards: number;
    expected: number;
    extracted: number;
    falsePositives: number;
  }[] = [];

  const cases: { key: string; file: string }[] = [
    { key: "indeed", file: "indeed_anonymise.eml" },
    { key: "linkedin", file: "linkedin_anonymise.eml" },
    { key: "hellowork", file: "hellowork_anonymise.eml" },
  ];

  let grandTruePositives = 0;

  for (const { key, file } of cases) {
    const email = loadEmlFile(emlPath(file), file);
    const result = extractOffersFromEmail(email);
    const exp = expected[key];
    assert.ok(Array.isArray(exp) && exp.length > 0, `${key}: attendus présents`);

    // Vérification d'identité : chaque attendu doit être trouvé.
    let matched = 0;
    const foundIds = new Set(result.offers.map((o) => o.id));
    const foundSourceIds = new Set(result.offers.map((o) => o.sourceJobId).filter(Boolean));
    const foundTcl = new Set(
      result.offers.map((o) => `${normKey(o.title)}|${normKey(o.company)}|${normKey(o.location)}`)
    );

    for (const e of exp) {
      let hit = false;
      if (e.match === "provider_id" && e.sourceId) {
        hit = foundSourceIds.has(e.sourceId);
      } else {
        const keyTcl = `${normKey(e.title)}|${normKey(e.company || "")}|${normKey(e.location || "")}`;
        hit = foundTcl.has(keyTcl);
      }
      if (hit) matched += 1;
    }

    const extracted = result.offers.length;
    const falsePositives = extracted - matched;
    grandTruePositives += matched;

    rows.push({
      source: key,
      cards: result.diagnostics.offerAnchors,
      expected: exp.length,
      extracted,
      falsePositives,
    });

    // 1) Nombre exact d'offres distinctes.
    assert.equal(
      extracted,
      exp.length,
      `${key}: ${exp.length} offres attendues, ${extracted} extraites — ids=${[...foundIds].join(",")}`
    );
    // 2) Rappel : chaque identité attendue retrouvée.
    assert.equal(matched, exp.length, `${key}: ${matched}/${exp.length} identités appariées`);
    // 3) Zéro faux positif (extracted == matched).
    assert.equal(falsePositives, 0, `${key}: ${falsePositives} faux positif(s)`);

    // ── Cas négatifs spécifiques ──
    if (key === "linkedin") {
      // Pas de WSP ajouté depuis l'objet (jobId contextuel exclu).
      const titles = result.offers.map((o) => o.title).join(" ");
      assert.ok(!/WSP/i.test(titles), "linkedin: aucune offre WSP fabriquée depuis l'objet");
      assert.ok(!foundSourceIds.has("4476307830"), "linkedin: jobId WSP (h1) exclu des cartes");
      // Les deux VINCI aux jobId distincts sont conservées.
      assert.ok(foundSourceIds.has("4446854590"), "linkedin: VINCI jobId 1 conservé");
      assert.ok(foundSourceIds.has("4447004092"), "linkedin: VINCI jobId 2 conservé");
      // 3 ancres par jobId fusionnées (pas 30 cartes).
      assert.equal(result.offers.length, 10, "linkedin: 3 ancres/carte fusionnées");
    }
    if (key === "hellowork") {
      // Les cartes FAYAT mises en avant répétées ne doublent pas.
      const fayat = result.offers.filter((o) => /FAYAT/i.test(o.company));
      assert.equal(fayat.length, 2, "hellowork: 2 offres FAYAT distinctes (Aulnay + Viry)");
      // Eiffage dans deux villes distinctes reste distinct.
      const eiffage = result.offers.filter((o) => /Eiffage/i.test(o.company));
      assert.equal(eiffage.length, 3, "hellowork: 3 offres Eiffage (Joué, La Chapelle, Orléans)");
      // Aucun lien social/footer importé (toutes les offres ont un titre propre).
      for (const o of result.offers) assert.ok(o.title.length > 3, "hellowork: titre propre");
    }
    if (key === "indeed") {
      // Aucune offre de footer/recherche : 8 jk uniques.
      assert.equal(result.offers.length, 8, "indeed: 8 jk uniques");
      for (const o of result.offers) {
        assert.ok(o.sourceJobId && /^[0-9a-f]{16}$/.test(o.sourceJobId), "indeed: jk valide");
        assert.ok(
          (o.canonicalUrl || "").includes("viewjob?jk="),
          "indeed: URL canonique viewjob"
        );
      }
    }
  }

  // Total 26/26.
  assert.equal(grandTruePositives, total, `total: ${grandTruePositives}/${total} identités`);

  /* ── Robustesse MIME (03_TESTS §A.4) ──────────────────────────────
     Un multipart/alternative encodé quoted-printable avec accents UTF-8
     doit extraire les offres sans perte ; une erreur conserve l'ID et le
     contexte sans faire disparaître les annonces. */
  // Vrai quoted-printable : le '=' littéral est encodé '=3D', les accents en
  // UTF-8 ('=C3=A9' = é, '=C3=89' = É). C'est le format réel des alertes.
  const qpOffer =
    '<a href=3D"https://fr.indeed.com/viewjob?jk=3D1a2cb258a85268e1">Stage Assistant ing=C3=A9nier =C3=89tudes H/F</a>';
  const qpSecond =
    '<a href=3D"https://fr.indeed.com/viewjob?jk=3D8bbcbc3ae0364f0c">Stage Hydraulique Urbaine H/F</a>';
  const emlQP = [
    "From: alerts@indeed.example.invalid",
    "Subject: Alertes stages =?utf-8?b?w6lyb2Jlcz8=?=",
    "MIME-Version: 1.0",
    'Content-Type: multipart/alternative; boundary="BOUND"',
    "",
    "--BOUND",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    "Fixture UTF-8.",
    "--BOUND",
    'Content-Type: text/html; charset="utf-8"',
    "Content-Transfer-Encoding: quoted-printable",
    "",
    `<html><body>${qpOffer}${qpSecond}</body></html>`,
    "--BOUND--",
    "",
  ].join("\r\n");
  const qpEmail = parseEml(emlQP, "qp-fixture");
  assert.equal(qpEmail.id, "qp-fixture", "MIME: message-id/ID de repli conservé");
  assert.ok(/Études/.test(qpEmail.html), "MIME: accents UTF-8 décodés dans le HTML (Ingénieur Études)");
  const qpResult = extractOffersFromEmail(qpEmail);
  assert.equal(qpResult.offers.length, 2, "MIME: 2 offres extraites d'un multipart quoted-printable");
  assert.ok(
    qpResult.offers.some((o) => /Études/.test(o.title)),
    "MIME: titre accentué préservé après décodage"
  );
  // Un e-mail sans HTML (texte seul) ne doit pas lever : il rend 0 offre, sans crash.
  const confirmation = extractOffersFromEmail({ id: "confirmation-hw", from: "HelloWork <info@hellowork.com>", subject: "Votre candidature est enregistrée", html: `<table><tr><td>Hello Moustapha ! Votre candidature est enregistrée pour EPI.</td></tr><tr><td><a href="https://emails.hellowork.com/clic/example/4/company">Tout savoir sur l'entreprise</a></td></tr></table>` });
  assert.equal(confirmation.offers.length, 0, "un lien entreprise dans une confirmation de candidature n'est pas une offre");

  const textOnly = extractOffersFromEmail({ id: "txt", from: "x@y.z", subject: "alerte", html: "" });
  assert.equal(textOnly.offers.length, 0, "MIME: e-mail sans HTML → 0 offre, pas d'erreur");
  // Un HTML corrompu/garbage ne doit pas crasher (tolérance d'erreur).
  const garbage = extractOffersFromEmail({
    id: "bad",
    from: "alerts@indeed.example.invalid",
    subject: "corrompu",
    html: "<<<garbage >>> & &amp; <a href=\"broken\">x</a> <a href=\"https://fr.indeed.com/viewjob?jk=8bbcbc3ae0364f0c\">Stage</a>",
  });
  assert.ok(garbage.offers.length >= 1, "MIME: HTML partiellement corrompu → offre valide conservée");

  // Table d'acceptation demandée par 03_TESTS_ET_CRITERES.md.
  console.log("\nsource    | cartes | attendues | extraites | faux positifs");
  console.log("----------|--------|-----------|-----------|---------------");
  for (const r of rows) {
    console.log(
      `${r.source.padEnd(9)} | ${String(r.cards).padStart(6)} | ${String(r.expected).padStart(9)} | ${String(r.extracted).padStart(9)} | ${String(r.falsePositives).padStart(13)}`
    );
  }
  console.log(`\nRappel = ${grandTruePositives}/${total} · Précision = ${grandTruePositives}/${total} · 0 faux positif.`);
  console.log("Jalon A validé : 8 Indeed + 10 LinkedIn + 8 HelloWork = 26 offres distinctes.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
