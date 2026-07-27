# CLAUDE.md

Guidance for Claude Code (or any AI assistant) working in this repository. This file
describes conventions already established in this codebase — follow them without
re-deriving or re-litigating them from scratch each session.

## Project

Backend of an AI-assisted code review platform (TCC/thesis project), built with
Node.js, TypeScript, Express, Prisma and Postgres. This repository is
**self-contained**: it must only reference its own context (this `backend/` folder).
See "Repo hygiene" below — this is a hard rule, not a style preference.

Feature work is driven by a PRD-by-PRD process (specs live outside this repo, in a
sibling planning folder used only for day-to-day work between the user and the
assistant). Each PRD becomes one feature branch and one PR — see "Git & PR workflow."

## Architecture

Clean Architecture / DDD, organized as:

```
src/
  api/
    domain/
      entities/       # domain entities — private constructor, readonly fields
      ports/           # provider-agnostic interfaces (LlmProviderPort, ScmAdapterPort, ...)
      repository/      # repository interfaces (contracts only, no Prisma)
      services/        # domain services shared across use cases (assertRepoOwnership)
    application/
      use-cases/<feature>/   # one folder per use case
      schemas/               # Zod validation schemas, one file per endpoint
      container/
        factories/           # UseCaseFactory — centralized DI
        routes/              # <Name>Router classes
        middlewares/         # authMiddleware, etc.
    infraestructure/   # concrete *RepositoryImpl (Prisma) — ONLY place fromPersistence() is called
    integration/<provider>/  # concrete external service implementations (gemini/, github/, ...)
  shared/
    core/             # Result<T,E>, BaseController, Uuid, formatZodError
    infra/            # crypto, auth (session tokens), database (Prisma client)
```

Dependency direction is inward: `domain/` knows nothing about `application/`,
`infraestructure/`, or `integration/`. Ports and repository interfaces are the only
things the domain exposes outward; concrete implementations live in
`infraestructure/`/`integration/` and are wired together only in
`application/container/`.

## Entities

- Private constructor; all fields `public readonly`.
- Ids are a `Uuid` value object (`shared/core/uuid.ts`): `Uuid.random()` for new
  entities, `new Uuid(value)` (validates 8-4-4-4-12 hex format) when reconstructing.
  Foreign keys stay plain strings.
- **Creating a new entity**: a static factory, `Entity.create(props)`, generates the
  id and timestamps.
- **Reconstructing from storage**: a static factory, `Entity.fromPersistence(props)`.
  This method is called **only** from `*RepositoryImpl` classes in
  `src/api/infraestructure/`. Never call it from a use case — see "Layering rule"
  below.
- **Changing an existing entity's state**: an instance method that returns a *new*
  entity instance expressing the actual domain operation — e.g.
  `credential.rotateSecret(encryptedSecret)`, `repoConfig.update(patch)`. Use cases
  must always go through a method like this, never reconstruct an entity manually.
- `toJSON()` builds the API-facing shape and never includes secrets
  (`encryptedSecret`, `secretHash`, `passwordHash`, etc.) — only whether something is
  configured.
- No Prisma-level `@default`/`@updatedAt` anywhere in `prisma/schema.prisma` — every
  value, including ids and timestamps, is set explicitly by the entity and passed
  through as-is by the `*RepositoryImpl`. The database never invents a value.

### Layering rule: no `fromPersistence()` outside `infraestructure/`

`fromPersistence()` reconstructs an entity from a raw persistence row — it is a
repository-implementation concern. The application layer (use cases) must only speak
in domain terms: entities in, entities out. If a use case needs to "patch" an
existing entity, add a domain method to the entity for that transition instead of
calling `fromPersistence()` with a mix of old and new field values.

This is also enforced structurally: entity constructors are `private`, so
`new Entity(...)` does not compile outside the entity's own file. The only way to get
an instance is `create()`, `fromPersistence()` (repository layer only), a domain
transition method, or a repository read.

## Use cases

- One class per use case, one file per class: `<name>-use-case.ts`, folder
  `application/use-cases/<feature>/`.
- Single public method: `async execute(params): Promise<Result<T, E>>`.
- Constructor takes repository **interfaces** via constructor injection, never
  concrete implementations.
- `Result<T, E>` (`shared/core/result.ts`, `success()`/`failure()`) for operations
  that can fail in an expected way (validation, not-found, business rules). Reserve
  thrown exceptions for truly unexpected failures.
- `E` is always a union of string literals declared next to the use case — never an
  exception class. The controller's `switch (result.error)` maps each literal to an
  HTTP status, and that same literal becomes the `code` in the error envelope.
- Repo-ownership checks go through the shared `assertRepoOwnership(repoRepository,
  repoId, userId)` (`domain/services/`). It returns `null` for both "doesn't exist"
  and "exists but belongs to someone else" — the caller always maps `null` to a 404,
  **never** a 403, so as not to confirm a resource's existence to a non-owner.

## Controllers

- Extend `BaseController` (`shared/core/base-controller.ts`), implement only
  `protected async executeImpl(req, res)`.
- `execute()` (inherited) wraps `executeImpl` in try/catch — an unexpected thrown
  error always becomes a 500. Controllers never need their own try/catch for that.
- Response helpers (always use these, never call `res.status(...)` directly): `ok`
  (200), `created` (201), `accepted` (202), `noContent` (204), `clientError` (400),
  `unauthorized` (401), `forbidden` (403), `notFound` (404), `conflict` (409),
  `unprocessableEntity` (422), `tooMany` (429), `fail` (500). Every helper except
  `ok`/`created`/`accepted`/`noContent` takes `(res, code, message)`.
- Error envelope: `{ error: { code, message } }`. `code` is a stable,
  machine-readable snake_case identifier (frontend branches on it); `message` may be
  in Portuguese since it can be shown directly to the end user — **the one
  exception** to "identifiers/comments/code are English."
- Standard flow inside `executeImpl`:
  1. `schema.safeParse(req.body)` (or `req.params`/`req.query`); on failure,
     `return this.clientError(res, "validation_error", formatZodError(validation.error))`.
  2. `await this.useCase.execute(...)`.
  3. If `!result.ok`, `switch (result.error)` to the right HTTP helper; an unmapped
     `default` case does `throw new Error(result.error)`, converted to a 500 by
     `BaseController` — intentional defensive coding for when a use case's error
     union grows and a controller isn't updated to match.
  4. If ok, call the matching 2xx helper with `result.value.toJSON()` (or a
     purpose-built shape, e.g. login's `{ id, email }` without the token, since the
     token goes in the cookie).

## Validation

- Zod schemas live in `application/schemas/`, one file per endpoint — never inline in
  a use case or controller.
- `formatZodError(error: ZodError): string` (`shared/core/format-zod-error.ts`) maps
  **every** issue (not just the first) into one joined message string
  (`"path: message; path2: message2"`). Every controller that validates a request
  body reuses this — never read `validation.error.issues[0]` directly.

## Dependency injection & routing

- `UseCaseFactory` (`application/container/factories/use-cases-factory.ts`) is the
  single, centralized place that wires repository implementations into use cases:
  private `readonly` repository instances + one `make<X>UseCase()` method per use
  case. New use cases add a method here, not a new factory file.
- `<Name>Router` classes (`application/container/routes/`) hold a
  `public readonly router: Router` and a private `useCasesFactory = new UseCaseFactory()`,
  with each route inline-instantiating its controller from a `make*UseCase()` call:
  ```ts
  this.router.post("/:id/credentials/llm", authMiddleware, (req, res) =>
    new SetLlmCredentialController(this.useCasesFactory.makeSetLlmCredentialUseCase()).execute(req, res),
  );
  ```

## Auth & crypto

- Session: httpOnly, signed JWT cookie (`SESSION_SECRET`). `shared/infra/auth/session-token.ts`
  exports `signSessionToken`/`verifySessionToken`, `SESSION_COOKIE_NAME`,
  `SESSION_MAX_AGE_MS`. `authMiddleware` verifies the cookie and sets `req.userId`.
  Cookie flags: `secure: true` + `sameSite: "none"` in production (frontend/backend
  are different origins), relaxed to `sameSite: "lax"` + non-secure elsewhere (local
  dev over plain HTTP has no HTTPS).
- Reversible secrets (Gemini API key, GitHub PAT): AES-256-GCM via `encrypt`/`decrypt`
  (`shared/infra/crypto/encryption.ts`). Storage format:
  `base64(iv[12] + authTag[16] + ciphertext)`.
- Irreversible secrets (action token hash): SHA-256 `hash`/`verifyHash`
  (`shared/infra/crypto/hashing.ts`), constant-time comparison.
- `master-key.ts` validates `MASTER_KEY` decodes to exactly 32 bytes **at import
  time** — fail fast at startup, never on the first `encrypt()`/`decrypt()` call.
- `generateRandomSecret()` for tokens/webhook secrets.

## Domain ports & external integrations

- `domain/ports/*.port.ts` are pure contracts: no imports from `integration/`,
  `infraestructure/`, or any specific SDK. This is what lets a provider be swapped
  (e.g. Gemini → another LLM, GitHub → Bitbucket) by writing a new implementation of
  the same interface, without touching the core.
- Concrete implementations live in `integration/<provider>/` and implement the port.
  They receive already-decrypted secrets via their constructor — they never import
  `Credential` or `decrypt` themselves; that's the calling use case's job.
- External-provider error handling pattern (established with `GeminiLlmProvider`,
  reused for any future provider adapter): classify errors as **transient** (429,
  5xx, or a message-pattern fallback for timeouts/overload when the SDK doesn't
  expose a status code — retry with exponential backoff, a few attempts, ~1s base
  delay) vs **permanent** (400/401/403 — fail immediately, no retry). Throw a typed
  error carrying `{ type, statusCode, message }`. Never log the sensitive payload
  (LLM prompt content, diff content, comment body) on failure — only the provider's
  own status and message.

## Testing

- Every unit (use case, controller, domain service, utility) gets its own
  `<name>.spec.ts` next to it.
- Unit tests **never** hit a real database. Repository interfaces are mocked with
  `vitest-mock-extended`'s `mock<T>()`, passed straight into `new SomeUseCase(mockRepo)`.
- `*RepositoryImpl.spec.ts` (the Prisma-backed adapters themselves) mock the Prisma
  client via `vi.mock(".../prisma-client", () => ({ prisma: mockDeep<PrismaClient>() }))`
  — these test the adapter's translation logic, not a real DB connection.
- Controllers are tested with a hand-rolled `createMockResponse()`
  (`res.status`/`res.json` as `vi.fn().mockReturnValue(res)`) and a plain object cast
  `as unknown as Request`.
- We deliberately do **not** follow an alternate pattern of instantiating a use case
  via the real factory + `vi.spyOn` a private field + a real database connection,
  even for "unit" tests — that requires a live DB for tests that should be free and
  fast. This is an intentional, discussed deviation — keep it.
- Integration tests (`*.integration.spec.ts`, e.g. hitting a real external API) are
  excluded from the default `pnpm test`/`pnpm test:coverage` run and only run via
  `pnpm test:integration`.
- Fake timers (`vi.useFakeTimers()` + `await vi.runAllTimersAsync()`) for testing
  retry/backoff logic. When a test expects a promise to **reject**, attach the
  handler (`.catch(...)` or `expect(promise).rejects...`) synchronously, right when
  the promise is created — attaching it only after advancing the timers leaves the
  rejection unhandled for a turn, and Node reports it as an unhandled rejection even
  though the test would otherwise pass.
- Coverage: v8 provider, `text`/`json-summary`/`json` reporters, `include: ["src/**/*.ts"]`,
  `exclude` specs, integration specs, and `src/index.ts`.

## Manual / end-to-end verification

Before considering a PRD done, exercise it against a real local Postgres:

1. `docker compose up -d` (local Postgres).
2. Start the server in the background (`npx tsx src/index.ts`).
3. `curl` through the golden path and the documented error cases (validation, 401,
   404, ownership).
4. For invariants that matter at the storage level (e.g. "no duplicate row"), check
   directly: `docker exec <container> psql -U <user> -d <db> -c "SELECT ..."`.
5. Clean up test data with a throwaway script that `import "./src/config"` **first**
   (to trigger `dotenv.config()`) before importing the Prisma client, deletes the
   rows it created, then delete the script.
6. Stop the background server, and verify the port is actually free — on Windows,
   killing the background task does not always kill the underlying `node.exe`
   process; check with `netstat -ano | grep ":<port>.*LISTENING"` and force-kill the
   PID if it's still bound.

## Git & PR workflow

- One feature branch per PRD, always branched from the latest `main`
  (`git checkout main && git pull` first) — avoids conflicts with anything merged
  since the last branch.
- Branch naming: `feat/prd-NN-short-slug`.
- Commit messages in **English**, conventional-commit style with an emoji prefix:
  ✨ `feat`, 🐛 `fix`, ♻️ `refactor`, ✅ `test`, 📦 `chore`, 📝 `docs`.
- PR title and body in **Portuguese** (the review audience). No `--draft`.
- Never amend commits, never force-push, never skip hooks.
- Before opening or pushing to a PR, always run the full validation gate:
  `npx tsc --noEmit`, `pnpm lint`, `pnpm format`, `pnpm test` — and ideally the
  manual e2e pass above.
- CI (`.github/workflows/ci.yml`): Node matrix `[22.x, 24.x]` (20.x is incompatible —
  pnpm 11.x needs Node ≥22.13 and crashes with `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`
  otherwise), runs `pnpm test:coverage`, posts a coverage comment on the PR via
  `davelosert/vitest-coverage-report-action@v2`.
- After merge: sync `main` (`git checkout main && git pull`), delete the merged
  branch locally **and** remotely, then branch again from the freshly-updated `main`
  for the next PRD.
- When review comments come in on an open PR: fix what's asked, push to the **same**
  branch (not a new PR), reply to each inline comment explaining the fix
  (`gh api repos/.../pulls/{n}/comments -f body=... -F in_reply_to=<id>`), then
  resolve each thread via the GraphQL `resolveReviewThread` mutation (the REST API
  has no endpoint for this — query `reviewThreads` first to get each thread's node
  id).
- It's fine to fold a small, independent, dependency-free PRD into an already-open
  PR's branch when the user explicitly chooses that, instead of always spinning a
  strictly separate branch per PRD number.

## Repo hygiene: no external document citations

**This repository must only reference its own context** (this `backend/` folder).
Never cite planning/architecture documents (or requirement codes like `RF-XXX`,
`RNF-XXX`) in code, comments, or error strings — not even relative paths like
`../backend-prds/03-....md`. Those documents live outside this git repository and
are invisible to anyone who only has this repo. When a comment's rationale comes
from one of those documents, state the reasoning standalone, without the citation.
This also applies to `package.json`'s `description`, YAML comments in CI config, and
any other non-`.ts` file — not just source comments.

## Code style

- kebab-case file names; generally one class per file.
- Identifiers, comments, and code are always in English — the error envelope's
  `message` field is the only exception (see "Controllers").
- No comments explaining *what* code does (well-named identifiers already do that);
  only *why*, when the reason is non-obvious (a hidden constraint, a workaround, a
  subtle invariant).
- Avoid premature abstraction — a little duplication across two small, similar
  use cases beats forcing a generic pattern that doesn't fit both.
- When adding a dependency whose install triggers pnpm's "ignored build scripts"
  policy, inspect what the postinstall/prepare script actually does before running
  `pnpm approve-builds` — only approve reputable, well-known packages.
