// Substitui o Result<T, E> que viria de @wave-telecom/framework no template
// original (ver refinamento.md, Gap 7 — pacote interno da empresa não entra
// no TCC). Convenção de código própria, mantendo o mesmo padrão de uso.

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T, E = never>(value: T): Result<T, E> {
  return { ok: true, value };
}

export function err<E, T = never>(error: E): Result<T, E> {
  return { ok: false, error };
}
