/* Try alternate ways to read a blob when store is suspended (no secrets printed). */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}

const token = process.env.BLOB_READ_WRITE_TOKEN;
const pathname = "gmail/gmail:oauth:moustaled.53@gmail.com";
const blob = await import("@vercel/blob");

// 1) list → use blob.url if present
const l = await blob.list({ prefix: pathname, token, access: "private" });
const meta = (l.blobs || [])[0];
console.log("META", meta ? { pathname: meta.pathname, size: meta.size, url: meta.url?.slice(0, 80) } : null);

// 2) signed-token / presign if available
for (const fn of ["signedToken", "signed-token", "presign", "getSignedUrl"]) {
  console.log("export?", fn, typeof blob[fn]);
}
console.log("blob exports", Object.keys(blob).sort().join(","));

// 3) try download via raw fetch of private URL with token header variants
if (meta?.url) {
  const attempts = [
    { name: "bearer", headers: { Authorization: `Bearer ${token}` } },
    { name: "x-vercel-blob", headers: { "x-vercel-blob": token } },
    { name: "x-api-version", headers: { "x-api-version": "7", Authorization: `Bearer ${token}` } },
  ];
  for (const a of attempts) {
    try {
      const res = await fetch(meta.url, { headers: a.headers });
      console.log("FETCH", a.name, res.status, res.headers.get("content-type"));
      if (res.ok) {
        const t = await res.text();
        console.log("FETCH_OK_LEN", t.length, "enc", t.startsWith("enc:v1:"));
      } else {
        const t = await res.text().catch(() => "");
        console.log("FETCH_BODY", t.slice(0, 200));
      }
    } catch (e) {
      console.log("FETCH_ERR", a.name, String(e.message).slice(0, 120));
    }
  }
}

// 4) try put overwrite of a NEW path to see if write works on different key
try {
  const r = await blob.put(`gmail/__w_${Date.now()}.txt`, "w", {
    access: "private",
    token,
    allowOverwrite: true,
    contentType: "text/plain",
  });
  console.log("PUT_NEW_OK", r?.pathname);
} catch (e) {
  console.log("PUT_NEW_ERR", String(e.message).slice(0, 200));
}
