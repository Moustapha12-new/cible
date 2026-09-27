/* Tests mime-text — encodage MIME (charset, QP octets, RFC 2047).
   Exécution : npx tsx src/lib/mime-text.test.ts
   Régression P0 : latin1 forcé + double décodage QP (manglings observés
   `v=beta` → `v¾ta`, `Ã©` au lieu de `é`). */
import { parseEml } from "./gmail-eml";
import { parseMessage } from "./gmail-parser";
import {
  charsetFromContentType,
  decodeMimeText,
  decodeQuotedPrintableBytes,
  decodeRfc2047,
} from "./mime-text";

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error("FAIL:", msg);
  }
}
function assertEq(actual: unknown, expected: unknown, msg: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${msg}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

// ── charsetFromContentType ─────────────────────────────────────
assertEq(charsetFromContentType("text/html; charset=UTF-8"), "UTF-8", "charset simple");
assertEq(charsetFromContentType('text/html;charset="windows-1252"'), "windows-1252", "charset quoté");
assertEq(charsetFromContentType("text/html"), null, "sans charset");
assertEq(charsetFromContentType(undefined), null, "undefined");
assertEq(charsetFromContentType("text/plain; charset=iso-8859-1; boundary=x"), "iso-8859-1", "charset + autres params");

// ── decodeMimeText : UTF-8 déclaré ─────────────────────────────
const utf8Bytes = Buffer.from("Développez votre réseau — café école", "utf8");
assertEq(decodeMimeText(utf8Bytes, "UTF-8"), "Développez votre réseau — café école", "UTF-8 déclaré");
assertEq(decodeMimeText(utf8Bytes, null), "Développez votre réseau — café école", "UTF-8 sniffé sans charset");
assertEq(decodeMimeText(utf8Bytes, "utf8"), "Développez votre réseau — café école", "label utf8 variant");
assertEq(decodeMimeText(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("accents é", "utf8")]), "utf-8"), "accents é", "BOM strippé");

// ── decodeMimeText : Windows-1252 ──────────────────────────────
const w1252 = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0x92, 0x21]); // café ’!
assertEq(decodeMimeText(w1252, "windows-1252"), "café ’!", "windows-1252 déclaré");
assertEq(decodeMimeText(w1252, null), "café ’!", "windows-1252 sniffé (octets invalides en UTF-8)");
assertEq(decodeMimeText(Buffer.from([0x63, 0x61, 0x66, 0xe9]), "iso-8859-1"), "café", "iso-8859-1 déclaré");
// UTF-8 déclaré mais octets non-UTF-8 → jamais de U+FFFD silencieux
const invalidUtf8 = decodeMimeText(Buffer.from([0x63, 0x61, 0x66, 0xe9]), "utf-8");
assert(!invalidUtf8.includes("�"), "pas de U+FFFD sur UTF-8 déclaré invalide");
assertEq(invalidUtf8, "café", "repli windows-1252 sur UTF-8 déclaré invalide");
// charset inconnu du moteur → chaîne de repli
assertEq(decodeMimeText(utf8Bytes, "x-charset-inconnu"), "Développez votre réseau — café école", "charset inconnu → repli UTF-8");
assertEq(decodeMimeText(Buffer.alloc(0), "utf-8"), "", "buffer vide");

// ── P0 : AUCUN décodage destructif sur contenu déjà décodé ─────
const alreadyDecoded = Buffer.from("logo?e=1791417600&v=beta&t=fdeJQZFYKy1DvgoWA3Pyb", "latin1");
const kept = decodeMimeText(alreadyDecoded, null);
assertEq(kept, "logo?e=1791417600&v=beta&t=fdeJQZFYKy1DvgoWA3Pyb", "v=beta intact (pas de double QP)");
assert(!/[þý\u0017]/.test(kept), "aucun artefact þ/ý/0x17");
assertEq(decodeMimeText(Buffer.from("width=3Ddevice", "latin1"), null), "width=3Ddevice", "=3D non touché (pas de QP dans decodeMimeText)");
assertEq(decodeMimeText(Buffer.from("Ingénieur systèmes", "utf8"), "UTF-8"), "Ingénieur systèmes", "accents intacts");

// ── decodeQuotedPrintableBytes (fichiers .eml bruts) ───────────
const qp = (s: string) => decodeQuotedPrintableBytes(Buffer.from(s, "latin1")).toString("latin1");
assertEq(qp("width=3Ddevice"), "width=device", "=3D → =");
assertEq(qp("abc=\r\ndef"), "abcdef", "soft break CRLF");
assertEq(qp("abc=\ndef"), "abcdef", "soft break LF");
assertEq(qp("v=3Dbeta"), "v=beta", "escape mailer correct");
assertEq(qp("abc="), "abc=", "égal final conservé");
assertEq(qp("sans escape"), "sans escape", "texte simple inchangé");
assertEq(
  decodeMimeText(decodeQuotedPrintableBytes(Buffer.from("Caf=C3=A9", "latin1")), "utf-8"),
  "Café",
  "QP + charset UTF-8"
);
assertEq(
  decodeMimeText(decodeQuotedPrintableBytes(Buffer.from("caf=E9", "latin1")), "iso-8859-1"),
  "café",
  "QP + charset ISO-8859-1"
);

// ── decodeRfc2047 ──────────────────────────────────────────────
assertEq(decodeRfc2047("=?UTF-8?Q?Caf=C3=A9?= !"), "Café !", "Q UTF-8");
assertEq(decodeRfc2047("=?UTF-8?B?Q2Fmw6k=?="), "Café", "B UTF-8");
assertEq(decodeRfc2047("=?ISO-8859-1?B?Y2Fm6Q==?="), "café", "B ISO-8859-1 (honore _enc)");
assertEq(decodeRfc2047("=?UTF-8?Q?Bonjour_tout_le_monde?="), "Bonjour tout le monde", "Q underscore = espace");
assertEq(decodeRfc2047("=?ISO-8859-1?Q?caf=E9?="), "café", "Q ISO-8859-1");
assertEq(decodeRfc2047("=?X-WEIRD?Q?caf=C3=A9?="), "café", "charset inconnu → repli UTF-8");
assertEq(decodeRfc2047("=?UTF-8?Q?Stage?= chez =?UTF-8?Q?ACME?="), "Stage chez ACME", "mots multiples");
assertEq(decodeRfc2047("Sujet simple sans encodage"), "Sujet simple sans encodage", "pas d'encoded-word → inchangé");
assertEq(decodeRfc2047(""), "", "chaîne vide");

// ── Intégration gmail-parser : charset honoré ──────────────────
const b64 = (s: string, enc: BufferEncoding = "latin1") => Buffer.from(s, enc).toString("base64");
const msgW1252 = {
  id: "p1",
  payload: {
    mimeType: "text/plain",
    headers: [
      { name: "Subject", value: "Alerte stage" },
      { name: "Content-Type", value: "text/plain; charset=windows-1252" },
    ],
    body: { data: b64("Café et résumé") },
  },
};
assertEq(parseMessage(msgW1252).bodyPlain, "Café et résumé", "parser : charset windows-1252");
const msgUtf8 = {
  id: "p2",
  payload: {
    mimeType: "text/plain",
    headers: [
      { name: "Content-Type", value: "text/plain; charset=UTF-8" },
    ],
    body: { data: Buffer.from("École d'ingénieurs — stage", "utf8").toString("base64") },
  },
};
assertEq(parseMessage(msgUtf8).bodyPlain, "École d'ingénieurs — stage", "parser : charset UTF-8");

// ── Intégration gmail-eml : QP brut + charset + RFC 2047 ──────
const eml = [
  "From: alertes@example.com",
  "To: moi@example.com",
  "Subject: =?UTF-8?Q?Nouvelles_offres_=C3=A0_Paris?=",
  "Date: Tue, 22 Sep 2026 10:00:00 +0200",
  "Content-Type: text/plain; charset=UTF-8",
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "D=C3=A9veloppeur web, v=3Dbeta, largeur=3D100%.",
  "",
].join("\r\n");
const parsedEml = parseEml(eml, "eml-test");
assertEq(parsedEml.subject, "Nouvelles offres à Paris", "eml : sujet RFC 2047");
assertEq(parsedEml.text, "Développeur web, v=beta, largeur=100%.", "eml : QP + charset UTF-8");

// ── P0-1 : entités HTML DÉCODÉES (jamais supprimées ni laissées littérales)
const emlEnt = [
  "From: alertes@example.com",
  "Subject: Entités",
  "Content-Type: text/html; charset=UTF-8",
  "",
  "<div>Ing&#xE9;nieur &#233;tage &#160;caf&#233; &amp;#233; clos</div>",
  "",
].join("\r\n");
const pEnt = parseEml(emlEnt, "eml-ent");
assert(pEnt.text.includes("Ingénieur"), "eml : entière hexa décodée (Ingénieur)");
assert(pEnt.text.includes("étage"), "eml : entière décimale décodée (étage)");
assert(pEnt.text.includes("café"), "eml : entière numérique dans le texte (café)");
assert(
  !pEnt.text.includes("&#xE9;") && !pEnt.text.includes("&#233;tage"),
  "eml : plus d'entière laissée littérale"
);
assert(
  pEnt.text.includes("&#233;"),
  "eml : &amp;#233; échappé reste littéral &#233; (amp décodé en dernier)"
);

console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
