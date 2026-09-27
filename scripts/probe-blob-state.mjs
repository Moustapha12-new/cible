/* Probe blob store state — never prints secret values. */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}

const token = process.env.BLOB_READ_WRITE_TOKEN;
const oidc = process.env.VERCEL_OIDC_TOKEN;
console.log("token_len", token?.length || 0, "oidc_len", oidc?.length || 0);

const { get, list, head } = await import("@vercel/blob");
const oauthPath = "gmail/gmail:oauth:moustaled.53@gmail.com";

try {
  const h = await head(oauthPath, { access: "private", token });
  console.log("HEAD_OK", h?.size, h?.pathname);
} catch (e) {
  console.log("HEAD_ERR", String(e?.message || e).slice(0, 200));
}

try {
  const r = await get(oauthPath, { access: "private", token, useCache: false });
  console.log("GET_OK", r?.statusCode, !!(r && r.stream));
  if (r?.stream) {
    const t = await new Response(r.stream).text();
    console.log("GET_BODY_LEN", t.length, "enc", t.startsWith("enc:v1:"));
  }
} catch (e) {
  console.log("GET_ERR", String(e?.message || e).slice(0, 200));
}

try {
  const l = await list({ prefix: "gmail/gmail:oauth:moustaled.53", token, access: "private" });
  console.log(
    "LIST_OK",
    (l.blobs || []).map((b) => `${b.pathname}:${b.size}`).join(",")
  );
} catch (e) {
  console.log("LIST_ERR", String(e?.message || e).slice(0, 200));
}

// Try OIDC path if token GET fails
if (oidc) {
  try {
    const r2 = await get(oauthPath, {
      access: "private",
      oidcToken: oidc,
      storeId: "store_XSjIOpWO6A2588Tg",
      useCache: false,
    });
    console.log("OIDC_GET_OK", r2?.statusCode, !!(r2 && r2.stream));
    if (r2?.stream) {
      const t = await new Response(r2.stream).text();
      console.log("OIDC_BODY_LEN", t.length, "enc", t.startsWith("enc:v1:"));
    }
  } catch (e) {
    console.log("OIDC_GET_ERR", String(e?.message || e).slice(0, 200));
  }
}
