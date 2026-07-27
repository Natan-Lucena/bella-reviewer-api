// In-house UseCaseError convention (see refinamento.md, Gap 7). Base class
// for domain/application errors — controllers translate instances of this
// class into HTTP responses (see the error envelope convention in
// ../../../backend-prds/CONVENTIONS.md: { error: { code, message } }).

export class UseCaseError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "UseCaseError";
  }
}
