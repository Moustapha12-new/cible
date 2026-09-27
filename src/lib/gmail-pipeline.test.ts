/* Tests gmail-parser + gmail-offer-detector — URLs réelles uniquement. */
import { parseMessage } from "./gmail-parser";
import { detectOffersInEmail } from "./gmail-offer-detector";

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

// ── parseMessage ──────────────────────────────────────────────
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

const htmlBody = `<html><body>
<p>Offres stage Paris :</p>
<a href="https://www.linkedin.com/jobs/view/1234567890/">Dev Backend</a>
<a href="https://www.hellowork.com/fr/fr/job-offre/99999-stagiaire.html">Stagiaire Front</a>
<a href="https://example.com/unsubscribe">unsubscribe</a>
</body></html>`;

const msgFull = {
  id: "msg1",
  internalDate: "1725000000000",
  payload: {
    mimeType: "multipart/alternative",
    headers: [
      { name: "From", value: "alertes@linkedin.com" },
      { name: "To", value: "moustaled.53@gmail.com" },
      { name: "Subject", value: "Nouvelles offres de stage" },
      { name: "Date", value: "Mon, 01 Jan 2026 10:00:00 +0000" },
      { name: "Message-Id", value: "<abc@test>" },
    ],
    parts: [
      {
        mimeType: "text/plain",
        body: { data: b64("Offres stage Paris\nhttps://www.linkedin.com/jobs/view/1234567890/") },
      },
      { mimeType: "text/html", body: { data: b64(htmlBody) } },
    ],
  },
};

const parsed = parseMessage(msgFull);
assert(parsed.subject === "Nouvelles offres de stage", "subject");
assert(parsed.from.includes("linkedin.com"), "from");
assert(parsed.bodyHtml.includes("linkedin.com"), "html body");
assert(parsed.bodyPlain.includes("Offres stage"), "plain body");
assert(parsed.links.some((l) => l.includes("linkedin.com/jobs/view/1234567890")), "link linkedin");
assert(parsed.headers["message-id"] === "<abc@test>", "message-id");
assert(parsed.attachments.length === 0, "no attachments");

// ── detectOffersInEmail ──────────────────────────────────────
const det = detectOffersInEmail(parsed);
assert(!det.isNoOffer, "offers detected");
assert(det.offers.length >= 1, `at least 1 offer, got ${det.offers.length}`);
assert(det.reason.startsWith("detected_"), `reason ${det.reason}`);
for (const o of det.offers) {
  assert(/^https:\/\//.test(o.url || ""), `real url ${o.url}`);
  assert(!(o.url || "").includes("unsubscribe"), "no unsubscribe url");
  assert(o.title.length > 0, "title present");
}
const urls = det.offers.map((o) => o.url);
assert(new Set(urls).size === urls.length, "no duplicate urls");

// ── email sans offre ─────────────────────────────────────────
const noOfferMsg = {
  id: "msg2",
  payload: {
    mimeType: "text/plain",
    headers: [{ name: "Subject", value: "Newsletter" }],
    body: { data: b64("Bienvenue dans notre newsletter mensuelle.") },
  },
};
const detNone = detectOffersInEmail(parseMessage(noOfferMsg));
assert(detNone.isNoOffer, "isNoOffer");
assert(detNone.offers.length === 0, "zero offers");
assert(detNone.reason === "NO_OFFER", "NO_OFFER reason");

// ── multi-offre : 2 liens plateformes → 2 offres distinctes ──
assert(det.offers.length >= 2, `multi-offer expected >=2, got ${det.offers.length}`);

// ── URL jamais inventée ──────────────────────────────────────
const noLink = {
  id: "msg3",
  payload: {
    mimeType: "text/plain",
    headers: [{ name: "Subject", value: "Stage dispo" }],
    body: { data: b64("Nous recrutons un stagiaire stage à Paris chez ACME.") },
  },
};
const detText = detectOffersInEmail(parseMessage(noLink));
for (const o of detText.offers) {
  const inMail =
    (parsed.links || []).includes(o.url || "") ||
    (parseMessage(noLink).links || []).includes(o.url || "");
  assert(inMail, `url must exist in email: ${o.url}`);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
