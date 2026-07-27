import { Repositorio } from "../entities/repositorio.entity";

export interface RepositorioRepository {
  save(repositorio: Repositorio): Promise<void>;
  findById(id: string): Promise<Repositorio | null>;
  findByUsuarioId(usuarioId: string): Promise<Repositorio[]>;
  findByNomeCompleto(nomeCompleto: string): Promise<Repositorio | null>;
}
