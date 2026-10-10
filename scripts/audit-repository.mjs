// Offline scan. Print classifications/counts only, never matching contents.
import { execFileSync } from "node:child_process";
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });
const files = git("ls-files", "-z").split("\0").filter(Boolean);
const privateFiles = files.filter(path => /(^|\/)(\.gmail-tokens\/|\.env(?:\.|$)|_backup_secrets_)/.test(path));
const patterns = [
  ["Google OAuth secret", /GOCSPX-[A-Za-z0-9_-]{20,}/g],
  ["Supabase secret", /sb_secret_[A-Za-z0-9_-]{20,}/g],
  ["Vercel Blob secret", /vercel_blob_rw_[A-Za-z0-9_-]{25,}/g],
  ["Google API key", /AIza[A-Za-z0-9_-]{30,}/g],
  ["Private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
];
const revisions = process.argv.includes("--history") ? git("rev-list", "--all").trim().split("\n").filter(Boolean) : [""];
let sensitiveVersions = 0;
const findings = new Map();
for (const revision of revisions) {
  const paths = revision ? git("ls-tree", "-r", "--name-only", revision).trim().split("\n") : files;
  for (const path of paths) {
    if (/^\.gmail-tokens\//.test(path)) sensitiveVersions++;
    if (!/\.(?:[cm]?[jt]sx?|json|md|ya?ml|txt|env)$/.test(path) && !/^\.env/.test(path)) continue;
    let source;
    try { source = git("show", `${revision || ":"}${revision ? ":" : ""}${path}`); } catch { continue; }
    for (const [kind, pattern] of patterns) {
      const matches = source.match(pattern);
      if (matches) findings.set(kind, (findings.get(kind) || 0) + matches.length);
    }
  }
}
console.log(JSON.stringify({ trackedPrivateFiles: privateFiles.length, sensitiveFileVersions: sensitiveVersions, credentialLikeMatches: Object.fromEntries(findings), mode: revisions[0] ? "history" : "index" }, null, 2));
if (privateFiles.length || findings.size) process.exitCode = 1;
