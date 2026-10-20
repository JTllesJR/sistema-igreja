# CLAUDE.md

Sistema de gestão de igreja: monólito modular TypeScript (NestJS + PostgreSQL), monorepo pnpm + Turborepo.
O requisito original é o PRD em PDF; as decisões e modelos estão em `docs/` (comece por `docs/README.md`).

## Como colaborar com este usuário

- É estudante de Sistemas de Informação e quer **entender** o que é construído, não "vibe coding".
  Explique o porquê de cada escolha, apresente alternativas relevantes e registre decisões estruturais como ADR em `docs/adr/`.
- Prefira passos pequenos e verificáveis. Não declare algo pronto sem ter rodado (lint, tipos, testes, build).
- Documentação e comentários em português; identificadores de código em inglês (ver `docs/glossario.md`).

## Comandos (a partir da raiz)

- `pnpm dev` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:integration` · `pnpm build` · `pnpm format`
- Banco local: `pnpm db:up` / `pnpm db:deploy` / `pnpm db:down` (exige Docker). Migration nova: `pnpm db:migrate`.
- Antes de concluir qualquer mudança: `format:check`, `lint`, `typecheck`, `test`, `build` devem passar (é o que o CI roda).

## Regras que não se negociam

- `domain` é TypeScript puro; o linter barra imports de Nest/Prisma/platform ali (`apps/api/.oxlintrc.json`).
- Um módulo não toca nas tabelas de outro módulo (ADR 0001). Toda tabela de negócio tem `organization_id` (ADR 0003).
- Dinheiro em centavos inteiros; lançamentos financeiros imutáveis, correção por estorno (ADR 0005).
- Dados de membros são sensíveis (LGPD, ADR 0006).
- Dependências: nunca contornar o `minimumReleaseAge` do pnpm nem liberar `allowBuilds` sem justificar (ADR 0008).
- TypeScript fica em 6.0.x: o Nest CLI não funciona com o 7.0 (confirmado no CI). Reavaliar no 7.1.
- Dependabot: PRs de versão maior de `typescript`, `@types/node` e `postgres` são ignorados por decisão (ADR 0008).

## Ambiente

- Windows 11 com Docker Desktop (WSL 2). O banco local é o PostgreSQL 17 do `docker-compose.yml` (`pnpm db:up`).
- `pnpm test:integration` aplica as migrations no banco `igreja_test` sozinho (setup global do Vitest).
- O repositório remoto é privado: `JTllesJR/sistema-igreja`. O CI roda em push e em PR.
