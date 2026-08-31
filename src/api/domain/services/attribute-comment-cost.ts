export type CommentCostInput = { body: string; suggestedCode: string | null };

export type AttributedCommentCost = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

// A ReviewRun's turn is billed as a single LLM call, never per output item —
// there's no way to measure one comment's "true" individual cost. This
// splits that call's tokens across the comments it produced: input tokens
// (the diff + system prompt, a fixed cost paid once no matter how many
// comments came out) are split evenly; output/reasoning tokens (which do
// scale with what was actually generated) are split proportionally to each
// comment's own generated content size.
export function attributeCommentCost(
  comments: CommentCostInput[],
  turnTokens: { inputTokens: number; outputTokens: number; reasoningTokens: number },
): AttributedCommentCost[] {
  if (comments.length === 0) return [];

  const weights = comments.map((c) => c.body.length + (c.suggestedCode?.length ?? 0));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const evenInputShare = turnTokens.inputTokens / comments.length;

  return comments.map((_, i) => {
    // weights[i] is always defined here — weights has exactly comments.length
    // entries — the ?? 0 only appeases noUncheckedIndexedAccess.
    const weight = weights[i] ?? 0;
    // totalWeight === 0 only happens if every body were an empty string —
    // effectively impossible (the parser already requires a non-empty
    // body), but handled without dividing by zero: falls back to an even
    // split, same as input.
    const outputShare = totalWeight > 0 ? weight / totalWeight : 1 / comments.length;
    return {
      inputTokens: Math.round(evenInputShare),
      outputTokens: Math.round(turnTokens.outputTokens * outputShare),
      reasoningTokens: Math.round(turnTokens.reasoningTokens * outputShare),
    };
  });
}
