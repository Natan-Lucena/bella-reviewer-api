import { ZodError } from "zod";

// Every issue, not just the first — schema.safeParse(...).error carries all
// of them, and dropping everything but issues[0] hides failures the client
// would otherwise be able to fix in one round trip.
export function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) =>
      issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
    )
    .join("; ");
}
