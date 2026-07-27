// ----------------------------------------------------------------------------
// Matching de strings para reconhecer produtos a partir do nome.
// Usamos similaridade de bigramas (Sørensen–Dice).
// ----------------------------------------------------------------------------

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface Bigrammed {
  norm: string;
  bigrams: Map<string, number>;
  total: number;
}

export function toBigrammed(s: string): Bigrammed {
  const norm = normalize(s);
  const bigrams = new Map<string, number>();
  for (let i = 0; i < norm.length - 1; i++) {
    const bg = norm.slice(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
  }
  let total = 0;
  for (const v of bigrams.values()) total += v;
  return { norm, bigrams, total };
}

/** Similaridade Dice entre dois strings brutos. Ineficiente pra muitos-p/-muitos. */
export function similarity(a: string, b: string): number {
  return similarityPre(toBigrammed(a), toBigrammed(b));
}

/** Similaridade Dice entre dois Bigrammed pré-computados. Rápido em loop. */
export function similarityPre(a: Bigrammed, b: Bigrammed): number {
  if (a.norm === b.norm) return 1;
  if (a.norm.length < 2 || b.norm.length < 2) return 0;
  let intersect = 0;
  // itera no menor dos dois pra economizar
  const [small, big] = a.bigrams.size < b.bigrams.size ? [a, b] : [b, a];
  for (const [bg, count] of small.bigrams) {
    const other = big.bigrams.get(bg);
    if (other) intersect += Math.min(count, other);
  }
  return (2 * intersect) / (a.total + b.total);
}

export interface MatchCandidate {
  id: string;
  name: string;
  score: number;
}

export interface CatalogEntry {
  id: string;
  name: string;
  bg: Bigrammed;
}

/** Pré-computa bigramas de todos os produtos. Rode UMA vez antes de um loop grande. */
export function buildCatalog(
  products: Array<{ id: string; name: string }>
): CatalogEntry[] {
  return products.map((p) => ({ id: p.id, name: p.name, bg: toBigrammed(p.name) }));
}

/**
 * Legado — mantido pra compatibilidade. Usa `findMatchesFast` em loops grandes.
 */
export function findMatches(
  query: string,
  catalog: Array<{ id: string; name: string }>,
  opts: { top?: number; cutoff?: number } = {}
): MatchCandidate[] {
  const built = buildCatalog(catalog);
  return findMatchesFast(query, built, opts);
}

/** Versão otimizada — recebe o catálogo já bigramado. */
export function findMatchesFast(
  query: string,
  catalog: CatalogEntry[],
  opts: { top?: number; cutoff?: number } = {}
): MatchCandidate[] {
  const top = opts.top ?? 5;
  const cutoff = opts.cutoff ?? 0.4;
  const q = toBigrammed(query);

  // filtro rápido: só entra na conta se a normalização tem alguma sobreposição
  // (curto-circuita produtos totalmente distintos)
  const results: MatchCandidate[] = [];
  for (const p of catalog) {
    const score = similarityPre(q, p.bg);
    if (score >= cutoff) results.push({ id: p.id, name: p.name, score });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, top);
}
