// Writes the copy of the shop that GitHub Pages serves, into docs/.
// On a project site the shop lives at /<repository>/, not at /, so the copy gets that base.
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";

const base = "/little-roastery/"; // "/" + your repository's name + "/"

const html = readFileSync("index.html", "utf8").replace('<base href="/">', `<base href="${base}">`);
mkdirSync("docs", { recursive: true });
writeFileSync("docs/index.html", html);
// GitHub Pages answers a path it has no file for (/little-roastery/products/2) with 404.html:
// the same page, so the router reads the URL and shows the product.
writeFileSync("docs/404.html", html);
copyFileSync("product-card.js", "docs/product-card.js");
console.log(`docs/ written for ${base}`);
