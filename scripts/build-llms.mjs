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

const ioDirs = [...pkgs.keys()].filter((d) => !CORE.includes(d) && !TOOLING.includes(d));

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
const skillMd = stripFrontmatter(readLf(path.join(skillBase, "SKILL.md")));
const refs = [
  ["state-binding.md", "Reference: data-wcs binding syntax (state family)"],
  ["router-and-scaffold.md", "Reference: SPA routing and scaffold"],
  ["io-node-catalog.md", "Reference: I/O node catalog + signals quick reference"],
].map(([f, title]) =>
  `\n\n---\n\n# ${title}\n\n<!-- source: wcstack-skill/skills/wcstack-app/references/${f} -->\n\n`
  + readLf(path.join(skillBase, "references", f)),
);

const full = `# wcstack — complete authoring guide for LLMs

> Everything needed to generate correct wcstack (${tag}) apps: workflow, exact data-wcs
> syntax, the full wcs-* I/O node catalog with source-verified timing notes, and the
> silent-failure matrix. Generated from the wcstack-app skill (github.com/wcstack/wcstack-skill),
> whose content is verified against the wcstack monorepo at ${tag}.

Note: the guide below refers to three reference files (references/state-binding.md,
router-and-scaffold.md, io-node-catalog.md). All three are included IN THIS FILE after
the main guide — no external fetches are needed.

---

${skillMd}${refs.join("")}`;

writeFileSync(path.join(siteRoot, "llms.txt"), llms);
writeFileSync(path.join(siteRoot, "llms-full.txt"), full);
console.log(`[build-llms] wrote llms.txt (${llms.length} bytes) and llms-full.txt (${full.length} bytes) at ${tag}`);
