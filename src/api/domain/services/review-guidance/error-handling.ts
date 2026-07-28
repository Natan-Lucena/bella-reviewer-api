// Adapted from the code-review skill's
// reference/cross-cutting/error-handling-principles.md.
export const ERROR_HANDLING_GUIDANCE = `
## Error handling review

### Core principles

1. **Never swallow an error.** Every caught error must be propagated, logged
   with a deliberate fallback, or cause a deliberate crash — an empty catch
   block that silently discards the error is always a bug worth flagging.
2. **Add context when handling an error.** A caught error re-thrown or logged
   as a bare "failed"/"error occurred" loses the information needed to debug
   it later — include what operation was being attempted and the relevant
   parameters.
3. **Prefer specific error types over one generic error.** A caller that
   needs to react differently to "not found" versus "invalid input" versus
   "downstream service unavailable" needs those to be distinguishable, not
   collapsed into one generic exception/error value.
4. **Fail fast.** Validate preconditions before doing expensive or
   side-effecting work, not after — catching an invalid state early is
   cheaper and clearer than discovering it mid-operation.
5. **Handle an error exactly once.** Pick one layer to own the decision (log
   it, wrap it, return it) rather than logging the same error at every layer
   it passes through on its way up — repeated logging of one failure makes
   logs noisy and can make one incident look like several.

### Anti-patterns to flag

- An empty catch block, or a catch block that only logs and continues as if
  nothing happened when the caller actually needed to know it failed.
- A catch clause broad enough to swallow errors that should have been
  handled differently (e.g. catching a generic base exception type when only
  one specific failure mode was expected).
- Re-throwing or wrapping an error without preserving the original
  error/cause — the new error loses the original stack trace and root cause.
- Using exceptions/thrown errors for expected, normal control flow instead
  of an explicit check or a typed result — reserve exceptions for genuinely
  exceptional conditions.
- Ignoring a returned error value or boolean success flag instead of
  checking it (relevant in languages/APIs that signal failure via a return
  value rather than an exception).

### Error layering

A healthy error hierarchy keeps infrastructure-level failures (a raw
I/O error, a raw network timeout, a raw database driver error) from leaking
unwrapped all the way up to application/business logic — they should be
caught and converted into a module-level error type at the boundary where
they're first caught, so that code higher up only ever needs to reason about
application-level error types.

### Logging alongside error handling

Match the log level to the actual severity: an error needing human
intervention is ERROR, an automatically-recovered condition is WARN, a
normal business event is INFO, and developer-only detail is DEBUG — flagging
a routine, expected condition logged at ERROR (or a real failure logged at
INFO) is worth a comment. Logs should carry structured context (relevant
fields), not just a free-text string. Logged data must never include
secrets, full PII, or unmasked sensitive fields, and any user-supplied string
written into a log should be treated as untrusted (sanitized) to avoid log
injection.

### Quick check

- Is there any catch block that does nothing, or only logs without a real
  handling decision?
- Does re-throwing/wrapping preserve the original cause?
- Is a raw infrastructure error (DB driver, HTTP client, filesystem)
  leaking unconverted into business logic or all the way to the API
  response?
- Is the same failure likely to get logged more than once as it propagates?
`.trim();
