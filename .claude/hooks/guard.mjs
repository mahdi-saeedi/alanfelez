#!/usr/bin/env node
// PreToolUse guard for Bash commands (deploy/CLAUDE.md, CLAUDE.md "How to work"). A safety net, not the security boundary:
// production kubeconfigs must themselves be read-only. Decisions: "deny" (blocked, with the reason) or "ask" (the user confirms).
// The owner sets ALANFELEZ_OWNER=1 (in .claude/settings.local.json → env) to push/merge to main.
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const cmd = String(input.tool_input?.command ?? "");
const owner = process.env.ALANFELEZ_OWNER === "1";

const CONTEXTS = { "k3d-alanfelez": "local", "alanfelez-staging": "staging", "alanfelez-production": "production" };
const READ_VERBS = new Set(["get", "describe", "logs", "top", "events", "explain", "api-resources", "version", "auth", "config", "cluster-info"]);
const ROLLOUT_READ = new Set(["get", "list", "status", "version"]);
const HELM_READ = new Set(["list", "ls", "status", "history", "get", "template", "lint", "show", "version", "search", "repo", "dependency"]);

function decide(decision, reason) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: decision, permissionDecisionReason: reason } }));
  process.exit(0);
}

// Split a shell line into simple commands (good enough for a guard). Text written to a file (`cat`/`tee` heredocs) and
// quoted text (grep patterns, messages, JSON) are blanked first, so words inside them are never taken for commands.
// Heredocs fed to anything else (bash, ssh, python…) are executed, so they're still checked line by line.
const unquoted = cmd
  .replace(/(\b(?:cat|tee)\b[^\n]*?)<<-?\s*['"]?(\w+)['"]?([^\n]*)\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, "$1 Q $3")
  .replace(/'[^']*'/g, "Q").replace(/"(?:\\.|[^"\\])*"/g, "Q").replace(/\\\n/g, " ");
const parts = unquoted.split(/&&|\|\||;|\||\n|\$\(|`/).map((s) => s.trim()).filter(Boolean);

for (const part of parts) {
  const w = part.split(/\s+/).filter((x) => !/^[A-Z_]+=/.test(x) || x.includes("/")); // drop leading VAR=value
  const bin = (w[0] ?? "").split("/").pop();
  const flag = (name) => {
    const i = w.findIndex((x) => x === name || x.startsWith(name + "="));
    if (i < 0) return undefined;
    return w[i].includes("=") ? w[i].split("=").slice(1).join("=") : w[i + 1];
  };

  // --- Kubernetes ----------------------------------------------------------------------------
  if (bin === "kubectl" || bin === "kubectl-argo-rollouts" || bin === "k9s") {
    const ctx = flag("--context");
    if (!ctx) decide("deny", "Always pass --context explicitly (k3d-alanfelez, alanfelez-staging or alanfelez-production). See deploy/CLAUDE.md.");
    const env = CONTEXTS[ctx];
    if (!env) decide("deny", `Context "${ctx}" is not an Alan Felez cluster. Only k3d-alanfelez, alanfelez-staging and alanfelez-production may be used.`);
    if (bin === "k9s" && env === "production") decide("deny", "No interactive k9s on production (it can edit and delete). Use kubectl get/describe/logs.");
    // Positional words, skipping the value of global flags written as "--flag value".
    const args = [];
    for (let i = 1; i < w.length; i++) {
      if (/^(--context|--namespace|-n|--kubeconfig|--cluster|--user|-s|--server)$/.test(w[i])) i++;
      else if (!w[i].startsWith("-")) args.push(w[i]);
    }
    const rollouts = bin === "kubectl-argo-rollouts" || args[0] === "argo";
    const verb = rollouts ? args[args[0] === "argo" ? 2 : 0] : args[0];
    if (env === "production") {
      const ok = rollouts ? ROLLOUT_READ.has(verb) : READ_VERBS.has(verb) && !(verb === "config" && args[1] !== "view" && args[1] !== "get-contexts");
      if (!ok) decide("deny", `Production is read-only ("${verb}" changes state or opens a shell). Change production through git → PR → Argo CD (deploy/CLAUDE.md), or ask the owner.`);
    }
    if (env === "staging" && !rollouts && ["delete", "drain", "cordon", "replace"].includes(verb)) {
      decide("ask", `"kubectl ${verb}" on staging. Config changes normally go through git. Confirm this is intended.`);
    }
  }

  if (bin === "helm") {
    const verb = w.slice(1).find((x) => !x.startsWith("-"));
    const ctx = flag("--kube-context");
    if (!HELM_READ.has(verb)) {
      if (ctx === "k3d-alanfelez") continue;
      decide("deny", `"helm ${verb}" against a cluster. Deploys happen only through Argo CD from git (deploy/CLAUDE.md). Local k3d: pass --kube-context k3d-alanfelez.`);
    }
  }

  if (bin === "argocd") {
    const verb = w.slice(1).filter((x) => !x.startsWith("-")).slice(0, 2).join(" ");
    if (!/^(app (get|list|diff|history|logs|resources|manifests)|version|context|login|account get-user-info)/.test(verb)) {
      decide("ask", `"argocd ${verb}" changes Argo CD state. Deploys should come from git. Confirm with the owner first.`);
    }
  }

  // --- Git / GitHub --------------------------------------------------------------------------
  if (bin === "git" && w.includes("push")) {
    const force = w.some((x) => x === "-f" || x === "--force" || x.startsWith("--force-with-lease") || /^\+/.test(x));
    const toMain = w.some((x) => /^(\+?(HEAD:|[\w/-]+:)?(refs\/heads\/)?(main|master))$/.test(x)) || w.includes("--all") || w.includes("--mirror");
    if (force && !owner) decide("deny", "Force-push is not allowed. Push a new commit instead, or ask the owner.");
    if (toMain && !owner) decide("deny", "Only the owner updates main (it deploys to staging). Push your branch and open a PR (skill: ship-change).");
    const refs = w.slice(w.indexOf("push") + 1).filter((x) => !x.startsWith("-")).slice(1); // after the remote
    if (!owner && (refs.length === 0 || refs.some((r) => r === "HEAD" || r.startsWith("HEAD:")))) {
      // `git push`, `git push origin` and `git push origin HEAD` push the current branch: refuse when that's main.
      try {
        const { execFileSync } = await import("node:child_process");
        const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
        if (branch === "main" || branch === "master") decide("deny", "You're on main. Create a branch (git switch -c feat/<slug>), push it and open a PR.");
      } catch { /* not a repo: nothing to check */ }
    }
  }
  if (bin === "git" && ((w.includes("reset") && w.includes("--hard")) || (w.includes("clean") && w.some((x) => /^-[a-z]*f/.test(x))) || (w.includes("checkout") && w.includes(".")) || (w.includes("restore") && w.includes(".")))) {
    decide("ask", "This throws away uncommitted work and can't be undone. Confirm there's nothing to keep (git status).");
  }
  if (bin === "gh" && w[1] === "pr" && w[2] === "merge" && !owner) decide("deny", "Only the owner merges PRs. Share the PR link and ask for a review.");
  if (bin === "gh" && w[1] === "api" && w.some((x) => /-X|--method/.test(x)) && w.some((x) => /^(DELETE|PUT|PATCH)$/i.test(x))) {
    decide("ask", "A write through the GitHub API. Confirm this is intended.");
  }

  // --- Local data ----------------------------------------------------------------------------
  if ((bin === "docker" && w.includes("compose") && w.includes("down") && w.some((x) => x === "-v" || x === "--volumes")) || (bin === "task" && w[1] === "reset")) {
    decide("ask", "This deletes the local databases and Keycloak data (volumes). Confirm.");
  }
  if (bin === "docker" && ((w.includes("system") && w.includes("prune")) || (w.includes("volume") && (w.includes("rm") || w.includes("prune"))) || (w.includes("image") && w.includes("prune")))) {
    decide("ask", "This deletes Docker data, possibly from other projects on this machine. Confirm.");
  }
  if (bin === "docker" && (w.includes("stop") || w.includes("kill") || w.includes("rm")) && !w.includes("compose") && !w.includes("--rm")) {
    decide("ask", "Stopping or removing containers directly may hit containers of other projects. Use task down / docker compose. Confirm.");
  }
}
process.exit(0);
