import { randomUUID } from "node:crypto";

export type TipoCredencial = "llm" | "scm" | "action_token" | "webhook_secret";
export type ProvedorCredencial = "gemini" | "github";

export type CreateCredencialReversivelProps = {
  repositorioId: string;
  tipo: "llm" | "scm" | "webhook_secret";
  provedor: ProvedorCredencial;
  segredoCifrado: string;
};

export type CreateCredencialHashProps = {
  repositorioId: string;
  tipo: "action_token";
  provedor: ProvedorCredencial;
  segredoHash: string;
};

export class Credencial {
  private constructor(
    public readonly id: string,
    public readonly repositorioId: string,
    public readonly tipo: TipoCredencial,
    public readonly provedor: ProvedorCredencial,
    public readonly segredoCifrado: string | null,
    public readonly segredoHash: string | null,
    public readonly escopos: string | null,
    public readonly ultimaValidacao: Date | null,
    public readonly criadoEm: Date,
    public readonly atualizadoEm: Date,
  ) {}

  // tipo=llm / tipo=scm / tipo=webhook_secret — cifra reversível
  // (ver backend-prds/01-shared-cifra-hash-credenciais.md).
  static createReversivel(props: CreateCredencialReversivelProps): Credencial {
    const now = new Date();
    return new Credencial(
      randomUUID(),
      props.repositorioId,
      props.tipo,
      props.provedor,
      props.segredoCifrado,
      null,
      null,
      null,
      now,
      now,
    );
  }

  // tipo=action_token — hash irreversível (Gap A do refinamento).
  static createHash(props: CreateCredencialHashProps): Credencial {
    const now = new Date();
    return new Credencial(
      randomUUID(),
      props.repositorioId,
      "action_token",
      props.provedor,
      null,
      props.segredoHash,
      null,
      null,
      now,
      now,
    );
  }

  static fromPersistence(props: {
    id: string;
    repositorioId: string;
    tipo: TipoCredencial;
    provedor: ProvedorCredencial;
    segredoCifrado: string | null;
    segredoHash: string | null;
    escopos: string | null;
    ultimaValidacao: Date | null;
    criadoEm: Date;
    atualizadoEm: Date;
  }): Credencial {
    return new Credencial(
      props.id,
      props.repositorioId,
      props.tipo,
      props.provedor,
      props.segredoCifrado,
      props.segredoHash,
      props.escopos,
      props.ultimaValidacao,
      props.criadoEm,
      props.atualizadoEm,
    );
  }

  toJSON() {
    // Nunca inclui segredoCifrado nem segredoHash — só indica se está
    // configurada. Ver RF-CFG-05 / RNF-SEG-01.
    return {
      tipo: this.tipo,
      provedor: this.provedor,
      configurada: true,
      ultimaValidacao: this.ultimaValidacao,
    };
  }
}
