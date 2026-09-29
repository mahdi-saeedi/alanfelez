#!/usr/bin/env node
// PreToolUse guard for file edits: generated code is regenerated, not edited; merged migrations are never changed;
// production config and secrets need the owner. See CLAUDE.md "How to work".
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const file = String(input.tool_input?.file_path ?? input.tool_input?.notebook_path ?? "");
if (!file) process.exit(0);
const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const rel = path.relative(root, path.resolve(root, file)).split(path.sep).join("/");
const owner = process.env.ALANFELEZ_OWNER === "1";

function decide(decision, reason) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: decision, permissionDecisionReason: reason } }));
  process.exit(0);
}

const generated = [
  ["services/api/internal/api/api.gen.go", "contracts/openapi.yaml"],
  ["services/api/internal/dbq/", "services/api/queries/*.sql or the migrations"],
  ["packages/api-client/src/schema.d.ts", "contracts/openapi.yaml"],
  ["apps/keycloak-theme/src/kc.gen.tsx", "the Keycloakify config"],
];
for (const [p, source] of generated) {
  if (rel === p || rel.startsWith(p)) decide("deny", `${rel} is generated. Edit ${source}, then run \`task generate\`.`);
}

// A migration that is already on origin/main has run on staging (and maybe production): add a new one instead.
if (/^services\/api\/migrations\/\d+_.*\.sql$/.test(rel)) {
  try {
    execFileSync("git", ["cat-file", "-e", `origin/main:${rel}`], { cwd: root, stdio: "ignore" });
    decide("deny", `${rel} is already merged and has run on the servers. Never edit it: add the next numbered migration (skill: db-change).`);
  } catch { /* new migration: fine */ }
}

if (rel.startsWith("deploy/environments/production/") && !owner) {
  decide("ask", "Production configuration. This must go through a PR the owner reviews. Confirm you're preparing that PR.");
}
if (/(^|\/)secrets\//.test(rel) && rel.startsWith("deploy/") && !rel.endsWith("README.md")) {
  decide("ask", "Secrets folder: only SealedSecrets (kubeseal output) belong here, never a plain secret. Confirm.");
}
process.exit(0);
