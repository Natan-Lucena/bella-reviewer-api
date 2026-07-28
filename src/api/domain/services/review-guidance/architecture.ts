// Adapted from the code-review skill's reference/architecture-review-guide.md.
// Translated from the source (originally mixed Chinese/English) and condensed
// to the language-agnostic concepts — dropped tool recommendations (SonarQube,
// NDepend, etc.) and external reading links, which aren't actionable for a
// single-pass review of one diff.
export const ARCHITECTURE_GUIDANCE = `
## Architecture review

Apply this when the diff adds a new abstraction, a new module, or changes how
components depend on each other. Skip it for isolated, single-purpose changes.

### SOLID, as concrete review questions

- **Single responsibility**: does this class/module do one thing? Warning
  signs: a name containing generic words like "Manager"/"Handler"/"Processor",
  a file over ~300 lines, a class with more than ~7 public methods, methods
  that operate on completely unrelated data.
- **Open/closed**: does adding a new case require editing this code, or can it
  be added by extension? Warning signs: a growing switch/if-else chain
  handling different types, \`instanceof\`/\`typeof\` checks scattered around,
  a core class edited every time a new variant is added.
- **Liskov substitution**: can a subtype/implementation fully replace its
  base type without surprising callers? Warning signs: explicit type casts
  back to a concrete subtype, an override that throws "not implemented", an
  override that's an empty no-op just to satisfy the interface.
- **Interface segregation**: is the interface small and focused, or does it
  force unrelated methods on every implementer? Warning signs: an interface
  with 7+ methods, implementations with dead/no-op methods, a name so generic
  it could mean anything (\`IManager\`, \`IService\`).
- **Dependency inversion**: does the high-level/business logic depend on an
  abstraction it owns, or on a concrete low-level detail (a specific DB
  client, a specific HTTP library, a hardcoded connection string)? Warning
  signs: a domain/business-logic file importing a concrete infrastructure
  class directly, configuration hardcoded into business logic, a class that's
  hard to unit test because its dependencies can't be substituted.

Dependency rule (Clean Architecture): dependencies must point inward — from
frameworks/drivers, through interface adapters and application logic, toward
the domain core — never the reverse. A domain file importing a concrete
database/HTTP client is a violation worth flagging even if it currently
"works"; the fix is a domain-owned interface implemented by the outer layer.

### Anti-patterns to flag

**Severe** (usually critical/high): Big Ball of Mud (no clear module
boundaries, anything can call anything), God Object (one class knows/does far
too much), Spaghetti Code (tangled control flow, deep nesting, hard to trace),
Lava Flow (old code nobody dares touch, no tests, no docs).

**Design-level** (usually medium): Golden Hammer (the same pattern/tool forced
on every problem regardless of fit), over-engineering / Gas Factory (a simple
problem solved with unnecessary pattern layers), Boat Anchor (dead code kept
"in case we need it later" — delete it, re-add when actually needed),
copy-paste programming (the same logic duplicated in multiple places instead
of extracted).

### Coupling and cohesion

Coupling, from healthiest to worst: passing simple parameters > passing a
well-defined data structure > passing a large structure but only using part of
it > passing a control flag that changes behavior > sharing global state >
directly reaching into another module's internals. Flag anything at the
"control flag" level or worse.

Cohesion, from best to worst: every element serves one single purpose >
output of one step feeds the next > operating on the same data > merely
executing at the same time > logically related but functionally different >
no discernible relationship at all. A module below "operating on the same
data" cohesion is a splitting candidate.

Rough thresholds worth using as a gut check (not hard rules): a class
depended on by more than ~10 other classes is a stability risk when changed; a
class with 3+ apparent responsibilities by cohesion likely needs to split.

### Extensibility and design patterns

A pattern (Factory, Strategy, Observer, Decorator, etc.) is justified when it
solves a real, current extensibility need and makes the code easier to test —
not when it's applied because the problem "felt like" it needed one. Warning
signs of overuse: a simple if/else replaced by a strategy + factory +
registry, an interface with exactly one implementation, an abstraction added
"in case we need it later", a reader needing significantly longer to
understand the structure than the logic itself would take.

### Code structure

Prefer organizing by feature/domain (a folder per feature containing its own
entity/service/repository/controller) over organizing by technical layer
(a single \`controllers/\` folder mixing every domain's controllers together) —
the latter makes cross-cutting changes touch many unrelated folders.

Rough size guidance worth flagging when badly exceeded: a file over ~300
lines, a function over ~50 lines, a class over ~200 lines, a function with
more than ~4 parameters, nesting deeper than ~4 levels — each is a signal to
consider splitting, not an automatic violation.

### Quick check

- Do dependencies point in the direction the rest of the codebase's
  dependencies already point?
- Is there a circular dependency (A depends on B depends on C depends on A)?
- Is core business logic decoupled from the framework/UI/database, or would
  swapping any of those require touching business logic?
- Is there an obvious anti-pattern from the lists above?
`.trim();
