import { Credencial, TipoCredencial } from "../entities/credencial.entity";

export interface CredencialRepository {
  save(credencial: Credencial): Promise<void>;
  findByRepositorioIdETipo(repositorioId: string, tipo: TipoCredencial): Promise<Credencial | null>;
  // Usado no lookup reverso do action_token (Gap A) — busca por hash, não por id.
  // Ver backend-prds/05-credenciais-gatilho.md.
  findByHash(segredoHash: string): Promise<Credencial | null>;
}
