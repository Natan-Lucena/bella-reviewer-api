// In-house Result<T, E> convention, kept as project code style instead of
// an external framework dependency (see refinamento.md, Gap 7). Naming
// (success/failure) matches ../../../../arquitetura.md's convention.

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function success<T, E = never>(value: T): Result<T, E> {
  return { ok: true, value };
}

export function failure<E, T = never>(error: E): Result<T, E> {
  return { ok: false, error };
}
