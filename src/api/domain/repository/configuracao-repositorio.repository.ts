import { ConfiguracaoRepositorio } from "../entities/configuracao-repositorio.entity";

export interface ConfiguracaoRepositorioRepository {
  save(configuracao: ConfiguracaoRepositorio): Promise<void>;
  findByRepositorioId(repositorioId: string): Promise<ConfiguracaoRepositorio | null>;
}
