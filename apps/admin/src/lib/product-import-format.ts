export function parseNamedVariation(value: string): Array<{ name: string; value: string }> | null {
  const parts = value.split(/\s*\|\s*|\s+\/\s+(?=[^:|/]+:)/);
  const result: Array<{ name: string; value: string }> = [];
  const names = new Set<string>();
  for (const part of parts) {
    const match = part.match(/^([^:]+):\s*(.+)$/);
    if (!match) return null;
    const name = match[1].trim();
    const option = match[2].trim();
    const key = normalizeOption(name);
    if (!name || !option || names.has(key)) return null;
    names.add(key);
    result.push({ name, value: option });
  }
  return result.length ? result : null;
}

export function splitProductVariationName(value: string): { productName: string; variation: string } {
  const match = value.match(/^(.*)\s+[\u2013\u2014]\s+(.+)$/);
  if (!match || !match[1].trim() || !parseNamedVariation(match[2])) {
    return { productName: value.trim(), variation: "" };
  }
  return { productName: match[1].trim(), variation: match[2].trim() };
}

export function isSummarizedSkuSheet(headers: string[], names: unknown[]): boolean {
  const normalized = headers.map(normalizeOption);
  return normalized.length === 3 && ["sku", "nome", "cor"].every((name) => normalized.includes(name)) &&
    names.some((name) => typeof name === "string" && Boolean(splitProductVariationName(name).variation));
}

export function normalizeOption(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}
