import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { mount, settle, fire } from "@wcstack/testing";
import { bootstrapState } from "@wcstack/state";
import { bootstrapFetch } from "@wcstack/fetch";
import { bootstrapStorage } from "@wcstack/storage";
import { bootstrapRouter } from "@wcstack/router";
import "../product-card.js";

// The page's <body>. Its <head> loads the packages from the CDN, which a test
// does not need: mount() registers the elements imported above.
const body = /<body>([\s\S]*)<\/body>/.exec(readFileSync("index.html", "utf8"))[1];

// Three products are enough to test with, and they never change.
const catalog = [
  { id: 1, name: "House Blend", category: "coffee", description: "Chocolate, caramel.", price: 14, stock: 12, icon: "☕" },
  { id: 4, name: "Sencha", category: "tea", description: "Fresh, grassy.", price: 12, stock: 20, icon: "🍵" },
  { id: 5, name: "Matcha", category: "tea", description: "Stone-ground.", price: 24, stock: 0, icon: "🍵" },
];

const names = () => [...app.root.querySelectorAll("product-card:not([hidden]) h3")].map((h) => h.textContent);
const card = (name) => [...app.root.querySelectorAll("product-card")].find((c) => c.textContent.includes(name));

let app;
beforeEach(async () => {
  localStorage.clear();
  vi.stubGlobal("fetch", async () => Response.json(catalog));
  app = await mount(body, { bootstrap: [bootstrapState, bootstrapFetch, bootstrapStorage, bootstrapRouter] });
  await vi.waitFor(() => expect(names()).toHaveLength(3));
});
afterEach(() => {
  app.unmount();
  vi.unstubAllGlobals();
});

describe("the shop", () => {
  it("shows the catalog", () => {
    expect(names()).toEqual(["House Blend", "Sencha", "Matcha"]);
  });

  it("adds to the cart, totals it and keeps it", async () => {
    fire(card("Sencha").querySelector("button"), "click");
    fire(card("Sencha").querySelector("button"), "click");
    await settle();
    expect(app.root.querySelector("dd.grand").textContent).toBe("$29.00");
    expect(JSON.parse(localStorage.getItem("little-roastery-cart"))).toEqual([{ id: 4, quantity: 2 }]);
  });

  it("does not sell what is sold out", () => {
    expect(card("Matcha").querySelector("button").disabled).toBe(true);
  });

  it("filters by search", async () => {
    const search = app.root.querySelector('input[type="search"]');
    search.value = "sen";
    fire(search, "input");
    await settle();
    expect(names()).toEqual(["Sencha"]);
  });

  it("opens a product page", async () => {
    await app.root.querySelector("wcs-router").navigate("/products/4");
    await vi.waitFor(() => expect(app.root.querySelector(".product-page h2")?.textContent).toBe("Sencha"));
  });
});
