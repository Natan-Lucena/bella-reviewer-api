// Adapted from the code-review skill's reference/common-bugs-checklist.md —
// kept only the Universal Issues, SQL, API Design, and Testing sections,
// which are concern-based rather than language-based. Every per-language
// section (TypeScript/JavaScript, React, Vue, Python, Rust, Go, Java, PHP,
// Ruby, Swift, C, C++, ...) from the source was cut.
export const COMMON_BUGS_GUIDANCE = `
## Common bugs checklist

### Logic errors

Off-by-one errors in loop bounds or slicing; inverted or incomplete boolean
logic (check De Morgan's law was applied correctly when negating a compound
condition); a missing null/undefined/None check before dereferencing a value
that can legitimately be absent; a race condition between two operations
that are assumed to be atomic but aren't; a comparison operator that's
almost certainly wrong for the intent (\`<\` vs \`<=\`, \`==\` vs a
deep/identity comparison where one was needed); integer overflow/underflow
on a value that can grow large or go negative; comparing floating-point
values for exact equality instead of within a tolerance.

### Resource management

A connection, file handle, or subscription opened but not guaranteed to be
closed/released on every exit path (including error paths); an event
listener or timer registered without a matching removal/clear — each of
these is a leak that compounds over the process's lifetime.

### Error handling

Covered in depth separately — in short: empty catch blocks, overly generic
exception handling that masks a more specific failure, an error path that
never propagates the failure to the caller, the wrong error type thrown for
the situation, a missing \`finally\`/cleanup block for something that must
run regardless of success or failure.

### SQL

A query built by string concatenation/interpolation of user input (SQL
injection); a missing index on a column that's actually filtered or joined
on; \`SELECT *\` where only specific columns are needed; an N+1 query
pattern; a query against a large table with no \`LIMIT\`/pagination; a
\`= NULL\` comparison where \`IS NULL\` was needed (in SQL, \`NULL\`
comparisons with \`=\` never match); a multi-step write that should be
wrapped in a transaction but isn't, risking a partial update if one step
fails; the wrong JOIN type for the intent (an INNER JOIN silently dropping
rows that a LEFT JOIN would have kept, or vice versa); collation/case-
sensitivity assumptions that don't hold across environments; naive
timestamp handling that ignores timezone or DST.

### API design

Inconsistent resource/endpoint naming; using a non-idempotent HTTP method
for an operation that should be idempotent (or vice versa); a list endpoint
with no pagination; an HTTP status code that doesn't match the actual
outcome (e.g. 200 on a validation failure); missing rate limiting on a
public or expensive endpoint; input validation that only exists on the
client, with the server trusting whatever it receives.

### Testing

A test that asserts on internal implementation details rather than
observable behavior, so it breaks on harmless refactors; missing coverage
for the actual edge cases (empty input, boundary values, error paths), with
only the happy path tested; a flaky/non-deterministic test (depends on
timing, ordering, or real wall-clock time); a test that talks to a real
external dependency instead of a test double, making it slow and
environment-dependent; no negative/error-case tests at all; test setup so
complex that the test itself is hard to trust.
`.trim();
