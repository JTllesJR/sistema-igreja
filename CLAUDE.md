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
- Comando do operador (UC-17): `pnpm cli create-organization --name "..."` (compila e executa; sem HTTP).
- Antes de concluir qualquer mudança: `format:check`, `lint`, `typecheck`, `test`, `build` devem passar (é o que o CI roda).

## Commits e GitHub

- Só commitar quando o usuário pedir. Commits em **Conventional Commits, em português**, **sem** a linha
  `Co-Authored-By` nem qualquer atribuição ao Claude (o usuário pediu: o commit deve ficar só no nome dele).
- `git push` só quando o usuário pedir explicitamente. O remoto é privado e o CI roda em push e PR.

## Regras que não se negociam

- `domain` é TypeScript puro; `application` também não importa framework nem infraestrutura (casos de uso sem
  decorators do Nest). O linter barra isso (`apps/api/.oxlintrc.json`); a ligação é feita no `<modulo>.module.ts`.
- Migration que mexe em `congregation` deve **preservar os dois índices manuais** (sede única e nome único): o
  Prisma não os expressa no schema (ADR 0009). Conferir com `prisma migrate diff` que não há deriva.
- Todo repositório novo cumpre um teste de contrato, rodado contra o fake em memória e contra o PostgreSQL.
- Ao validar testes, **sabotar o código de propósito** e ver o teste falhar (mutação manual). Já achou buracos reais.
  Cuidado: no Git Bash, argumentos começando por `//` são convertidos em `/`.
- Um módulo não toca nas tabelas de outro módulo (ADR 0001). Toda tabela de negócio tem `organization_id` (ADR 0003).
- Dinheiro em centavos inteiros; lançamentos financeiros imutáveis, correção por estorno (ADR 0005).
- Dados de membros são sensíveis (LGPD, ADR 0006).
- Dependências: nunca contornar o `minimumReleaseAge` do pnpm nem liberar `allowBuilds` sem justificar (ADR 0008).
- TypeScript fica em 6.0.x: o Nest CLI não funciona com o 7.0 (confirmado no CI). Reavaliar no 7.1.
- Dependabot: PRs de versão maior de `typescript`, `@types/node` e `postgres` são ignorados por decisão (ADR 0008).

## Ambiente

- Windows 11 com Docker Desktop (WSL 2). O banco local é o PostgreSQL 17 do `docker-compose.yml` (`pnpm db:up`).
- `pnpm test:integration` aplica as migrations no banco `igreja_test` sozinho (setup global do Vitest).
- A API e o `pnpm cli` exigem `JWT_SECRET` (mínimo de 32 caracteres) no `.env`, sem valor padrão de propósito. Nos testes
  de integração e no CI o segredo é um valor fixo de teste, definido em `vitest.config.integration.ts`.
- Mutação manual: o separador `|` e o prefixo `//` atrapalham em scripts de shell; para trocar trechos que contêm `||`,
  chame o `mutate.mjs` diretamente (um argumento por texto) e sempre confirme "mutação aplicada" antes de confiar no resultado.
- O repositório remoto é privado: `JTllesJR/sistema-igreja`. O CI roda em push e em PR.
