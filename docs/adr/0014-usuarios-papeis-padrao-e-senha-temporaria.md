# ADR 0014 — Usuários, papéis padrão e senha temporária (versão enxuta de UC-02/UC-03)

- **Status:** aceita
- **Data:** 2026-10-21

## Contexto

Hoje só existe o Administrador, criado pelo operador. Sem outros papéis e sem como o Administrador cadastrar pessoas, o
caso de uso central de `members` (um secretário escopado a UMA congregação) só roda nos testes. O desenho completo
(catálogo de permissões via DI, editor de papéis, convite por link com token) foi **adiado de propósito**: para uma
igreja de ~200 membros e 3 congregações ele pesa mais do que entrega agora. Esta decisão é a versão enxuta. Nada dela
precisa ser desfeito quando o editor de papéis e o convite chegarem: `Role` e as tabelas já os suportam.

## Decisões

### 1. Papéis padrão fixos no código, criados sob demanda

Três papéis de sistema (`isSystem`, não editáveis) por igreja:

| Papel | Permissões | Observação |
|---|---|---|
| Administrador | `*` | só na igreja toda |
| Dirigente | `members:read`, `members:write`, `members:anonymize`, `organization:read` | acesso total aos membros da sua congregação (PRD) |
| Secretário | `members:read`, `members:write`, `organization:read` | cadastro de membros |

O Tesoureiro entra junto com o `finance`. **As permissões do Dirigente e do Secretário são uma proposta a validar com a
igreja** (casos de uso, perguntas ao final).

- Um `ensureDefaultRoles(organização)` idempotente cria os que faltam. É chamado pelo `create-administrator`, pela
  listagem de papéis e (etapa 2) pelo cadastro de usuário. Assim a igreja que já existe no banco ganha os papéis novos
  sem migration de dados. Se duas chamadas concorrem, o índice único do nome faz uma perder; ela relê e segue.
- **Permissões como texto no `identity-access`** (`'members:read'`...), e não importadas dos outros módulos: importar o
  índice de `members` criaria um ciclo de módulos (`members` já importa o `identity-access`) e colocaria o Nest dentro do
  `domain`. Um teste de consistência compara os textos com as constantes de `members` e `organization`: se alguém
  renomear uma permissão lá, o teste falha aqui.
- `shortcut:` as permissões dos papéis são gravadas na criação; mudar a definição no código exige migrar os dados.
  Aceitável até existir o editor de papéis.

### 2. Permissão de gestão: `access:manage-users`

Exige a igreja toda (`organizationWide`). Quem tem acesso a uma congregação não administra usuários da igreja.

### 3. (etapa 2) Usuários, atribuições e a regra do último Administrador

`POST /users` (cria já com a primeira atribuição), atribuir e revogar atribuições, desativar e reativar. Desativar
revoga as sessões. O papel Administrador só se atribui à **igreja toda**. A igreja nunca fica sem Administrador ativo
(409 `identity.last_administrator`); como a versão otimista é por usuário, a regra é garantida pelo repositório, que trava a
linha do papel Administrador na transação.

### 4. (etapa 3) Senha temporária

O servidor gera a senha, a mostra **uma única vez** (nunca em auditoria nem em log) e liga `must_change_password`. O
guard global, no servidor, devolve 403 `identity.password_change_required` em toda rota exceto `/auth/me`,
`/auth/change-password`, `/auth/logout` e `/auth/refresh`. Sem e-mail, o `reset-password` do Administrador é o único
jeito de recuperar uma senha esquecida. **Trade-off assumido:** o Administrador chega a conhecer a senha temporária; ela
morre no primeiro acesso.

### 5. Auditoria

Toda ação administrativa grava na trilha **depois** de salvar, como em `members` (ADR 0013), sem dado pessoal.

## Etapas

1. **Papéis padrão e `GET /roles`** — **implementado** (veja "Como a etapa 1 ficou").
2. Usuários e atribuições, com a regra do último Administrador.
3. Senha temporária e troca obrigatória.
4. Telas na web.

## Fora desta decisão (adiado)

Convite por link, editor de papéis, catálogo de permissões, papel Tesoureiro e consulta à trilha (UC-04).

## Como a etapa 1 ficou (implementado)

- `Role.leader` e `Role.secretary` ao lado de `Role.administrator`; `ensureDefaultRoles` (application) cria só o que falta
  e trata a corrida lendo de novo quando o índice único recusa o nome. Só um erro de **nome repetido** conta como
  corrida: qualquer outro erro sobe, mesmo que o papel já exista.
- `RoleRepository.listByOrganization` entrou no contrato (em memória e PostgreSQL).
- `create-administrator` agora deixa a igreja com os três papéis. `GET /roles` (`access:manage-users`, igreja toda)
  garante os padrão antes de listar, em ordem alfabética do português; o contrato é `roleSchema` em `packages/contracts`.
- Verificado: 8 chamadas simultâneas no PostgreSQL real terminam com exatamente 3 papéis. Mutação manual: 24 mutantes
  mortos e 1 equivalente (`existing[0].organizationId`, que vale sempre o mesmo que `organizationId`, porque a lista só
  tem papéis da própria igreja).
