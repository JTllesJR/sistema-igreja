# ADR 0008 — Ferramentas de desenvolvimento e política de dependências

- **Status:** aceita
- **Data:** 2026-10-19

## Contexto
A Fase 1 montou o esqueleto técnico. As versões mais novas do ecossistema nem sempre são compatíveis entre si,
e a cadeia de dependências npm é um vetor real de ataque. As escolhas abaixo foram verificadas na prática
(instalação, build, lint, testes), não assumidas.

## Decisões

| Tema | Escolha | Motivo |
|---|---|---|
| Gerenciador | **pnpm 11** + workspaces + **catalogs** | Instalação rápida e estrita; versões compartilhadas declaradas uma vez em `pnpm-workspace.yaml`. |
| Orquestração | **Turborepo** | Grafo de tarefas (`build` antes de `test`), cache local e execução paralela. |
| TypeScript | **6.0.x** (não 7) | `typescript-eslint` suporta `<6.1` e o Nest CLI 12 usa `~6.0`. Reavaliar quando o toolchain suportar o 7. |
| Linter | **oxlint** (type-aware) | É o padrão do Nest 12; muito mais rápido que ESLint. Cobre a regra de pureza do `domain`. |
| Formatação | **Prettier** | Padrão de fato; checado no CI. |
| Testes | **Vitest** (unitários e integração) | Padrão do Nest 12; ESM nativo. Suporta os decorators/metadados do Nest sem plugin extra. |
| Banco | **PostgreSQL 17** | Amplamente oferecido por provedores gerenciados (relevante para o ADR 0007). |
| ORM | **Prisma 7** com driver adapter `pg` | Migrations versionadas e cliente tipado; gerador `prisma-client` com `importFileExtension = "js"` (ESM). |
| Módulos | **ESM** (`"type": "module"`, `nodenext`) | Padrão do Nest 12; imports relativos com `.js`. |
| Env | Validação com Zod no boot; carregamento via `--env-file` do Node | Falha cedo com mensagem clara; sem biblioteca de dotenv. |

## Política de dependências (cadeia de suprimentos)

- O pnpm recusa versões publicadas há pouco tempo (`minimumReleaseAge`). **Não adicionar exceções**
  (`minimumReleaseAgeExclude`); fixar a versão anterior madura e subir depois.
- Scripts de instalação ficam bloqueados; apenas `prisma` e `@prisma/engines` estão liberados (`allowBuilds`),
  pois baixam o motor de migrations.
- O Dependabot propõe atualizações semanais com `cooldown` de 7 dias, agrupadas por ecossistema.
- `@types/node` acompanha a versão do runtime (24), não a mais recente.
- O CI usa `pnpm install --frozen-lockfile`: o `pnpm-lock.yaml` é versionado e é a fonte da verdade.

## Consequências
- (+) Toolchain consistente e verificável; atualizações previsíveis.
- (−) Ficamos um passo atrás do "último lançamento" (ex.: TypeScript 7) de propósito.
- (−) O oxlint tem menos regras/plugins que o ESLint; regras de arquitetura mais elaboradas podem exigir
  dependency-cruiser.
