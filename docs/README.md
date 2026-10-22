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
| [0013](adr/0013-modulo-members-e-auditoria.md) | Módulo `members` e a trilha de auditoria | aceita |
| [0014](adr/0014-usuarios-papeis-padrao-e-senha-temporaria.md) | Usuários, papéis padrão e senha temporária (UC-02/03 enxuto) | aceita |
| [0015](adr/0015-modulo-finance.md) | Módulo `finance`: contas, lançamentos imutáveis, aprovação da sede e repasse | aceita |
| [0016](adr/0016-openapi-a-partir-dos-controllers.md) | OpenAPI gerado dos controllers reais, com Swagger UI desligada por padrão | aceita |

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
  de origens, limite do corpo, limite de taxa por IP e `X-Request-Id`. **(b) Autenticação pronta:** `/auth/login`,
  `/auth/refresh`, `/auth/logout`, `/auth/me` e `/auth/change-password`, refresh em cookie `httpOnly`, guard global que
  nega por padrão, `@Public`, `@RequirePermission` e limites de taxa por rota. **(c) Congregações pronto:**
  `/organization` e `/congregations` (listar, criar, editar, desativar, reativar, designar sede), com permissões
  `organization:read` e `organization:manage` (esta exige a igreja toda). **(d) OpenAPI pronto** ([ADR 0016](adr/0016-openapi-a-partir-dos-controllers.md)): `/openapi.json` e a interface `/docs`,
  geradas dos controllers reais (51 rotas, com permissão, entrada e resposta), **desligadas por padrão** (`OPENAPI_ENABLED=true`
  em desenvolvimento); rota sem `@ApiDoc` derruba os testes.

- ✅ **Web inicial** ([ADR 0012](adr/0012-web-react-vite-tailwind.md)): `apps/web` (React + Vite + Tailwind) com a
  página **Andamento do sistema**: saúde da API e do banco ao vivo (contrato compartilhado) e o estado dos 18 casos de
  uso. Sobe com `pnpm dev` em `http://localhost:5173`. **Login na web:** telas `/entrar` e `/conta` (protegida), sessão
  com token de acesso só em memória e renovação automática; verificado no navegador contra uma API simulada, ainda
  não contra a API real com banco.

- ✅ **Módulo `members` e auditoria** ([ADR 0013](adr/0013-modulo-members-e-auditoria.md)), fatia vertical inteira: cadastro, edição,
  lista e busca, ficha, história (batismo, recepção), mudança de situação, transferência entre congregações e
  **anonimização (LGPD)**, com API, banco e telas. Permissões `members:read`, `members:write` (por congregação) e
  `members:anonymize` (igreja toda); o escopo chega até a consulta ao banco e membro fora do escopo responde 404. A
  **trilha de auditoria** é somente-anexação (gatilho no banco), registra leituras ANTES de devolver (falha fechada) e
  nunca guarda dado pessoal. Testado com repositórios em memória (inclusive duas igrejas e a falha da trilha) e com
  mutação manual; **a migration, o repositório Prisma e o gatilho só serão exercitados no CI** (sem Docker nesta máquina).

- ✅ **Usuários e papéis, versão enxuta** ([ADR 0014](adr/0014-usuarios-papeis-padrao-e-senha-temporaria.md)): etapas 1, 2 e 3 prontas
  (papéis padrão e `GET /roles`; usuários, atribuições e a regra do último Administrador travada no banco; criar usuário
  com senha temporária, troca obrigatória aplicada no guard e reset de senha) e (4) as **telas na web**: lista de usuários,
  novo usuário com senha temporária mostrada uma vez, atribuir e remover papel, desativar, redefinir senha e a troca
  obrigatória no primeiro acesso. Verificado contra uma API simulada; falta só o banco real (CI).

- ✅ **Módulo `finance`, backend** ([ADR 0015](adr/0015-modulo-finance.md)): contas e categorias, entrada (vale na hora),
  saída, saldo inicial, repasse com a sede e estorno (todos **pendentes** até outra pessoa da sede aprovar), painel
  financeiro (UC-15/16) e extrato de contribuição por membro. Dinheiro em centavos inteiros; lançamento imutável depois
  de decidido (gatilho no banco); **quem pede nunca aprova** (domínio e `CHECK`); o saldo nunca fica negativo, nem com
  aprovações simultâneas (linhas de conta travadas); quem contribuiu só aparece com `finance:read-individual` e toda
  leitura que o revela é auditada antes de devolver (falha fechada). Papéis padrão novos **Tesoureiro** e **Diretoria**
  (e o Dirigente ganha o financeiro da congregação); os papéis de sistema já existentes são sincronizados com o código.
  **Backend apenas, sem telas** (veja "Front-end" abaixo). Testado com repositórios em memória (duas igrejas, escopo,
  trilha, falha da trilha) e com mutação manual; **a migration, o gatilho, o `FOR UPDATE` e os repositórios Prisma só
  serão exercitados no CI** (sem Docker nesta máquina).
- ✅ **Cargo do membro** (backend): `MEMBER`, `AUXILIARY`, `DEACON`, `DEACONESS`, `PRESBYTER`, `EVANGELIST` e `PASTOR`
  (lista da igreja), no cadastro e na ficha; fica fora da lista de busca (dado sensível).

## Front-end: as telas atuais são só uma AMOSTRA
Decisão do dono do projeto (2026-10-22): **o backend de todos os módulos vem primeiro**, e o front-end será uma fase
própria, para todos os módulos de uma vez. As telas que existem hoje (login, congregações, membros, usuários e papéis)
foram feitas para provar a arquitetura de ponta a ponta e podem ser refeitas; não há telas de finanças. Isso também deixa
o desenho visual mais consistente, porque será pensado sobre a API completa.

## Próximos passos
Backend primeiro, em fatias verticais grossas e sem abrir mão da segurança (cada fatia traz domínio, banco, API e testes):
1. **Conferir o CI**: é o que valida as migrations (inclusive `finance` e o cargo), os repositórios Prisma, o gatilho da
   trilha e do livro-razão e a trava de saldo com o PostgreSQL real.
2. Backend que falta: consulta à trilha de auditoria (UC-04), dashboard consolidado da Diretoria com membros ativos
   (UC-16 completo, hoje só a parte financeira), documentos e foto dos membros (UC-08, com armazenamento privado), editor
   de papéis e convite por link (adiados no ADR 0014).
3. **Fase de front-end** para todos os módulos (veja acima), já com o OpenAPI como base para gerar o cliente tipado.

Em paralelo:
- Validar com a igreja as perguntas ao final de [casos-de-uso-mvp.md](casos-de-uso-mvp.md).
