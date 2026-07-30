/**
 * Supabase retorna relacionamentos como array mesmo quando é 1:1 (join simples).
 * `pickOne` normaliza pra sempre pegar o primeiro (ou null).
 */
export function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}
