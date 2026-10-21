# Sistema de Gestão de Igreja

Monólito modular em TypeScript (NestJS + PostgreSQL), organizado como monorepo.
Requisitos e decisões de arquitetura estão em [`docs/`](docs/README.md).

## Pré-requisitos

- **Node.js 24** (veja `.node-version`)
- **pnpm 11** (`corepack enable` já resolve, pois a versão está fixada em `package.json`)
- **Docker** (Docker Desktop no Windows) para o PostgreSQL local

## Primeira execução

```bash
pnpm install
cp .env.example .env      # valores de desenvolvimento; edite se precisar
# Gere o segredo de assinatura dos tokens e cole em JWT_SECRET no .env (obrigatório, sem valor padrão):
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64'))"
pnpm db:up                # sobe o PostgreSQL 17 (docker compose)
pnpm db:deploy            # aplica as migrations
pnpm dev                  # API em http://localhost:3000
```

Conferindo: `curl http://localhost:3000/health` deve responder `{"status":"ok","checks":{"database":"up"}}`.

## Criar a primeira igreja (UC-17)

Não há endpoint público para criar igrejas (ADR 0009); quem instala o sistema usa o comando de linha:

```bash
pnpm cli create-organization --name "Igreja Central" --headquarters "Sede"
pnpm cli create-organization --help
```

Ele compila a API, cria a igreja já com sua sede e imprime os identificadores. `--headquarters` é opcional (padrão
"Sede"). Para ver o resultado: `pnpm --filter @igreja/api db:studio` (abre as tabelas no navegador).

## Comandos do dia a dia

| Comando                 | O que faz                                                              |
| ----------------------- | ---------------------------------------------------------------------- |
| `pnpm dev`              | API com recarga automática                                             |
| `pnpm lint`             | oxlint (com checagem de tipos) em todos os pacotes                     |
| `pnpm typecheck`        | `tsc --noEmit` em todos os pacotes                                     |
| `pnpm test`             | Testes unitários (rápidos, sem banco)                                  |
| `pnpm test:integration` | Testes contra o banco `igreja_test` (aplica as migrations sozinho)     |
| `pnpm build`            | Compila tudo, respeitando a ordem de dependência                       |
| `pnpm format`           | Prettier em todo o repositório                                         |
| `pnpm db:migrate`       | Cria/aplica migration em desenvolvimento (após editar o schema Prisma) |
| `pnpm db:down`          | Para o PostgreSQL local (dados preservados no volume)                  |

O CI (`.github/workflows/ci.yml`) executa: `format:check`, `lint`, `typecheck`, `test`, `build` e, em job
separado com PostgreSQL real, `test:integration`. **Rode o mesmo antes de abrir um PR.**

## Estrutura

```
apps/
  api/             NestJS: src/modules (negócio), src/platform (config, banco), prisma/, test/
packages/
  contracts/       Schemas Zod e tipos compartilhados (API ↔ web ↔ mobile)
docs/              Glossário, casos de uso, modelo de domínio, ADRs, guia de arquitetura do código
docker/            Scripts de inicialização do PostgreSQL local
```

## Segurança da cadeia de dependências

O pnpm está configurado para **recusar versões publicadas há pouco tempo** e **bloquear scripts de instalação**
(`allowBuilds` em `pnpm-workspace.yaml` lista os poucos permitidos). Se o `pnpm install` recusar uma versão por ser
recente demais, aguarde ou escolha uma anterior; não adicione exceções para contornar.
