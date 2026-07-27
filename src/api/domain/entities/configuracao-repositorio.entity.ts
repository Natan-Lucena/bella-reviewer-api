import { randomUUID } from "node:crypto";

export type ProvedorLlm = "gemini";

export type CreateConfiguracaoRepositorioProps = {
  repositorioId: string;
  modelo: string;
  limiteTokensExecucao: number;
  temperatura?: number;
  categoriasHabilitadas?: string[];
};

export class ConfiguracaoRepositorio {
  private constructor(
    public readonly id: string,
    public readonly repositorioId: string,
    public readonly provedorLlm: ProvedorLlm,
    public readonly modelo: string,
    public readonly limiteTokensExecucao: number,
    public readonly temperatura: number,
    public readonly categoriasHabilitadas: string[],
    public readonly criadoEm: Date,
    public readonly atualizadoEm: Date,
  ) {}

  static create(props: CreateConfiguracaoRepositorioProps): ConfiguracaoRepositorio {
    const now = new Date();
    return new ConfiguracaoRepositorio(
      randomUUID(),
      props.repositorioId,
      "gemini",
      props.modelo,
      props.limiteTokensExecucao,
      props.temperatura ?? 0.2,
      props.categoriasHabilitadas ?? [],
      now,
      now,
    );
  }

  static fromPersistence(props: {
    id: string;
    repositorioId: string;
    provedorLlm: ProvedorLlm;
    modelo: string;
    limiteTokensExecucao: number;
    temperatura: number;
    categoriasHabilitadas: string[];
    criadoEm: Date;
    atualizadoEm: Date;
  }): ConfiguracaoRepositorio {
    return new ConfiguracaoRepositorio(
      props.id,
      props.repositorioId,
      props.provedorLlm,
      props.modelo,
      props.limiteTokensExecucao,
      props.temperatura,
      props.categoriasHabilitadas,
      props.criadoEm,
      props.atualizadoEm,
    );
  }

  toJSON() {
    return {
      provedorLlm: this.provedorLlm,
      modelo: this.modelo,
      limiteTokensExecucao: this.limiteTokensExecucao,
      temperatura: this.temperatura,
      categoriasHabilitadas: this.categoriasHabilitadas,
    };
  }
}
