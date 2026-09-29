#!/usr/bin/env node
// PostToolUse: format an edited Go file with the repo's formatter config (golangci-lint fmt), like the pre-commit hook.
// Silent on success; never blocks (a missing tool just skips).
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const file = String(input.tool_input?.file_path ?? "");
const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const api = path.join(root, "services/api");
const abs = path.resolve(root, file);
if (abs.endsWith(".go") && abs.startsWith(api + path.sep) && !abs.endsWith(".gen.go")) {
  try {
    execFileSync("golangci-lint", ["fmt", path.relative(api, abs)], { cwd: api, stdio: "ignore", timeout: 60_000 });
  } catch { /* formatter unavailable or file doesn't parse yet: lint will say so later */ }
}
process.exit(0);
