# Bella Reviewer — Backend

Backend da plataforma de code review assistido por IA (TCC — Engenharia de Software, UFC Quixadá).

Este repositório contém só a **estrutura mínima** (arquitetura de pastas, entidades de domínio, interfaces/portas, dependências base, Prisma inicializado sem models, docker-compose do banco). A implementação de cada endpoint/caso de uso é feita seguindo os PRDs em [`../backend-prds/`](../backend-prds/README.md) — comece por lá.

## Stack

- Node.js 20+, TypeScript, Express
- Prisma + Postgres (Neon em produção, `docker-compose` local)
- Vitest (unitário + integração)
- ESLint + Prettier
- pnpm

## Arquitetura

Clean Architecture / DDD, adaptada de um template de referência interno (ver `../arquitetura.md` para a origem), sem dependências privadas de terceiros (ver `../refinamento.md`, Gap 7 — os padrões `Result<T,E>`/`UseCaseError` foram reescritos como convenção própria em `src/shared/core/`).

Toda a base de código (nomes de entidade, campos, paths, comentários) é em **inglês** — ver `../backend-prds/CONVENTIONS.md` para o dicionário completo de nomenclatura. Só a documentação de planejamento do projeto (este README incluído) permanece em português.

```
src/
├── api/
│   ├── application/     # use-cases, controllers, DTOs, schemas de validação, rotas
│   ├── domain/
│   │   ├── entities/    # entidades de domínio (User, Repo, RepoConfig, Credential, ReviewRun, ReviewTurn, Comment)
│   │   ├── ports/        # contratos externos que não são persistência (LLM, SCM)
│   │   ├── repository/   # contratos de persistência
│   │   ├── services/     # núcleo puro de revisão (review-service.ts)
│   │   └── tests/
│   ├── infraestructure/  # implementações concretas de domain/repository (Prisma)
│   └── integration/      # implementações concretas de domain/ports (gemini/, github/)
└── shared/
    ├── core/              # Result<T,E>, UseCaseError
    ├── infra/
    │   ├── database/relational/  # client Prisma
    │   ├── crypto/                # cifra/hash de credenciais (a implementar — PRD 01)
    │   ├── queue/                 # client QStash (a implementar — PRD 2.x do roadmap)
    │   └── http/
    └── utils/
```

Ver `../refinamento.md` para o raciocínio completo por trás de cada decisão de arquitetura (Gap 1 a Gap D).

## Rodando localmente

```bash
pnpm install
cp .env.example .env   # preencha MASTER_KEY e SESSION_SECRET (ex.: openssl rand -base64 32)
docker compose up -d   # sobe o Postgres local
pnpm prisma:generate
pnpm dev                # http://localhost:3000/health
```

## Testes

```bash
pnpm test               # unitários, rápidos, sem custo
pnpm test:integration    # inclui *.integration.spec.ts — chamadas reais ao Gemini, ver
                         # ../backend-prds/14-teste-integracao-modo-lote.md
```

## Ordem de implementação

Ver `../backend-prds/README.md` para o índice completo dos PRDs e a ordem recomendada de implementação (documentos-base de modelo de dados/cifra primeiro, depois auth, configuração de repositório, portas, ingestão, núcleo, processamento, publicação, leitura do painel, teste de integração).
