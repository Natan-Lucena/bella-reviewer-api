import cors from "cors";
import express from "express";

import { config } from "./config";
import { logger } from "./logger";

const app = express();

app.use(
  cors({
    origin: config.FRONTEND_ORIGIN,
    credentials: true, // sessão via cookie httpOnly — ver backend-prds/02-auth-cadastro-login-sessao.md
  }),
);

// ATENÇÃO para quem implementar backend-prds/09-ingestao-webhook.md: a rota
// POST /webhooks/github precisa do corpo BRUTO da requisição (não parseado)
// para recalcular o HMAC da assinatura corretamente. Ela deve usar
// express.raw({ type: "application/json" }) só naquela rota, montada ANTES
// deste express.json() global — ou este parser precisa ser restrito às
// demais rotas (express.json() por rota, não global) quando essa rota for
// adicionada.
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Rotas de negócio (auth, repositorios, ingestao, webhooks, internal) entram
// aqui conforme cada PRD de ../../backend-prds/ for implementado, registradas
// via src/api/application/container/routes/.

app.use((_req, res) => {
  res
    .status(404)
    .json({ erro: { codigo: "rota_nao_encontrada", mensagem: "Rota não encontrada" } });
});

app.listen(config.PORT, () => {
  logger.info(`Servidor iniciado na porta ${config.PORT}`);
});
