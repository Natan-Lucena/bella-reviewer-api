// Adapted from the code-review skill's reference/code-quality-universal.md.
export const CODE_QUALITY_GUIDANCE = `
## Code quality review

- **Reuse before reinvention**: a newly-written utility/helper that looks
  like it duplicates something an adjacent file or shared module already
  provides is worth flagging — ask whether an existing utility should be
  reused or extended instead.
- **Parameter sprawl**: a function with four or more parameters, especially
  several of the same primitive type in a row (dates, strings, booleans) that
  are easy for a caller to pass in the wrong order by mistake — prefer a
  single options object/parameter struct.
- **Leaky abstractions**: a function or interface whose return type or usage
  forces the caller to know the concrete implementation behind it — e.g.
  returning a raw ORM entity instead of a domain type, or a UI component
  that receives a raw external-API response shape instead of something
  already mapped to the domain's own model.
- **Stringly-typed code**: a magic string literal used where an existing
  enum/union/constant already models the same set of values — a typo in the
  literal won't be caught by the type system the way a wrong enum member
  would be.
- **Deeply nested conditionals**: a ternary chain two or more levels deep, or
  if/else nesting three or more levels deep — usually clearer as a lookup
  table/map, or restructured with early returns/guard clauses.
- **Copy-paste variants**: two or more near-identical blocks of code that
  differ only by a variable, a URL, or a literal string — a strong candidate
  for extracting one parameterized shared function.
- **No-op updates**: an update/write operation issued unconditionally even
  when nothing actually changed — this wastes work and can trigger unwanted
  side effects (a bumped \`updatedAt\` timestamp, an unnecessary webhook or
  cache invalidation) even when the values are identical.
- **Time-of-check to time-of-use (TOCTOU)**: checking a condition and then
  acting on it in a separate step, with any gap between them (even just an
  \`await\`) — the checked condition can become stale before the action runs.
  Prefer an atomic operation, a transaction, or a lock; when the API allows
  it, prefer "attempt the operation and handle the failure" over "check,
  then attempt."
- **Overly broad reads**: loading an entire file/table/collection into
  memory just to use a small subset of it — push filtering down to the
  database/storage layer and support pagination instead.
- **Redundant or derivable state**: storing a value that could always be
  computed from other already-available state (e.g. a stored \`fullName\`
  kept alongside \`firstName\`/\`lastName\`, or a cached count kept alongside
  the actual collection) — this creates a second source of truth that can
  drift out of sync unless there's a clear, deliberate invalidation strategy
  already in place for it.

### Quick check

- Does this diff introduce a utility that likely already exists nearby?
- Any function taking 4+ parameters, several of the same type in a row?
- Any magic string that duplicates an existing enum/constant's values?
- Any write/update issued without first checking whether anything changed?
- Any check-then-act sequence with a gap where the checked state could go
  stale?
`.trim();
