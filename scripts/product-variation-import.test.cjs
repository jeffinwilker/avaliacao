const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Run the existing TypeScript modules without adding a test runtime dependency.
const cache = new Map();
function loadTs(name) {
  if (cache.has(name)) return cache.get(name).exports;
  const filename = path.join(__dirname, "../apps/admin/src", name.replace("@/", "") + ".ts");
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  cache.set(name, mod);
  new Function("require", "module", "exports", output)(
    (id) => id.startsWith("@/") ? loadTs(id) : require(id), mod, mod.exports
  );
  return mod.exports;
}
const { buildColorImportPreview: preview } = loadTs("@/lib/product-color-import");
const { syncProductImportRow: sync } = loadTs("@/lib/product-variation-sync");
const { splitProductVariationName, isSummarizedSkuSheet } = loadTs("@/lib/product-import-format");

function catalog(hasColor = false) {
  return [{
    id: 10, name: { pt: "Camiseta" },
    attributes: hasColor ? [{ pt: "Tamanho" }, { pt: "Cor" }] : [{ pt: "Tamanho" }],
    variants: [101, 102].map((id, index) => ({
      id, sku: `OLD-${id}`, price: "79.90", stock: 5, weight: "0.25",
      values: hasColor ? [{ pt: index ? "M" : "P" }, { pt: "Azul" }] : [{ pt: index ? "M" : "P" }],
    })),
  }];
}
function input(overrides = {}) {
  return { rowNumber: 2, externalProductId: "10", productName: "", sku: "", color: "", newSku: "NEW-P", variantId: "101", ...overrides };
}
function mockRequests(t, failSku = false) {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const request = { path: new URL(url).pathname, method: init.method, body: JSON.parse(init.body) };
    requests.push(request);
    if (failSku && request.body.sku) return new Response("rejected", { status: 422 });
    return new Response("{}", { status: 200 });
  });
  return requests;
}

test("all variants of one product get their own SKU and only SKU is sent", async (t) => {
  const products = catalog(true);
  const rows = preview([input(), input({ rowNumber: 3, variantId: "102", newSku: "NEW-M" })], products);
  assert.deepEqual(rows.map((row) => row.status), ["ready", "ready"]);
  const requests = mockRequests(t);
  for (const row of rows) await sync("store", "test-token", products[0], row);
  assert.deepEqual(requests, [
    { path: "/v1/store/products/10/variants/101", method: "PUT", body: { sku: "NEW-P" } },
    { path: "/v1/store/products/10/variants/102", method: "PUT", body: { sku: "NEW-M" } },
  ]);
  assert.equal(products[0].variants[0].price, "79.90");
  assert.equal(products[0].variants[1].stock, 5);
});

test("existing color is ignored while SKU still updates", () => {
  const [row] = preview([input({ color: "Vermelho" })], catalog(true));
  assert.equal(row.status, "ready");
  assert.equal(row.updateColor, false);
  assert.equal(row.updateSku, true);
});

test("adding a color across several SKU rows adds the attribute only once", async (t) => {
  const products = catalog();
  const rows = preview([input({ color: "Azul" }), input({ rowNumber: 3, variantId: "102", newSku: "NEW-M", color: "Azul" })], products);
  const requests = mockRequests(t);
  for (const row of rows) await sync("store", "test-token", products[0], row);
  assert.equal(requests.length, 3);
  assert.equal(requests.filter((request) => request.body.attributes).length, 1);
  assert.deepEqual(requests[0].body, {
    attributes: [{ pt: "Tamanho" }, { pt: "Cor" }],
    variants: [{ id: 101, values: [{ pt: "P" }, { pt: "Azul" }] }, { id: 102, values: [{ pt: "M" }, { pt: "Azul" }] }],
  });
});

test("duplicate new SKUs across different variants are blocked", () => {
  const rows = preview([input(), input({ rowNumber: 3, variantId: "102", newSku: "new-p" })], catalog());
  assert.deepEqual(rows.map((row) => row.status), ["blocked", "blocked"]);
});

test("SKU already owned anywhere in the catalog is blocked, even in the same import", () => {
  const products = catalog();
  const rows = preview([input({ newSku: "OLD-102" }), input({ rowNumber: 3, variantId: "102", newSku: "OLD-101" })], products);
  assert.deepEqual(rows.map((row) => row.status), ["blocked", "blocked"]);
  products.push({ id: 20, name: { pt: "Outro" }, variants: [{ id: 201, sku: "USED" }] });
  assert.equal(preview([input({ newSku: "USED" })], products)[0].status, "blocked");
});

test("conflicting SKUs on the same variant are blocked; identical rows are deduplicated", () => {
  assert.deepEqual(preview([input(), input({ rowNumber: 3, newSku: "OTHER" })], catalog()).map((row) => row.status), ["blocked", "blocked"]);
  assert.deepEqual(preview([input(), input({ rowNumber: 3 })], catalog()).map((row) => row.status), ["ready", "duplicate"]);
});

test("SKU match, exact variant options, standalone variant ID and manual choice resolve correctly", () => {
  for (const overrides of [
    { variantId: "", sku: "OLD-102" },
    { variantId: "", variation: "M" },
    { variantId: "", variation: "Tamanho: M" },
    { externalProductId: "", variantId: "102" },
    { variantId: "102", variation: "wrong", sku: "stale" },
  ]) {
    const [row] = preview([input(overrides)], catalog());
    assert.equal(row.status, "ready");
    assert.equal(row.variantExternalId, "102");
    assert.equal(row.currentSku, "OLD-102");
  }
});

test("an ambiguous product with several variants requires a choice", () => {
  const [row] = preview([input({ variantId: "" })], catalog());
  assert.equal(row.status, "review");
  assert.equal(row.variantOptions.length, 2);
});

test("missing, malformed or foreign IDs never fall back to another target", () => {
  for (const overrides of [
    { externalProductId: "999", sku: "OLD-101", productName: "Camiseta" },
    { externalProductId: "10oops", productName: "Camiseta" },
    { variantId: "101oops" }, { variantId: "999" },
  ]) assert.equal(preview([input(overrides)], catalog())[0].status, "review");
});

test("a product with a single virtual variant needs no variant selector", () => {
  const products = [{ id: 10, name: { pt: "Perfume" }, attributes: [], variants: [{ id: 101, sku: null, values: [] }] }];
  const [row] = preview([input({ variantId: "", newSku: "000001" })], products);
  assert.equal(row.status, "ready");
  assert.equal(row.newSku, "000001");
});

test("blank SKU preserves the SKU; completely blank operations are ignored", () => {
  const [row] = preview([input({ newSku: "", color: "Azul" })], catalog());
  assert.equal(row.status, "ready");
  assert.equal(row.updateSku, false);
  assert.equal(preview([input({ newSku: "" })], catalog())[0].status, "unchanged");
});

test("color-only legacy import still ignores all existing colors and blocks conflicting new colors", () => {
  assert.equal(preview([input({ newSku: "", color: "Vermelho" })], catalog(true))[0].status, "unchanged");
  assert.deepEqual(preview([input({ color: "Azul" }), input({ rowNumber: 3, variantId: "102", color: "Vermelho", newSku: "NEW-M" })], catalog()).map((row) => row.status), ["blocked", "blocked"]);
});

test("successful color plus failed SKU is reported and can be retried without repeating color", async (t) => {
  const products = catalog();
  const source = input({ color: "Azul" });
  const [row] = preview([source], products);
  mockRequests(t, true);
  await assert.rejects(sync("store", "test-token", products[0], row), /Cor salva\. SKU pendente/);
  const [retry] = preview([source], products);
  assert.equal(retry.updateColor, false);
  assert.equal(retry.updateSku, true);
  t.mock.restoreAll();
  const requests = mockRequests(t);
  await sync("store", "test-token", products[0], retry);
  assert.equal(requests.length, 1);
  assert.equal(preview([source], products)[0].status, "unchanged");
});

test("invalid SKU is rejected without truncating it", () => {
  assert.equal(preview([input({ newSku: "x".repeat(161) })], catalog())[0].status, "blocked");
  assert.equal(preview([input({ newSku: "x\ny" })], catalog())[0].status, "blocked");
});

test("blocked rows cannot make remote changes", async (t) => {
  const [row] = preview([input({ newSku: "OLD-102" })], catalog());
  const requests = mockRequests(t);
  await assert.rejects(sync("store", "test-token", catalog()[0], row), /não está pronta/);
  assert.equal(requests.length, 0);
});

test("summarized SKU/Name/Color sheet is recognized without changing legacy SKU matching", () => {
  const names = ["Camiseta \u2014 Tamanho: P | Cor: Azul"];
  assert.equal(isSummarizedSkuSheet(["SKU", "Nome", "Cor"], names), true);
  assert.equal(isSummarizedSkuSheet(["SKU", "Nome", "Cor"], ["Camiseta"]), false);
  assert.equal(isSummarizedSkuSheet(["SKU atual", "Nome", "Cor"], names), false);
  assert.equal(isSummarizedSkuSheet(["SKU", "Nome", "Cor", "Novo SKU"], names), false);
});

test("embedded attributes identify a variant even when Nuvemshop attribute order differs", () => {
  const [row] = preview([input({ externalProductId: "", variantId: "", productName: "Camiseta \u2014 Cor: Azul | Tamanho: M" })], catalog(true));
  assert.equal(row.status, "ready");
  assert.equal(row.productName, "Camiseta");
  assert.equal(row.variantExternalId, "102");
});

test("named options retain slashes in values and unknown or ambiguous options require review", () => {
  const products = catalog(true);
  for (const variant of products[0].variants) variant.values[1].pt = "Branco / Rosa";
  const [row] = preview([input({ variantId: "", variation: "Cor: Branco / Rosa / Tamanho: P" })], products);
  assert.equal(row.status, "ready");
  assert.equal(row.variantExternalId, "101");
  assert.equal(preview([input({ variantId: "", variation: "Cor: Branco / Rosa" })], products)[0].status, "review");
  assert.equal(preview([input({ variantId: "", variation: "Quantidade: Kit 6" })], products)[0].status, "review");
});

test("ordinary product names are not split and duplicate product names require a choice", () => {
  assert.deepEqual(splitProductVariationName("Camiseta - algodao"), { productName: "Camiseta - algodao", variation: "" });
  assert.deepEqual(splitProductVariationName("Camiseta \u2014 nova colecao"), { productName: "Camiseta \u2014 nova colecao", variation: "" });
  const products = catalog(true);
  products.push({ ...products[0], id: 20, variants: [{ id: 201, values: [{ pt: "P" }, { pt: "Azul" }] }] });
  const [row] = preview([input({ externalProductId: "", variantId: "", productName: "Camiseta \u2014 Tamanho: P | Cor: Azul" })], products);
  assert.equal(row.status, "review");
  assert.equal(row.productExternalId, null);
});
