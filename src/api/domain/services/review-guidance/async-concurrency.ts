// Adapted from the code-review skill's
// reference/cross-cutting/async-concurrency-patterns.md. Dropped the
// per-language concurrency-model comparison table (goroutines vs Tokio vs
// TPL, etc.) since the underlying pitfalls and best practices are the
// language-agnostic part.
export const ASYNC_CONCURRENCY_GUIDANCE = `
## Async and concurrency review

Apply this whenever a diff introduces shared mutable state accessed from more
than one concurrent execution path (parallel requests, background jobs,
timers, event handlers), or spawns a concurrent task/goroutine/thread.

### Common pitfalls

- **Race conditions**: a concurrent read-modify-write on shared state (a
  counter, a balance, a cache entry) with no lock/atomic operation/actor
  boundary protecting it — two concurrent callers can both read the old
  value before either writes the new one, silently dropping one update.
- **Deadlock**: two or more executions acquiring the same set of locks in
  different orders, so each ends up waiting on a lock the other holds.
  Prevent via a consistent, codebase-wide lock-acquisition order, or by
  avoiding nested lock acquisition altogether.
- **Starvation**: a low-priority task that's technically eligible to run but
  never actually gets scheduled because higher-priority work keeps
  preempting it.
- **Leaked concurrent tasks**: a spawned background task/goroutine/promise
  that isn't guaranteed to be awaited, cancelled, or otherwise bounded to its
  parent's lifetime — if the parent scope ends (a request completes, a
  component unmounts) before the child finishes, the child keeps running
  unobserved, potentially forever.
- **Blocking the async runtime**: a synchronous, CPU- or I/O-bound call
  executed directly inside an async function/handler — this stalls the
  entire event loop/runtime for every other concurrent task, not just the
  caller. Blocking work needs to be offloaded to a thread pool or a real
  async I/O equivalent.

### Best practices to expect

- **Structured concurrency**: a spawned child task's lifetime is explicitly
  bound to its parent scope, so the parent finishing (or being cancelled)
  automatically cancels its children — rather than a "fire and forget" spawn
  with no reference kept to it.
- **Cancellation propagation**: a cancellation signal (token/context) that
  actually reaches every spawned child, not just the outermost call.
- **Backpressure**: a bounded buffer/queue/channel between a producer and a
  slower consumer, so a fast producer can't grow memory usage without limit.
- **Concurrency limiting**: a semaphore or worker-pool cap on the number of
  simultaneous in-flight operations (e.g. concurrent outbound HTTP calls or
  DB connections), so a burst of work can't exhaust a shared resource.

### Quick check

- Is any shared mutable state written from more than one concurrent path
  without a lock/atomic/actor boundary?
- Is a spawned concurrent task ever left un-awaited/un-cancelled if its
  parent finishes first?
- Is there any synchronous blocking call sitting inside async code?
- Do independent async operations that could run concurrently instead run
  one at a time for no reason?
`.trim();
