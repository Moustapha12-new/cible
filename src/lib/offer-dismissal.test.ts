import assert from "node:assert/strict";
import { isOfferDismissed, offerDismissalKeys } from "./offer-dismissal";

const first = { id: "gmail-1", title: "Stage réseaux", company: "RTE", location: "Lille", url: "https://example.org/jobs/123?utm_source=email&job=123" };
const again = { ...first, id: "sync-2", url: "https://example.org/jobs/123?job=123" };
const distinct = { ...first, id: "sync-3", url: "https://example.org/jobs/456?job=456" };
const dismissed = offerDismissalKeys(first);
assert.ok(isOfferDismissed(again, dismissed), "la même annonce reste supprimée après une synchronisation");
assert.equal(isOfferDismissed(distinct, dismissed), false, "une annonce distincte reste visible");
assert.ok(isOfferDismissed({ id: "x", title: "Stage", company: "EDF", location: "Paris" }, offerDismissalKeys({ id: "y", title: "Stage", company: "EDF", location: "Paris" })));
process.stdout.write("offer-dismissal: suppression durable sans fusion d'annonces distinctes passed\n");
