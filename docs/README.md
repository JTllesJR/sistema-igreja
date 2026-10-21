# Documentação — Sistema de Gestão de Igreja

Fonte dos requisitos: `PRD_Sistema_Igreja.pdf`. Esta pasta traduz o PRD em decisões e modelos que guiam o código.

Para uma explicação com desenhos, comece pelo [guia visual de engenharia](diagramas/README.md): arquitetura,
casos de uso, modelo ER, sequências, atividades e estados, distinguindo implementação e planejamento.

## Ordem de leitura
1. [Glossário](glossario.md) — a linguagem comum do domínio.
2. [Casos de uso do MVP](casos-de-uso-mvp.md) — o que será construído primeiro e as perguntas em aberto para a igreja.
3. [Modelo de domínio](modelo-dominio.md) — entidades, relacionamentos e módulos.
4. [Arquitetura do código](arquitetura-do-codigo.md) — pastas, camadas e regras de dependência de cada módulo.
5. ADRs (registros de decisão de arquitetura):

| # | Decisão | Status |
|---|---|---|
| [0001](adr/0001-monolito-modular.md) | Monólito modular | aceita |
| [0002](adr/0002-stack-typescript.md) | Stack TypeScript de ponta a ponta | aceita |
| [0003](adr/0003-multi-tenancy-desde-o-inicio.md) | Multi-tenancy no modelo desde o início | aceita |
| [0004](adr/0004-rbac-com-escopo.md) | RBAC com escopo de congregação | aceita |
| [0005](adr/0005-dinheiro-e-lancamentos-imutaveis.md) | Dinheiro em centavos e lançamentos imutáveis | aceita |
| [0006](adr/0006-lgpd-dados-sensiveis.md) | LGPD e dados sensíveis | aceita |
| [0007](adr/0007-hospedagem-adiada.md) | Hospedagem | adiada |
| [0008](adr/0008-ferramentas-de-desenvolvimento.md) | Ferramentas de desenvolvimento e política de dependências | aceita |
| [0009](adr/0009-modulo-organization.md) | Módulo `organization`: agregado, ordem de construção e integridade | aceita |
| [0010](adr/0010-identity-access-minimo.md) | `identity-access` mínimo: usuários, senha, sessões e papéis | aceita |
| [0011](adr/0011-camada-http.md) | Camada HTTP: validação, autenticação, erros e endurecimento | aceita |
| [0012](adr/0012-web-react-vite-tailwind.md) | Web: React, Vite e Tailwind | aceita |

## Como usar os ADRs
Toda decisão estrutural nova vira um ADR curto (contexto, decisão, alternativas, consequências). Se uma decisão mudar,
não se apaga o ADR antigo: cria-se um novo marcando o anterior como *substituído*.

## Roadmap (do PRD, ajustado)
| Fase | Conteúdo |
|---|---|
| **MVP** | Login, RBAC com escopo, organização/congregações (mínimo), membros, finanças básicas, dashboards |
| **1.1** | Relatórios à sede, painel por congregação, comunicação interna, relatórios avançados e exportação |
| **1.2** | App mobile, notificações push e e-mail |
| **2.0** | PIX, portal do membro, fluxo de caixa avançado |

## Andamento
- ✅ **Fase 0 — Fundação conceitual:** glossário, casos de uso, modelo de domínio, ADRs 0001–0007.
- ✅ **Fase 1 — Esqueleto técnico:** monorepo, Prisma + migration inicial, NestJS com `/health`, lint, testes
  unitários e de integração, CI. Validada localmente com Docker (PostgreSQL 17) e no CI do GitHub.
- 🔄 **Fase 2 — Módulos de negócio:** `organization` desenhado ([ADR 0009](adr/0009-modulo-organization.md)).
  **Camadas `domain`, `application` e `infrastructure` implementadas e testadas** (agregado, 8 casos de uso,
  migration com os índices, repositório Prisma validado pelo mesmo teste de contrato do repositório em memória,
  gerador UUID v7 e módulo Nest) e o **comando de linha do UC-17** (`pnpm cli create-organization`). Falta apenas
  a `presentation` HTTP, que espera o login.

- 🔄 **`identity-access` mínimo** ([ADR 0010](adr/0010-identity-access-minimo.md)): **camadas `domain`, `application`
  e `infrastructure` implementadas e testadas**: login, renovação com rotação e detecção de reuso, logout, usuário
  atual, política de acesso, trocar senha e criar administrador, com argon2id embutido, JWT (`jose`), 5 tabelas no
  PostgreSQL e os mesmos testes de contrato dos fakes passando no banco real. O **comando do operador**
  (`pnpm cli create-administrator`, senha por prompt oculto ou `--password-stdin`) também está pronto. Falta a camada HTTP
  dos endpoints.

- 🔄 **Camada HTTP** ([ADR 0011](adr/0011-camada-http.md)), em quatro passos. **(a) Base pronta:** erros em
  `application/problem+json` com tabela código→status auditada por teste, `ZodValidationPipe`, `helmet`, CORS com lista
  de origens, limite do corpo, limite de taxa por IP e `X-Request-Id`. Faltam **(b)** autenticação e guards,
  **(c)** endpoints de congregações e **(d)** OpenAPI.

- ✅ **Web inicial** ([ADR 0012](adr/0012-web-react-vite-tailwind.md)): `apps/web` (React + Vite + Tailwind) com a
  página **Andamento do sistema**: saúde da API e do banco ao vivo (contrato compartilhado) e o estado dos 18 casos de
  uso. Sobe com `pnpm dev` em `http://localhost:5173`.

## Próximos passos
Em fatias verticais, para que o primeiro resultado visual chegue cedo (cada módulo novo entrega backend e tela):
1. Camada HTTP do login e do `organization` (ADR 0011): passo (a) feito; seguem (b) login, refresh em cookie e guards
   que usam a política de acesso, (c) congregações e (d) OpenAPI (Swagger UI).
2. Web: tela de login e de congregações sobre a base já criada (com roteador e TanStack Query).
3. RBAC completo com escopo (ADR 0004), depois `members` e `finance`, cada um já com tela.

Em paralelo:
- Validar com a igreja as perguntas ao final de [casos-de-uso-mvp.md](casos-de-uso-mvp.md).
