import assert from "node:assert/strict";
import { GET as userDataGet, POST as userDataPost } from "../app/api/user-data/route";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { authorizeApi, cookieOptions, SESSION_COOKIE } from "./auth-server";
import { GET as dashboard } from "../app/api/gmail/dashboard/route";
import { GET as status } from "../app/api/gmail/status/route";
import { GET as progress } from "../app/api/gmail/progress/route";
import { GET as detail } from "../app/api/gmail/offer-detail/route";
import { GET as oauth } from "../app/api/gmail/auth/route";
import { GET as callback } from "../app/api/gmail/callback/route";
import { POST as sync } from "../app/api/gmail/sync/route";
import { POST as enrich } from "../app/api/gmail/enrich/route";
import { POST as recheck } from "../app/api/gmail/deep-recheck/route";
import { DELETE as disconnect } from "../app/api/gmail/disconnect/route";
import { POST as ai } from "../app/api/ai/route";
import { POST as scrape } from "../app/api/scrape/route";
import { GET as jobs } from "../app/api/jobs/route";
import { GET as confirm } from "../app/api/auth/confirm/route";
import { POST as login } from "../app/api/auth/login/route";
import { withGmailAccount } from "./gmail-account";
import { beginCheckpointCache, endCheckpointCache, checkpointKey, loadCheckpoint } from "./gmail-core";
import { enrichCacheKey } from "./gmail-enrich";
import { humanizeGmailError } from "./gmail-dashboard";

const origin = "http://localhost:3981";
const storage = new Map<string, string>();
const calls: string[] = [];
let quotaAvailable = true;
let quotaAllowed = true;
let authAvailable = true;
process.env.SUPABASE_URL = "https://auth-fixture.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_testfixture";
process.env.SUPABASE_SECRET_KEY = "sb_secret_testfixture";
process.env.GMAIL_STORAGE_PROVIDER = "supabase";
const request = (path: string, method = "GET", token = "", body?: object, customOrigin = origin) => new NextRequest(origin + path, {
  method, headers: { origin: customOrigin, ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}), "Content-Type": "application/json" },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith("https://auth-fixture.invalid/")) throw new Error("Unexpected external request blocked by security test");
  calls.push(url);
  if (url.includes("/auth/v1/token?") || url.endsWith("/auth/v1/verify")) return Response.json({ access_token: "alice", refresh_token: "refresh-fixture", expires_in: 3600, token_type: "bearer", user: { id: "alice-id", email: "alice@example.test", email_confirmed_at: "2026-01-01", user_metadata: {} } });
  if (url.includes("/auth/v1/logout?")) return new Response(null, { status: 204 });
  if (url.endsWith("/auth/v1/user")) {
    if (!authAvailable) return Response.json({ msg: "Provider unavailable" }, { status: 503 });
    const header = new Headers(init?.headers).get("authorization");
    if (header !== "Bearer alice" && header !== "Bearer unconfirmed") return Response.json({ msg: "Invalid token" }, { status: 401 });
    return Response.json({ id: "alice-id", email: "alice@example.test", email_confirmed_at: header === "Bearer alice" ? "2026-01-01" : null, user_metadata: { name: "Alice" }, identities: [] });
  }
  if (url.includes("/rest/v1/rpc/cible_take_quota")) return quotaAvailable ? Response.json(quotaAllowed) : Response.json({ message: "RPC missing" }, { status: 404 });
  if (url.includes("/storage/v1/object/")) {
    if (init?.method === "DELETE") return Response.json({});
    const key = url.split("/storage/v1/object/cible-gmail-storage/gmail/")[1];
    return storage.has(key) ? new Response(storage.get(key)) : Response.json({ message: "Object not found" }, { status: 404 });
  }
  throw new Error("Unexpected fixture endpoint");
};

async function main() {
  const routes: [string, string, (req: NextRequest) => Promise<Response>][] = [
    ["/api/gmail/dashboard", "GET", dashboard], ["/api/gmail/status", "GET", status],
    ["/api/gmail/progress", "GET", progress], ["/api/gmail/offer-detail?id=foreign", "GET", detail],
    ["/api/gmail/auth", "GET", oauth], ["/api/gmail/sync", "POST", sync],
    ["/api/gmail/enrich", "POST", enrich], ["/api/gmail/deep-recheck", "POST", recheck],
    ["/api/gmail/disconnect", "DELETE", disconnect], ["/api/ai", "POST", ai],
    ["/api/scrape", "POST", scrape], ["/api/jobs", "GET", jobs],
    ["/api/user-data", "GET", userDataGet], ["/api/user-data", "POST", userDataPost],
  ];
  for (const [path, method, handler] of routes) {
    assert.equal((await handler(request(path, method, "", method === "POST" ? {} : undefined))).status, 401, `anonymous ${path}`);
  }
  assert.equal(calls.length, 0, "anonymous requests never reach a provider or storage");
  assert.equal((await authorizeApi(request("/api/gmail/status", "GET", "forged"))).response?.status, 401);
  assert.equal((await authorizeApi(request("/api/gmail/status", "GET", "unconfirmed"))).response?.status, 401);
  authAvailable = false;
  assert.equal((await authorizeApi(request("/api/gmail/status", "GET", "alice"))).response?.status, 503, "provider outage is not reported as expired credentials");
  authAvailable = true;
  for (const [path, method, handler] of routes) {
    const separator = path.includes("?") ? "&" : "?";
    assert.equal((await handler(request(`${path}${separator}email=bob@example.test`, method, "alice", method === "POST" ? {} : undefined))).status, 403, `cross-account ${path}`);
  }
  assert.equal((await sync(request("/api/gmail/sync", "POST", "alice", { email: "bob@example.test" }))).status, 403);
  assert.equal((await authorizeApi(request("/api/ai", "POST", "alice", {}, "https://foreign.invalid"))).response?.status, 403);
  assert.equal((await detail(request("/api/gmail/offer-detail?id=foreign", "GET", "alice"))).status, 403);
  assert.ok(!calls.some(url => url.includes("processed:foreign")), "foreign checkpoint is never read");
  quotaAvailable = false;
  const unavailable = await ai(request("/api/ai", "POST", "alice", { task: "letter" }));
  assert.equal(unavailable.status, 503, "missing shared quota fails closed");
  const unavailableBody = await unavailable.json();
  assert.match(unavailableBody.error, /Protection des quotas indisponible/);
  assert.match(humanizeGmailError(new Error(unavailableBody.error)).human, /Protection des quotas indisponible/);
  quotaAvailable = true; quotaAllowed = false;
  assert.equal((await ai(request("/api/ai", "POST", "alice", { task: "letter" }))).status, 429);
  assert.match(humanizeGmailError(new Error("HTTP 429")).human, /Limite de requêtes atteinte/);
  quotaAllowed = true;
  const own = await authorizeApi(request("/api/gmail/progress", "GET", "alice"));
  assert.equal(own.user?.email, "alice@example.test");
  const result = await disconnect(request("/api/gmail/disconnect", "DELETE", "alice"));
  assert.equal(result.status, 200, "empty DELETE uses session owner");
  assert.ok(!calls.some(url => url.includes("moustaled") || url.includes("bob@example")), "no default or foreign account read");
  const deniedCallback = await callback(request("/api/gmail/callback?code=fake&state=wrong", "GET", "alice"));
  assert.match(deniedCallback.headers.get("location") || "", /error/);
  assert.equal(cookieOptions(3600).httpOnly, true);
  assert.equal(cookieOptions(3600).sameSite, "lax");
  const emailConfirmation = await confirm(request("/api/auth/confirm?type=email&token_hash=" + "a".repeat(64)));
  assert.match(emailConfirmation.headers.get("location") || "", /confirmation=ok/);
  assert.equal(emailConfirmation.headers.get("set-cookie"), null, "forwarded confirmation link cannot log a browser into another account");
  const signedIn = await login(request("/api/auth/login", "POST", "", { email: "alice@example.test", password: "fixture-password" }));
  assert.equal(signedIn.status, 200);
  assert.match(signedIn.headers.get("set-cookie") || "", /HttpOnly/);
  assert.ok(!JSON.stringify(await signedIn.json()).includes("refresh-fixture"), "session credentials never appear in JSON");
  await Promise.all(["alice@example.test", "bob@example.test"].map(email => withGmailAccount(email, async () => {
    beginCheckpointCache();
    try {
      const key = checkpointKey("same-id");
      assert.ok(key.includes(createHash("sha256").update(email).digest("hex")), "checkpoint namespaced by verified account");
      storage.set(key, JSON.stringify({ status: "done", offers: [], retries: 0, reason: email }));
      await new Promise(resolve => setTimeout(resolve, email.startsWith("alice") ? 10 : 2));
      const cp = await loadCheckpoint("same-id");
      assert.equal(cp?.reason, email, "concurrent requests cannot share checkpoint data or cache");
    } finally { endCheckpointCache(); }
  })));
  const aliceCache = withGmailAccount("alice@example.test", () => enrichCacheKey("https://job.invalid/one"));
  const bobCache = withGmailAccount("bob@example.test", () => enrichCacheKey("https://job.invalid/one"));
  assert.notEqual(aliceCache, bobCache, "enrichment caches cannot share personal email-derived data");
  console.log("Security batch: anonymous access on 12 endpoints, 12 cross-account checks, forged/unconfirmed session, CSRF, checkpoint ownership, OAuth state and quota failures passed. No external access.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
