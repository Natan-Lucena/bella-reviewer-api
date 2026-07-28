# Contribuindo com o Bella Reviewer — Backend

Detalhes de implementação para quem vai mexer no código deste repositório — arquitetura, setup local e testes. Para uma visão de produto (o que a Bella faz, como funciona, o fluxo de uma revisão), veja o [README](./README.md).

## Arquitetura

Clean Architecture / DDD: entidades de domínio e regras de negócio isoladas de frameworks e infraestrutura. Núcleo de revisão desacoplado de transporte (HTTP, fila) — a mesma lógica roda em produção e em modo lote.

Toda a base de código (nomes de entidade, campos, paths, comentários) é em inglês.

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
    ├── core/              # Result<T,E>, BaseController, Uuid
    ├── infra/
    │   ├── database/relational/  # client Prisma
    │   ├── crypto/                # cifra/hash de credenciais
    │   ├── queue/                 # client QStash para processamento assíncrono
    │   └── http/
    └── utils/
```

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
pnpm test:coverage       # idem, com relatório de cobertura (coverage/coverage-summary.json)
pnpm test:integration    # inclui *.integration.spec.ts — chamadas reais ao Gemini
```
