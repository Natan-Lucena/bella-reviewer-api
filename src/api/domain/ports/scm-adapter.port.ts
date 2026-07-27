// Contrato do provedor de versionamento (SCM). v1 implementa só GitHub
// (src/api/integration/github/github-scm-adapter.ts). Bitbucket entraria
// como uma nova implementação desta mesma interface, sem tocar no núcleo.
// Ver backend-prds/07-porta-scm-adapter-github.md.

export interface ScmAdapterPort {
  getDiff(params: GetDiffParams): Promise<Diff>;
  publishComment(params: PublishCommentParams): Promise<PublishCommentResult>;
}

export type GetDiffParams = {
  repoFullName: string; // "organizacao/repositorio"
  prNumber: number;
  commitSha: string;
};

export type LinhaDiff = {
  conteudo: string;
  status: "adicionada" | "removida" | "inalterada";
  numeroLinha: number; // número da linha no arquivo NOVO
};

export type HunkDiff = {
  linhaInicioAntiga: number;
  linhaInicioNova: number;
  linhas: LinhaDiff[];
};

export type ArquivoDiff = {
  caminho: string;
  hunks: HunkDiff[];
};

export type Diff = {
  arquivos: ArquivoDiff[];
};

export type PublishCommentParams = {
  repoFullName: string;
  prNumber: number;
  commitSha: string;
  file: string;
  line: number;
  body: string;
};

export type PublishCommentResult = {
  externalId: string;
};
