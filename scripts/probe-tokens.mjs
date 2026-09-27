/* Probe GEMINI + BLOB from .env.local — never prints secret values. */
import { readFileSync } from "node:fs";

function getEnv(key) {
  const text = readFileSync(".env.local", "utf8");
  const m = new RegExp(`^${key}=(.*)$`, "m").exec(text);
  if (!m) return "";
  return m[1].trim().replace(/^['"]|['"]$/g, "");
}

const gem = getEnv("GEMINI_API_KEY");
const blob = getEnv("BLOB_READ_WRITE_TOKEN");
console.log("gemini len", gem.length, "prefix", gem.slice(0, 3));
console.log("blob len", blob.length, "prefix", blob.slice(0, 12));

const models = [
  "gemini-3-flash-preview",
  "gemini-3.6-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-3.1-flash-lite",
];

for (const m of models) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": gem },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Reply with OK only" }] }],
        }),
      }
    );
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      const t =
        j?.candidates?.[0]?.content?.parts
          ?.map((p) => p.text)
          .join("")
          .trim() || "";
      console.log("GEMINI OK", m, "HTTP", res.status, "reply", JSON.stringify(t.slice(0, 40)));
    } else {
      console.log(
        "GEMINI FAIL",
        m,
        "HTTP",
        res.status,
        "msg",
        (j.error?.message || "").slice(0, 180)
      );
    }
  } catch (e) {
    console.log("GEMINI ERR", m, e.message);
  }
}

try {
  const { put, get: bget, list } = await import("@vercel/blob");
  const pathname = `gmail/__probe__${Date.now()}.txt`;
  await put(pathname, "probe-ok", {
    access: "private",
    token: blob,
    allowOverwrite: true,
    contentType: "text/plain",
  });
  console.log("BLOB PUT OK");
  const getRes = await bget(pathname, { access: "private", token: blob, useCache: false });
  if (getRes && getRes.stream) {
    const t = await new Response(getRes.stream).text();
    console.log("BLOB GET OK body=", t);
  } else {
    console.log("BLOB GET status", getRes && getRes.statusCode);
  }
  try {
    const l = await list({ prefix: "gmail/", token: blob, access: "private" });
    console.log(
      "BLOB LIST OK count=",
      (l.blobs || []).length,
      "sample=",
      (l.blobs || []).slice(0, 5).map((b) => b.pathname)
    );
  } catch (e) {
    console.log("BLOB LIST FAIL", e.message);
  }
} catch (e) {
  console.log("BLOB FAIL", e.message);
}
