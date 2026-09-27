/* Tests P0-1 — réparation d'encodage (entités numériques + mojibake latin1).
   Exécution : npx tsx src/lib/text-repair.test.ts */
import {
  entityChar,
  decodeNumericEntities,
  looksMojibake,
  repairMojibake,
  repairText,
  isCorruptText,
  repairCheckpoint,
} from "./text-repair";

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${msg}`);
  } else {
    fail++;
    console.error(`  ✗ ${msg}`);
  }
}
function assertEq(actual: unknown, expected: unknown, msg: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`  ✓ ${msg}`);
  } else {
    fail++;
    console.error(
      `  ✗ ${msg}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
}

/* ── entityChar / decodeNumericEntities ─────────────────────────── */
assertEq(entityChar(233), "é", "entityChar(233) → é");
assertEq(entityChar(0xe9), "é", "entityChar(0xE9) → é");
assertEq(entityChar(160), "\u00a0", "entityChar(160) → nbsp");
assertEq(entityChar(0), "", "entityChar(0) → suppression (invalide)");
assertEq(entityChar(0x110000), "", "entityChar hors plage → suppression");
assertEq(entityChar(NaN), "", "entityChar(NaN) → suppression");

assertEq(decodeNumericEntities("Ing&#233;nieur"), "Ingénieur", "entière décimale décodée");
assertEq(decodeNumericEntities("Ing&#xE9;nieur"), "Ingénieur", "entière hexadécimale décodée");
assertEq(decodeNumericEntities("Ing&#Xe9;nieur"), "Ingénieur", "hexa majuscule (X) décodée");
assertEq(decodeNumericEntities("a&#38;b"), "a&b", "&#38; → &");
assertEq(decodeNumericEntities("sans entité"), "sans entité", "texte intact sans entité");
assertEq(decodeNumericEntities(""), "", "vide intact");
assertEq(
  decodeNumericEntities("texte &#9999999999; fin"),
  "texte  fin",
  "entière hors plage supprimée, pas laissée littérale"
);
/* &amp; doit être traité APRÈS : « &amp;#233; » = littéral « &#233; ». */
assertEq(
  decodeNumericEntities("x &amp;#233; y").replace(/&amp;/g, "&"),
  "x &#233; y",
  "entière après &amp; non ré-interprétée (ordre)"
);

/* ── mojibake : UTF-8 décodé en latin1 ──────────────────────────── */
const mojibake = Buffer.from("Développez votre réseau — café", "utf8").toString("latin1");
assert(
  mojibake !== "Développez votre réseau — café",
  "fixture bien corrompue (différente de l'original)"
);
assert(looksMojibake(mojibake), "looksMojibake détecte la fixture");
assert(!looksMojibake("Développez votre réseau — café"), "pas de faux positif sur du propre");
assert(!looksMojibake("Stage dev React Paris"), "ASCII pur non détecté");
assertEq(
  repairMojibake(mojibake),
  "Développez votre réseau — café",
  "repairMojibake restaure UTF-8"
);
assertEq(repairMojibake("texte propre"), "texte propre", "réparation sans-opération sur du propre");
assertEq(
  repairText("DÃ©veloppeur &#xE9;tage"),
  "Développeur étage",
  "repairText enchaîne mojibake + entités"
);

/* Irréparable : U+FFFD = octets d'origine perdus. */
const broken = "Stag\uFFFD\uFFFD dev";
assert(isCorruptText(broken), "U+FFFD → corrupt (irréparable)");
assert(!isCorruptText("Stage dev à Paris"), "texte sain non corrupt");
assert(isCorruptText(mojibake) === false, "mojibake réparable n'est pas « corrupt »");
assert(isCorruptText("stages þ en double"), "artefact þ → corrupt (re-sync forcée)");
assert(isCorruptText("stages ý en double"), "artefact ý → corrupt (re-sync forcée)");

/* Mélange propre + corrompu : réparation par segments (le propre reste propre). */
const mixed = `caf${Buffer.from("é", "utf8").toString("latin1")} et ${"é"}`;
assert(looksMojibake(mixed), "mélange détecté");
assertEq(repairMojibake(mixed), "café et é", "mélange réparé par segments");
assert(!isCorruptText(mixed), "mélange latin1/propre réparable → non corrupt");

/* Octets orphelins (patterns réels des checkpoints) : repli sans U+FFFD. */
assertEq(
  repairMojibake("Zeplug Â· Paris 2Â anciens Ã©lÃ¨ves"),
  "Zeplug · Paris 2 anciens élèves",
  "nbsp perdue (Â espace) supprimée, mojibake réparé"
);
assertEq(
  repairMojibake("dÃ©veloppement de l'âge"),
  "développement de l'âge",
  "â suivi d'une lettre ASCII conservé (pas de perte)"
);
assertEq(
  repairMojibake("© 2026 trÃ¨s bien"),
  "© 2026 très bien",
  "© orphelin conservé"
);
assertEq(
  repairMojibake("trÃ¨s\u0082 bien"),
  "très bien",
  "contrôle latin1 orphelin supprimé"
);
assertEq(
  repairMojibake("jkÉ0514 ElÃ©ctricitÃ©"),
  "jkÉ0514 Eléctricité",
  "É de URL conservé, mojibake réparé"
);
assert(!isCorruptText("musique é©"), "paire legitime é© non signalée corrupt");
assertEq(repairMojibake("musique é©"), "musique é©", "paire legitime é© non altérée");

/* ── repairCheckpoint (récursif) ────────────────────────────────── */
const cp = {
  status: "done" as const,
  subject: `Alerte ${Buffer.from("développement", "utf8").toString("latin1")}`,
  offers: [
    {
      title: "Ing&#xE9;nieur d'études",
      company: "ACME",
      skills: ["Java", Buffer.from("réseaux", "utf8").toString("latin1")],
      nested: { description: "Caf&#233; r&#xE9;gion" },
    },
  ],
  retries: 0,
};
const { value: repaired, corrupted } = repairCheckpoint(cp);
assert(!corrupted, "checkpoint réparable → corrupted=false");
assertEq(repaired.subject, "Alerte développement", "subject réparé");
assertEq(repaired.offers[0].title, "Ingénieur d'études", "entière hexa de l'offre réparée");
assertEq(repaired.offers[0].skills[1], "réseaux", "skill mojibake réparé");
assertEq(repaired.offers[0].nested.description, "Café région", "champ imbriqué réparé");
assertEq(repaired.status, "done", "status non altéré");
assertEq(repaired.retries, 0, "nombres non altérés");

const brokenCp = { status: "done" as const, subject: "Objet \uFFFD\uFFFD illisible", offers: [] };
const res2 = repairCheckpoint(brokenCp);
assert(res2.corrupted, "U+FFFD → corrupted=true (force re-sync)");
assertEq(res2.value.status, "done", "repairCheckpoint ne change pas le statut lui-même");

/* ── compte ─────────────────────────────────────────────────────── */
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
