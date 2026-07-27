# Bella Reviewer — Backend

<p align="center">
  <img src="https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExMTF1d3M5MjNuMXltN2FwenBtaW8xdDQ2cmxqYWN4azgwemNwam5ybyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/iL7on8VbqU7tu/giphy.gif" alt="Bella" width="280">
</p>

Bella é a especialista em code review que nunca dorme: fareja bugs, falhas de segurança e código suspeito em cada Pull Request antes que virem problema em produção. O nome é uma homenagem a uma dálmata que certamente teria uma opinião forte sobre a qualidade do seu código.

API backend da Bella Reviewer, uma plataforma de code review assistido por IA. Recebe o diff de um Pull Request via GitHub Action ou webhook, roda o diff por um pipeline de revisão baseado em LLM, e publica os comentários de volta no PR — registrando o consumo de tokens de cada execução para visibilidade de custo.

## Stack

- Node.js 22.13+, TypeScript, Express
- Prisma + Postgres (Neon em produção, `docker-compose` local)
- Vitest
- ESLint + Prettier
- pnpm

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
