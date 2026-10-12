/**
 * build-tutorial.mjs — keeps the code on the tutorial pages identical to the demos they run.
 *
 * Each step page (tutorial/<step>/index.html) runs its demo in an iframe
 * (tutorial/<step>/shop/index.html) and shows its code in two kinds of blocks:
 *
 *   <code class="language-html" data-include="shop/index.html"></code>
 *     The whole file. This script writes it in (HTML-escaped).
 *
 *   <code class="language-html" data-excerpt="shop/index.html">…</code>
 *     A hand-written excerpt. This script checks that its lines appear in the
 *     file, in order and contiguous, ignoring indentation. A line that is only
 *     "…", "// …" or "<!-- … -->" skips any number of lines of the file.
 *
 * Paths are relative to the page. Run after editing a demo or a page:
 *
 *   node scripts/build-tutorial.mjs           # write the includes, check the excerpts
 *   node scripts/build-tutorial.mjs --check   # change nothing; exit 1 if anything is stale
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tutorialRoot = path.join(siteRoot, "tutorial");
const checkOnly = process.argv.includes("--check");

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unescape = (s) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'")
  .replace(/&hellip;/g, "…").replace(/&amp;/g, "&");
const GAP = new Set(["…", "// …", "<!-- … -->"]);

function pages() {
  const out = [path.join(tutorialRoot, "index.html")].filter(existsSync);
  for (const dir of readdirSync(tutorialRoot).sort()) {
    const page = path.join(tutorialRoot, dir, "index.html");
    if (statSync(path.join(tutorialRoot, dir)).isDirectory() && existsSync(page)) out.push(page);
  }
  return out;
}

/** Does `excerpt` (lines) occur in `source` (lines) as a contiguous run, gaps allowed? */
function matches(excerpt, source) {
  const ex = excerpt.map((l) => l.trim());
  const src = source.map((l) => l.trim());
  const from = (ei, si) => {
    if (ei === ex.length) return true;
    if (GAP.has(ex[ei])) {
      for (let s = si; s <= src.length; s++) if (from(ei + 1, s)) return true;
      return false;
    }
    return si < src.length && src[si] === ex[ei] && from(ei + 1, si + 1);
  };
  for (let start = 0; start < src.length; start++) if (from(0, start)) return true;
  return false;
}

const BLOCK = /(<code\b[^>]*\bdata-(include|excerpt)="([^"]+)"[^>]*>)([\s\S]*?)(<\/code>)/g;
let problems = 0;
let rewritten = 0;

for (const page of pages()) {
  const rel = path.relative(siteRoot, page).replaceAll("\\", "/");
  const html = readFileSync(page, "utf8");
  const next = html.replace(BLOCK, (all, open, kind, src, body, close) => {
    const file = path.resolve(path.dirname(page), src);
    if (!existsSync(file)) {
      problems++;
      console.error(`${rel}: ${kind} "${src}" — no such file`);
      return all;
    }
    const source = readFileSync(file, "utf8").replace(/\r\n/g, "\n").replace(/\n$/, "");
    if (kind === "include") return open + escape(source) + close;
    const excerpt = unescape(body).replace(/\r\n/g, "\n").replace(/^\n|\n$/g, "").split("\n");
    if (!matches(excerpt, source.split("\n"))) {
      problems++;
      console.error(`${rel}: excerpt of "${src}" does not match the file:\n  ${excerpt.slice(0, 3).join("\n  ")}${excerpt.length > 3 ? "\n  …" : ""}`);
    }
    return all;
  });
  if (next !== html) {
    if (checkOnly) {
      problems++;
      console.error(`${rel}: a data-include block is out of date — run node scripts/build-tutorial.mjs`);
    } else {
      writeFileSync(page, next);
      rewritten++;
      console.log(`wrote ${rel}`);
    }
  }
}

if (problems) {
  console.error(`\n${problems} problem(s)`);
  process.exit(1);
}
console.log(checkOnly ? "tutorial code blocks are up to date" : `done (${rewritten} page(s) rewritten)`);
