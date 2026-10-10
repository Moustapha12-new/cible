import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
const dir = mkdtempSync(join(tmpdir(), "cible-security-"));
execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit", "false", "--outDir", dir, "--module", "commonjs", "--moduleResolution", "node", "--incremental", "false"], { stdio: "inherit" });
const runner = join(dir, "run.cjs");
writeFileSync(runner, `const Module = require('module'); const path = require('path');
const original = Module._resolveFilename;
Module._resolveFilename = function(name, parent, ...args) { if(name.startsWith('@/')) name = path.join(${JSON.stringify(dir)}, 'src', name.slice(2)); return original.call(this, name, parent, ...args); };
require(path.join(${JSON.stringify(dir)}, 'src/lib', process.argv[2] + '.test.js'));`);
const suites = process.argv.slice(2);
for (const suite of suites.length ? suites : ["auth-security"]) {
  if (!/^[a-z0-9-]+$/.test(suite)) throw new Error("Invalid test suite name");
  execFileSync(process.execPath, [runner, suite], { stdio: "inherit", env: { ...process.env, NODE_PATH: join(process.cwd(), "node_modules") } });
}
