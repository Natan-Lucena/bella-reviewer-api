import { Comentario, Severidade, StatusComentario } from "../entities/comentario.entity";

export type FindComentariosFiltro = {
  prNumero?: number;
  categoria?: string;
  severidade?: Severidade;
  status?: StatusComentario;
  limit?: number;
  offset?: number;
};

export interface ComentarioRepository {
  save(comentario: Comentario): Promise<void>;
  findByReviewRunId(reviewRunId: string): Promise<Comentario[]>;
  // Escopado por repositório (join via ReviewRun) — ver
  // backend-prds/13-endpoints-leitura-painel.md, caso de uso 5.
  findByRepositorioId(
    repositorioId: string,
    filtro?: FindComentariosFiltro,
  ): Promise<{ comentarios: Comentario[]; total: number }>;
}
