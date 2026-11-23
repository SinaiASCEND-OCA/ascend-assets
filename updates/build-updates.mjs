#!/usr/bin/env node
/* Builds the "Last updated" log that ascend-updated.js shows on every ASCEND dashboard:
   one small file per dashboard repo, updates/data/<repo>.json, listing its most recent
   updates (date, one-line description, files changed).

     node updates/build-updates.mjs              # every dashboard repo (see OWNERS)
     node updates/build-updates.mjs --only Dashboard-Phase-1-Program-Assessment
     node updates/build-updates.mjs --check      # print a summary, write nothing

   An "update" is one publish to the repo's default branch: a merged pull request or a
   direct commit. Only the date, the first line of the description and the names of the
   files that changed are kept; no author, no commit id, no file contents.

   It reads GitHub with a token that can read the private repos of both accounts:
   GH_TOKEN (or GITHUB_TOKEN) in the environment, else the `gh` CLI's login. The Pages
   workflow runs it when the DASHBOARD_READ_TOKEN secret is set; without it the files
   already committed in updates/data/ are published as they are. */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/* Whose repos: every repo of the organization, and the dashboards still kept in the older account. */
const OWNERS = {
  "SinaiASCEND-OCA": null,
  "SinaiASCEND": ["Dashboard---HUB", "ASQ-ISA", "Dashboard---LCME", "Curricular-Affairs", "Dashboard---BabyBates",
    "Dashboard---Policy-Library", "Dashboard---Calendar", "Dashboard---CA-Meetings"],
};
const SKIP = new Set(["ascend-assets", ".github"]);      // not dashboards
/* Repos whose history names people (a staff directory): publish dates and file counts only. */
const COUNTS_ONLY = new Set(["Curricular-Affairs"]);
const KEEP = 25;                                         // updates kept per dashboard
const MAX_FILES = 60;                                    // file names listed per update
const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const OUT = opt("--out") || join(HERE, "data");

function token() {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  try { return execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim(); } catch { return ""; }
}
const TOKEN = token();
if (!TOKEN) { console.error("No GitHub token (GH_TOKEN) and no gh login: nothing built."); process.exit(flag("--optional") ? 0 : 1); }

async function gh(path) {
  const r = await fetch("https://api.github.com/" + path, {
    headers: { authorization: "Bearer " + TOKEN, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "ascend-updates" },
  });
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return r.json();
}
const nyDate = iso => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/* The line people read: a merge commit's own first line is "Merge pull request #12 from …",
   so use the pull request's title, which GitHub puts on the third line. */
function title(message) {
  const lines = String(message || "").split("\n").map(s => s.trim());
  let t = lines[0] || "";
  if (/^Merge pull request #\d+/.test(t)) t = lines.slice(1).find(Boolean) || t;
  if (/^Merge (branch|remote-tracking branch) /.test(t)) t = "Merged changes";
  t = t.replace(/\s*\(#\d+\)\s*$/, "").replace(/\s*\(\d{4}-\d\d-\d\d \d\d:\d\d UTC\)\s*$/, "");
  // The log is public: say nothing about when or how access codes and gates change.
  if (/access|passcode|password|owner|\btiers?\b|encrypt|\bgate[sd]?\b|\bcodes?\b|security|unlock|admin|FERPA/i.test(t)) t = "Access settings updated";
  return t.slice(0, 200);
}
/* Automated refreshes can publish several times a day under one description: show them once. */
function merged(list) {
  const out = [];
  for (const u of list) {
    const last = out[out.length - 1];
    if (last && last.date === u.date && last.title === u.title) {
      const seen = new Set(last.files.map(f => f.p));
      for (const f of u.files) if (!seen.has(f.p) && last.files.length < MAX_FILES) { last.files.push(f); seen.add(f.p); }
      last.n = last.files.length ? Math.max(last.n, u.n, seen.size) : last.n + u.n; last.times = (last.times || 1) + 1;
    } else out.push({ ...u, files: u.files.slice() });
  }
  return out;
}
const STATUS = { added: "A", removed: "D", renamed: "R", modified: "M", changed: "M", copied: "A" };

async function build(ORG, repo, branch) {
  const file = join(OUT, repo + ".json");
  let old = null;
  try { old = JSON.parse(readFileSync(file, "utf8")); } catch {}
  const list = await gh(`repos/${ORG}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=100`);
  if (!list.length) return;
  const head = list[0].sha.slice(0, 12);
  if (old && old.head === head && !flag("--force")) { console.log(`${repo.padEnd(40)} no new publish`); return; }
  const bySha = new Map(list.map(c => [c.sha, c]));
  const raw = [];
  let c = list[0];
  // walk the default branch's own line of history (first parents): one step = one publish
  for (let guard = 0; c && raw.length < KEEP * 2 && guard < 100; guard++) {
    const parent = c.parents && c.parents[0] && c.parents[0].sha;
    let files = [], n = 0;
    if (parent) {
      const cmp = await gh(`repos/${ORG}/${repo}/compare/${parent}...${c.sha}?per_page=1`);
      const all = cmp.files || [];
      n = all.length;
      files = all.slice(0, MAX_FILES).map(f => ({ p: f.filename, s: STATUS[f.status] || "M" }));
    }
    const at = c.commit.committer.date;
    if (n > 0) raw.push(COUNTS_ONLY.has(repo) ? { date: nyDate(at), at, title: "Directory updated", n, files: [] }
      : { date: nyDate(at), at, title: title(c.commit.message), n, files });
    c = parent ? bySha.get(parent) : null;
  }
  const updates = merged(raw).slice(0, KEEP);
  const out = { repo, head, updates };
  const text = JSON.stringify(out) + "\n";
  const same = existsSync(file) && readFileSync(file, "utf8") === text;
  if (!flag("--check") && !same) { mkdirSync(OUT, { recursive: true }); writeFileSync(file, text); }
  const top = updates[0];
  console.log(`${repo.padEnd(40)} ${String(updates.length).padStart(2)} updates · latest ${top ? top.date + " · " + top.n + " file" + (top.n === 1 ? "" : "s") : "none"}${same ? "" : flag("--check") ? " · would change" : " · written"}`);
}

const only = opt("--only");
let failed = 0;
for (const [owner, names] of Object.entries(OWNERS)) {
  let repos;
  try {
    if (names) repos = await Promise.all(names.map(n => gh(`repos/${owner}/${n}`)));
    else repos = (await gh(`orgs/${owner}/repos?per_page=100&type=all`)).filter(r => !r.archived && !SKIP.has(r.name));
  } catch (e) { failed++; console.error(`${owner}: ${e.message}`); continue; }
  for (const r of repos.sort((a, b) => a.name.localeCompare(b.name))) {
    if (only && r.name !== only) continue;
    try { await build(owner, r.name, r.default_branch); } catch (e) { failed++; console.error(`${r.name}: ${e.message}`); }
  }
}
if (failed && !flag("--optional")) process.exit(1);
