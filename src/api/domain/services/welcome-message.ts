// Posted once, on the first review a repository ever completes (see
// process-review-run-use-case.ts) — a general PR comment (not anchored to a
// file/line), so a repo's very first interaction with Bella isn't just
// whatever critique the LLM happens to generate for that diff. The gif is
// the same one already used in the Action's own README, since installing
// the Action is what made this comment possible in the first place.
const WELCOME_GIF_URL =
  "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExczlkOTEyaWd2dDZuano0Nm1keW10M3JzOHExbWt4aTdkdGt2Ynl1NCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/XrocL0zuteSUU/giphy.gif";

export function buildWelcomeMessage(): string {
  return [
    "🐾 **Oi! Aqui é a Bella.**",
    "",
    "Este é o primeiro Pull Request deste repositório que eu reviso — a partir de agora, todo PR novo passa por mim antes de chegar até você.",
    "",
    `![Bella](${WELCOME_GIF_URL})`,
  ].join("\n");
}
