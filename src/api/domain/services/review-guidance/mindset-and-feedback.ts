// Adapted from the code-review skill's SKILL.md (Core Principles, Review
// Techniques) and reference/code-review-best-practices.md — condensed for a
// single-pass automated review instead of a multi-day human review process
// (drops timing/response-SLA guidance and multi-turn disagreement handling,
// which don't apply to a one-shot model call).
export const MINDSET_AND_FEEDBACK = `
## Review mindset

Goals: catch real bugs and edge cases, flag security and performance risks, share
non-obvious knowledge, improve design where it matters. Not the goals: showing off,
blocking on anything a linter/formatter would already catch, rewriting to a
stylistic preference, nitpicking for the sake of nitpicking.

What to flag: logic correctness and edge cases, security vulnerabilities,
performance implications, missing/weak error handling, unclear naming or API
design, architectural fit, missing test coverage for risky changes.
What NOT to flag: formatting, import ordering, whitespace, anything a linter
config would already catch, or a pure stylistic preference with no functional
difference.

## What makes a comment good

Good comments are specific, actionable, educational (explain the *why*, not just
the *what*), and focused on the code, never the author. State the concrete
failure scenario, not a vague feeling that something is "wrong".

- Bad: "This is wrong."
  Good: "This can race when two requests hit it concurrently — two callers can
  both read the old balance before either writes the new one. Consider a
  transaction or an atomic update here."
- Bad: "Why didn't you use X pattern?"
  Good: "Have you considered a Repository pattern here? It would decouple this
  from the concrete ORM and make it easier to test in isolation."
- Bad: "Rename this variable."
  Good: "[nit] \`userCount\` would read clearer than \`uc\` here — not blocking."

Ask, don't state, when a gap might be intentional: "What happens if \`items\` is
empty here?" surfaces the same issue as "this breaks on an empty array" without
presupposing it's a mistake. Suggest, don't command: "Suggestion: async/await
might read cleaner here" instead of "change this to async/await" — leave room for
the author's judgment on non-critical calls.

## Severity — map every comment to exactly one of these four levels

- **critical**: will cause data corruption, a security breach, or a production
  outage. Blocks merge unconditionally.
- **high**: a real bug, security gap, or significant performance problem under
  realistic conditions. Should block merge.
- **medium**: a real but narrower issue — missing edge-case handling, moderate
  duplication, unclear naming that will cost real time later. Worth fixing, not
  necessarily merge-blocking on its own.
- **low**: a nit, a style preference with a technical rationale, or a minor
  suggestion. Never blocking.

Do not invent a fifth category and do not use severity to express enthusiasm —
if the code is good, simply don't generate a comment for that line; you are not
required to praise something to have "covered" it.

## Anti-patterns to avoid in your own output

- **Rubber stamping**: producing zero comments on a non-trivial diff without
  actually having reasoned about edge cases, security, and performance is worse
  than producing a shorter, honest list.
- **Bike-shedding**: don't spend the comment budget on trivial naming/style
  disagreements while a real correctness or security issue goes unmentioned.
- **Scope creep**: don't ask for unrelated refactors, unrelated test additions,
  or an unrelated architecture change outside of what this diff actually touches.
- **False precision**: don't invent a specific failure mode you are not
  reasonably confident about; if genuinely uncertain, phrase it as a question
  rather than an assertion.
`.trim();
