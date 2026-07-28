/**
 * build-llms.mjs — llms.txt / llms-full.txt を生成する（https://llmstxt.org 規約）。
 *
 * 単一正本:
 *   - パッケージ一覧・説明・バージョン → wcstack monorepo の各 package.json
 *   - llms-full.txt の本文 → wcstack-skill の SKILL.md + references/
 * 手書きはこのファイル内のヘッダ文のみ。wcstack リリースごとに再実行してコミットする。
 *
 * 実行: node scripts/build-llms.mjs
 *   monorepo / skill の checkout 位置は既定でこのリポジトリの隣
 *   （../wcstack, ../wcstack-skill）。WCSTACK_DIR / WCSTACK_SKILL_DIR で上書き可。
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wcstackDir = process.env.WCSTACK_DIR ?? path.resolve(siteRoot, "..", "wcstack");
const skillDir = process.env.WCSTACK_SKILL_DIR ?? path.resolve(siteRoot, "..", "wcstack-skill");

const CORE = ["state", "router", "signals"];
const TOOLING = ["devtools", "autoloader", "server", "lint", "vscode-wcs"];
const ENTRY = ["wcstack"];
const SKIP = new Set(["poc-visual-editor"]);

// --- monorepo からパッケージ情報を収集 ---
const pkgRoot = path.join(wcstackDir, "packages");
const pkgs = new Map();
for (const dir of readdirSync(pkgRoot).sort()) {
  if (SKIP.has(dir)) continue;
  const pj = path.join(pkgRoot, dir, "package.json");
  if (!existsSync(pj)) continue;
  const meta = JSON.parse(readFileSync(pj, "utf8"));
  pkgs.set(dir, { name: meta.name, version: meta.version, description: meta.description ?? "" });
}
const version = pkgs.get("state").version;
const tag = `v${version}`;
const raw = (p) => `https://raw.githubusercontent.com/wcstack/wcstack/${tag}/${p}`;

const ioDirs = [...pkgs.keys()].filter(
  (d) => !CORE.includes(d) && !TOOLING.includes(d) && !ENTRY.includes(d),
);

const pkgLine = (dir) => {
  const p = pkgs.get(dir);
  return `- [${p.name}](${raw(`packages/${dir}/README.md`)}): ${p.description}`;
};

// --- llms.txt（薄い索引） ---
const llms = `# wcstack

> Standards-first, zero-config, buildless Web Components packages for building web apps: reactive state with declarative \`data-wcs\` HTML bindings (@wcstack/state), SPA routing (@wcstack/router), TC39-style signals (@wcstack/signals), and ${ioDirs.length} I/O node packages of declarative custom elements (\`wcs-*\` tags) that wrap browser APIs (fetch, storage, WebSocket, camera, sensors, ...) via the wc-bindable protocol.

Current release: ${tag}. An app is correctly a single HTML file plus one-line CDN loads
(\`<script type="module" src="https://esm.run/@wcstack/<pkg>/auto"></script>\`) — no bundler,
no build step, no npm install. All links below are pinned to ${tag}.

## Entry guide

${ENTRY.filter((d) => pkgs.has(d)).map(pkgLine).join("\n")}

The unscoped \`wcstack\` package is documentation-only: read it with
\`npm view wcstack readme\`; load or install the individual \`@wcstack/*\` packages an app uses.

## Core

${CORE.map(pkgLine).join("\n")}

## Machine-readable contracts

- [wcs-manifest.json](https://cdn.jsdelivr.net/npm/@wcstack/state@${version}/dist/wcs-manifest.json): the data-wcs binding grammar and all built-in filters (names, arity, argument types) as JSON — the single source of truth for tooling
- [Timing and firing contract](${raw("docs/timing-and-firing-contract.md")}): when bindings attach, when writes fire, initial-sync authority
- [Sidecar manifest schema](${raw("docs/wcstack-manifest-schema.md")}): wcstack.manifest.json format for declaring custom tag contracts to the wcs-validate linter and IDE

## I/O node packages (wcs-* tags)

${ioDirs.map(pkgLine).join("\n")}

## Tooling

${TOOLING.filter((d) => pkgs.has(d)).map(pkgLine).join("\n")}

## Examples

- [Multi-package demos](https://github.com/wcstack/wcstack/tree/${tag}/examples): router SPA, signals live search, camera/record/upload, cross-tab todo, and more
- [Per-package demos](https://github.com/wcstack/wcstack/tree/${tag}/packages): see each package's examples/ directory

## Optional

- [llms-full.txt](https://wcstack.github.io/llms-full.txt): complete authoring guide (workflow, full data-wcs syntax, I/O node catalog with timing notes, silent-failure matrix) in one file — use this when generating wcstack apps
- [wcstack-app skill](https://github.com/wcstack/wcstack-skill): the same content as an installable Claude Code Agent Skill (\`/plugin marketplace add wcstack/wcstack-skill\`)
- Validate generated HTML with \`npx @wcstack/lint index.html\` and iterate until exit code 0
- [AGENTS.md](${raw("AGENTS.md")}): guidance for AI agents working inside the wcstack monorepo itself
- Japanese docs: every package also ships README.ja.md next to its README.md
`;

// --- llms-full.txt（skill の内容を1ファイルに連結） ---
const skillBase = path.join(skillDir, "skills", "wcstack-app");
// CRLF checkout でも frontmatter 除去と連結が安定するよう LF に正規化して読む。
const readLf = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const stripFrontmatter = (s) => s.replace(/^---\n[\s\S]*?\n---\n/, "");
const replaceRequired = (text, before, after, label) => {
  if (!text.includes(before)) {
    throw new Error(`[build-llms] release overlay marker not found: ${label}`);
  }
  return text.replace(before, after);
};

const applyV1230Overlay = (text, source) => {
  if (version !== "1.23.0") return text;

  if (source === "SKILL.md") {
    text = replaceRequired(
      text,
      "Content verified against **wcstack v1.22.6** (READMEs, examples, and source as of 2026-07). If the installed/CDN version is much newer, spot-check syntax against the package READMEs.",
      "Base skill content was verified against **wcstack v1.22.6**. The v1.23.0 corrections in this generated guide are source-verified against the v1.23.0 monorepo release.",
      "SKILL.md verification stamp",
    );
    return replaceRequired(
      text,
      `<!-- state family: one /auto line per package. Order among wcstack /auto scripts
     does not matter (deferred module execution; state waits via whenDefined) —
     EXCEPT @wcstack/devtools/auto, which must come before state/auto. -->`,
      `<!-- state family: one /auto line per package. Load devtools and every I/O
     node before state/auto. Property writes can be deferred until definition,
     but command-token emits are not replayed; state last closes that race. -->`,
      "SKILL.md script-order rule",
    );
  }

  if (source === "router-and-scaffold.md") {
    text = replaceRequired(
      text,
      "`/auto` is a zero-config bootstrap that only performs registration. Best practice is to list I/O node packages before state (not a hard requirement, since state defers via whenDefined).",
      "`/auto` is a zero-config bootstrap that only performs registration. List every I/O node package before state. Property and spread bindings on undefined elements are deferred and re-applied with the latest value, but command-token emits are never replayed; loading state last prevents early UI actions from reaching zero subscribers. When order cannot be controlled, gate the emit with `await customElements.whenDefined(tag)`.",
      "router scaffold script-order rule",
    );
    return replaceRequired(
      text,
      `  <script type="module" src="https://esm.run/@wcstack/state/auto"></script>
  <script type="module" src="https://esm.run/@wcstack/fetch/auto"></script>
  <script type="module" src="https://esm.run/@wcstack/router/auto"></script>`,
      `  <script type="module" src="https://esm.run/@wcstack/fetch/auto"></script>
  <script type="module" src="https://esm.run/@wcstack/router/auto"></script>
  <script type="module" src="https://esm.run/@wcstack/state/auto"></script>`,
      "router full scaffold script order",
    );
  }

  if (source === "io-node-catalog.md") {
    text = replaceRequired(
      text,
      "All 35 tags are cross-checked against source at v1.21.7 (contracts unchanged through v1.22.6)",
      "All 35 tags are cross-checked against source at v1.21.7 (tag contracts unchanged through v1.23.0)",
      "I/O catalog verification stamp",
    );
    text = replaceRequired(
      text,
      "**One-line CDN**: `<script type=\"module\" src=\"https://esm.run/@wcstack/<pkg>/auto\"></script>` alongside `@wcstack/state/auto`. Load order does not matter (deferred module execution; state waits via `whenDefined`) — the one exception is `@wcstack/devtools/auto`, which must load BEFORE state/auto (live wiring-ledger capture)",
      "**One-line CDN**: `<script type=\"module\" src=\"https://esm.run/@wcstack/<pkg>/auto\"></script>` alongside `@wcstack/state/auto`. Load devtools and all I/O-node packages BEFORE state/auto. Property/spread writes can wait for definition, but command-token emits are not replayed; state last prevents the early zero-subscriber window.",
      "I/O catalog script-order rule",
    );
    return replaceRequired(
      text,
      "### Stability\n",
      `### Create and bind an owned node — \`mountNode\` (v1.23.0)

\`mountNode\` from \`@wcstack/signals/dom\` creates a defined custom element, applies
attributes before connection, subscribes before connection, and appends it (to
\`document.body\` by default). Use a side-effect import so module evaluation makes a
missing package a loud error instead of an indefinitely pending \`whenDefined\`:

\`\`\`js
import "@wcstack/fetch/auto";
import { mountNode } from "@wcstack/signals/dom";

const fetcher = mountNode("wcs-fetch", { attrs: { url: "/api/people" } });
fetcher.signals.value.get();
fetcher.unmount(); // dispose bindings and remove the owned element; idempotent
\`\`\`

For an optional node, compose \`import("@wcstack/tilt/auto")\` with \`mountNode\` and
handle the rejected import as degraded mode.

### Bind an I/O Core directly (no custom element)

Every I/O Core is a complete wc-bindable \`EventTarget\`: it self-dispatches by
default, exposes observable getters, and carries \`static wcBindable\`. Bind it
without a descriptor or custom-element definition:

\`\`\`js
import { FetchCore } from "@wcstack/fetch";
import { bindNode } from "@wcstack/signals";

const core = new FetchCore();
const bound = bindNode(core);
core.fetch("/api/user");
bound.signals.value.get();
\`\`\`

Core-direct use has no attributes, \`:state()\` reflection, or connected lifecycle;
drive \`observe()\` / \`dispose()\` (or commands) yourself.

### Stability
`,
      "signals v1.23.0 addendum insertion point",
    );
  }

  return text;
};

let skillMd = stripFrontmatter(readLf(path.join(skillBase, "SKILL.md")));
skillMd = applyV1230Overlay(skillMd, "SKILL.md");
const refs = [
  ["state-binding.md", "Reference: data-wcs binding syntax (state family)"],
  ["router-and-scaffold.md", "Reference: SPA routing and scaffold"],
  ["io-node-catalog.md", "Reference: I/O node catalog + signals quick reference"],
].map(([f, title]) =>
  `\n\n---\n\n# ${title}\n\n<!-- source: wcstack-skill/skills/wcstack-app/references/${f} -->\n\n`
  + applyV1230Overlay(readLf(path.join(skillBase, "references", f)), f),
);

const releaseAddendum = version === "1.23.0" ? `
## v1.23.0 release additions

- **The unscoped \`wcstack\` package is a documentation entry point only.** Read its
  self-contained guide with \`npm view wcstack readme\`; do not install it or load it
  in an app. Continue loading the individual \`@wcstack/*\` packages.
- **State-family script order is now a correctness rule:** devtools and every I/O
  node load before \`@wcstack/state/auto\`. Undefined-element property writes are
  replayed with the latest value, but command-token emits are not replayed.
- **Signals owns headless nodes with \`mountNode\`**, or binds an I/O Core directly
  with \`bindNode(new XxxCore())\`. See the signals quick reference included below.

` : "";

const full = `# wcstack — complete authoring guide for LLMs

> Everything needed to generate correct wcstack (${tag}) apps: workflow, exact data-wcs
> syntax, the full wcs-* I/O node catalog with source-verified timing notes, and the
> silent-failure matrix. Generated from the wcstack-app skill
> (github.com/wcstack/wcstack-skill) plus release-specific corrections verified
> against the wcstack monorepo at ${tag}.

Note: the guide below refers to three reference files (references/state-binding.md,
router-and-scaffold.md, io-node-catalog.md). All three are included IN THIS FILE after
the main guide — no external fetches are needed.

---

${releaseAddendum}${skillMd}${refs.join("")}`;

writeFileSync(path.join(siteRoot, "llms.txt"), llms);
writeFileSync(path.join(siteRoot, "llms-full.txt"), full);
console.log(`[build-llms] wrote llms.txt (${llms.length} bytes) and llms-full.txt (${full.length} bytes) at ${tag}`);
