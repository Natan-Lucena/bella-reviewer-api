// Substitui o UseCaseError que viria de @wave-telecom/framework (Gap 7).
// Base para erros de domínio/aplicação — controllers convertem instâncias
// desta classe em respostas HTTP (ver convenção de erro em
// ../../../backend-prds/README.md: { erro: { codigo, mensagem } }).

export class UseCaseError extends Error {
  constructor(
    public readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "UseCaseError";
  }
}
