// Adapted from the code-review skill's reference/security-review-guide.md and
// reference/cross-cutting/{sql-injection-prevention,xss-prevention}.md.
// Condensed to language-agnostic concepts and dropped the tool-recommendation
// tables, which aren't actionable inside a single LLM prompt.
export const SECURITY_GUIDANCE = `
## Security review

### Authentication and authorization

Authentication: passwords hashed with a slow, salted algorithm (bcrypt/argon2
family), not a fast general-purpose hash; a real complexity/lockout policy;
a reset flow that can't be hijacked (single-use, expiring, unguessable
token); MFA for sensitive operations; session tokens that are
cryptographically random, not predictable; sessions that actually expire.

Authorization: every request that touches protected data or actions must be
checked, not just the ones behind an obviously "protected" route; least
privilege by default; no path by which a lower-privilege user can reach a
higher-privilege action; watch specifically for IDOR — an endpoint that
accepts a resource ID and fetches/mutates it without checking that the
resource belongs to (or is otherwise permitted for) the requesting user. A
UUID instead of a sequential ID makes the resource harder to *guess*, but is
not itself an authorization check.

JWTs: must be signed with a real secret or asymmetric key, carry an
expiration, and ideally an issuer/audience; the verifying side must always
run signature verification — decoding a JWT's payload without verifying its
signature means anyone can forge one.

### Injection

**SQL injection** — rule #1: always use parameterized queries/prepared
statements, never build a query by concatenating or interpolating user input
into SQL text. This still holds when using an ORM: every ORM has a raw-SQL
escape hatch (a \`text()\`/\`.extra()\`/\`RawSQL\`/\`createNativeQuery\`/
\`FromSqlRaw\`/\`$queryRawUnsafe\`-style function), and string-interpolating
user input into that escape hatch is exactly as vulnerable as building raw
SQL by hand — using an ORM is not automatically safe. Table/column names
(dynamic identifiers) can never be parameterized by a placeholder — if a
query needs a dynamic identifier, it must be validated against an explicit
whitelist, never taken from user input directly.

**XSS** — three variants: reflected (input from a request immediately
echoed into the response), stored (input persisted and rendered later, e.g.
a comment field), DOM-based (client-side script writes untrusted data into
the DOM). Rule #1: rely on the framework's automatic output escaping for
anything rendered as HTML, and treat every explicit escape hatch that
bypasses it (\`dangerouslySetInnerHTML\`, \`v-html\`,
\`bypassSecurityTrustHtml\`, \`{@html}\`, \`mark_safe\`, manual string-built
HTML) as needing its own justification and its own sanitization pass.
Input validation at the boundary is not a substitute for output encoding at
render time — validation can be bypassed or incomplete, output encoding is
the actual last line of defense. A Content-Security-Policy header is a
strong defense-in-depth layer, but \`unsafe-inline\`/\`unsafe-eval\`/wildcard
\`default-src\` in that policy defeats most of its value.

**Command injection**: never build a shell command by concatenating or
interpolating user input into a string passed to a shell; use the
array-argument form of the process-execution API (argument list, not a
single shell string) so the input can never be reinterpreted as shell
syntax.

**SSRF**: never let a server-side component fetch a URL supplied by the user
without validating it against an allowlist and explicitly rejecting
loopback/link-local/private-IP destinations.

### CSRF

State-changing requests need a CSRF token that's generated per session/
request and validated server-side, or an equivalent framework-provided
protection; a \`SameSite\` cookie attribute is a good additional layer, not a
full replacement on its own.

### Data protection

No secrets (API keys, passwords, connection strings) in source code — they
belong in environment variables or a secrets manager. Sensitive data
encrypted at rest and in transit. PII handled deliberately, never logged.
Errors returned to a client should be generic/non-leaky (no stack traces,
internal paths, or query text); the full detail belongs in server-side logs
only.

### API-level protections

Rate limiting, especially stricter limits on authentication endpoints;
restrictive CORS (never allow \`*\` origin together with credentialed
requests); standard security headers where the framework supports them
(CSP, HSTS, X-Content-Type-Options, X-Frame-Options).

### Cryptography

Use established, vetted algorithms only — never a hand-rolled cipher or
hash. Use a cryptographically secure random source for anything
security-sensitive (tokens, IDs used as secrets) — never a general-purpose
\`random()\`/\`Math.random()\`-style function for that purpose.

### Dependencies and logging

Dependencies should be audited for known vulnerabilities and lock files
committed. Logs must never contain passwords, tokens, full card numbers, or
other sensitive fields (mask them); user input written into a log should be
sanitized to prevent log injection; security-relevant events (login
attempts, permission changes) are worth logging deliberately.

### Severity guidance specific to security findings

An immediately exploitable vulnerability or active data exposure is
**critical**. A real vulnerability that requires specific conditions to
exploit is **high**. A defense-in-depth gap (present but not itself
directly exploitable) is **medium**. A best-practice deviation with no
concrete exploit path is **low**.
`.trim();
