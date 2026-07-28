import { ARCHITECTURE_GUIDANCE } from "./architecture";
import { ASYNC_CONCURRENCY_GUIDANCE } from "./async-concurrency";
import { CODE_QUALITY_GUIDANCE } from "./code-quality";
import { COMMON_BUGS_GUIDANCE } from "./common-bugs";
import { ERROR_HANDLING_GUIDANCE } from "./error-handling";
import { MINDSET_AND_FEEDBACK } from "./mindset-and-feedback";
import { PERFORMANCE_GUIDANCE } from "./performance";
import { SECURITY_GUIDANCE } from "./security";

const GUIDANCE_SECTIONS = [
  MINDSET_AND_FEEDBACK,
  ARCHITECTURE_GUIDANCE,
  SECURITY_GUIDANCE,
  PERFORMANCE_GUIDANCE,
  ASYNC_CONCURRENCY_GUIDANCE,
  ERROR_HANDLING_GUIDANCE,
  CODE_QUALITY_GUIDANCE,
  COMMON_BUGS_GUIDANCE,
];

export function buildReviewGuidance(): string {
  return GUIDANCE_SECTIONS.join("\n\n---\n\n");
}
