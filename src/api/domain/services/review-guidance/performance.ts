// Adapted from the code-review skill's reference/performance-review-guide.md
// and reference/cross-cutting/n-plus-one-queries.md. Dropped frontend-specific
// Core Web Vitals metric tables and the tool-recommendation tables (Lighthouse,
// pganalyze, etc.) — kept the underlying, framework-agnostic concepts.
export const PERFORMANCE_GUIDANCE = `
## Performance review

### Algorithmic complexity

Watch for avoidable superlinear complexity: a nested loop searching one
collection for matches in another (O(n²)) where a Set/Map lookup would make
it O(n); \`.includes()\`/linear search called inside a loop, which turns an
apparently-linear function quadratic; repeated linear \`.find()\`-style
lookups where building a Map once up front would make each lookup O(1). This
matters most when the collection size is user/data-controlled and can grow
without bound in production even if test fixtures are small.

### Database access

**N+1 queries**: one query to fetch a list of N records, then N further
queries (typically one per record to fetch a related entity) — instead of a
single join/eager-load or a single batched \`WHERE id IN (...)\` query. This
is one of the most common real-world performance bugs and scales invisibly
in development (small N) into a serious production problem (large N). Fixes,
in order of preference: eager load / join for one-to-one and one-to-many
relations fetched together; batch fetch via \`WHERE id IN (...)\` for larger
or many-to-many sets; a DataLoader-style batching layer (collect all needed
IDs across a request, issue one batched query) especially useful when
resolvers/handlers are invoked independently per item (e.g. GraphQL field
resolvers).

Other database concerns: an index on any column used in a WHERE/JOIN/ORDER
BY that's queried on a non-trivial table; avoid wrapping an indexed column in
a function or using a leading wildcard \`LIKE '%x'\`, either of which defeats
the index; avoid \`SELECT *\` when only a few columns are needed
(projection); always paginate a query that can return an unbounded number of
rows from a large table; prefer one batched query over issuing the same
query in a loop.

### API-level performance

Pagination with an enforced maximum page size (an unbounded \`limit\` lets a
client request the entire table in one call); caching for hot,
infrequently-changing reads, with an explicit TTL/invalidation strategy —
not a cache with no expiry; only return fields the client actually needs
rather than the entire entity; rate limiting to prevent one caller from
degrading the service for everyone else.

### Memory

Watch for realistic memory-leak sources: an event listener/subscription
registered without ever being removed on cleanup/teardown; a timer/interval
started without a corresponding clear; a closure that captures and retains a
large object longer than needed; an open connection/subscription
(WebSocket, stream) with no corresponding close path. Each of these should
have a visible, matching cleanup path in the same diff that adds them.

### Low-level efficiency anti-patterns

Loop-invariant work repeated on every iteration (e.g. re-reading a config
file or re-computing a constant value inside a loop) instead of hoisted
outside it; independent asynchronous operations awaited one at a time in
sequence when they could run concurrently (a \`Promise.all\`-equivalent);
heavy computation placed at module/import time so it runs (and blocks) on
every cold start rather than lazily on first use; an in-memory cache, queue,
or map with no maximum size or eviction policy, which grows unbounded as
long as the process runs — prefer a bounded/LRU structure with an explicit
limit.

### Quick check

- Any nested loop or repeated \`.includes()\`/\`.find()\` over a collection
  whose size isn't small and fixed?
- Any query issued inside a loop, or a list endpoint with no pagination?
- Any newly-added listener, timer, subscription, or open connection without
  a visible corresponding cleanup?
- Any unbounded in-memory cache/queue introduced by this diff?
`.trim();
