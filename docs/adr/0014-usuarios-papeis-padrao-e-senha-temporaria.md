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
2. Usuários e atribuições, com a regra do último Administrador — **implementado** (veja "Como a etapa 2 ficou").
3. Senha temporária e troca obrigatória — **implementado** (veja "Como a etapa 3 ficou").
4. Telas na web — **implementado** (veja "Como a etapa 4 ficou").

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

## Como a etapa 2 ficou (implementado)

- **Rotas** (todas exigem `access:manage-users` na igreja toda): `GET /users`, `POST /users/:id/assignments`,
  `POST /users/:id/assignments/revoke`, `POST /users/:id/disable` e `POST /users/:id/enable`. As ações devolvem o usuário
  atualizado. Revogar é POST porque a congregação pode ser nula (igreja toda) e uma chave composta com nulo não cabe bem
  na URL. Criar usuário não está aqui: depende da senha temporária (etapa 3).
- **Domínio:** `User.revokeRole`, `disable`, `enable` e `isActiveAdministrator` (ativo e com o papel na igreja toda).
  Erros novos e seus status: `last_administrator` 409, `assignment_not_found` e `role_not_found` 404,
  `administrator_scope_invalid` e `congregation_unavailable` 422.
- **A regra do último Administrador** vive em `UserRepository.saveGuardingLastAdministrator`. No PostgreSQL, a transação
  trava a linha do papel Administrador da igreja (`SELECT ... FOR UPDATE`), grava e então conta os administradores ativos
  na igreja toda; zero desfaz tudo. Sem a trava, dois administradores se removendo ao mesmo tempo passariam os dois (a
  versão otimista é por usuário). Os casos de uso só usam a gravação protegida quando o alvo É um administrador ativo,
  então revogar um papel comum numa igreja sem administrador não é barrado.
- **Alternativas descartadas:** isolamento `SERIALIZABLE` (mais geral, mas exige repetir transações e é mais difícil de
  explicar) e `pg_advisory_lock` (funciona, mas é um mecanismo à parte do modelo). Travar uma linha que já existe e já
  representa "os administradores desta igreja" é o menor mecanismo que resolve.
- **Desativar** revoga todas as sessões; reativar não as ressuscita. A auditoria grava depois de salvar (`user.role_assigned`,
  `user.role_revoked`, `user.disabled`, `user.enabled`), só com ids.
- **Porta nova:** `OrganizationDirectory.isCongregationActive`, implementada sobre `OrganizationQueries.findCongregation`
  (o `identity-access` continua sem tocar nas tabelas do `organization`).
- **Verificado:** o teste de corrida roda 20 rodadas no PostgreSQL real (uma só pode, por sorte, serializar sozinha e deixar
  passar a ausência da trava; a mutação "sem `FOR UPDATE`" só morreu depois disso). Mutação manual: 44 mutantes, os 6 que
  sobreviveram à primeira rodada foram fechados com testes novos, e restam 0 vivos. Equivalente conhecido: o filtro por
  `organizationId` dentro da contagem em memória, porque cada igreja tem o seu próprio papel Administrador (id diferente).
- **Limite conhecido:** desativar a si mesmo é permitido (só o último administrador é protegido).

## Como a etapa 3 ficou (implementado)

- **Rotas** (`access:manage-users` na igreja toda): `POST /users` (201) e `POST /users/:id/reset-password` (200). Ambas devolvem
  `{ user, temporaryPassword }` com `Cache-Control: no-store`; a senha só existe nessa resposta, no armazenamento fica o hash.
- **Senha temporária:** `RandomTemporaryPasswordGenerator` (porta `TemporaryPasswordGenerator`), 16 símbolos sorteados com
  `crypto.randomInt` (sem o viés do `%`) de um alfabeto de 57, sem `0 O 1 l I`, em quatro grupos (`Abcd-Efgh-Jkmn-Pqrs`).
  Cerca de 93 bits; é uma senha que vale até o primeiro acesso e ainda passa pelo argon2id e pelo bloqueio de tentativas.
- **Coluna `must_change_password`** (migration `20261021230000_user_must_change_password`, `NOT NULL DEFAULT false`, sem
  deriva com o schema). No domínio, três caminhos distintos para a senha: `changePasswordHash` (re-hash silencioso do
  login, não mexe na obrigação), `choosePassword` (a pessoa escolheu: encerra) e `issueTemporaryPassword` (administrador:
  liga a obrigação e também destrava a conta).
- **O guard faz valer a troca no servidor.** A `AccessPolicy` carrega `mustChangePassword` (lido do banco a cada requisição,
  como o resto da política, e não do token). Com a troca pendente, toda rota responde 403 `identity.password_change_required`,
  exceto as marcadas com `@AllowWhenPasswordChangePending()`: `/auth/me` e `/auth/change-password`. Refresh e logout já são
  públicos. A checagem vem **antes** da de permissão, para o cliente receber o motivo certo. É 403 e não 401 de propósito:
  a pessoa está autenticada, e um 401 faria o cliente achar que a sessão acabou.
- **Trocar a senha** exige a nova diferente da atual (senão a troca obrigatória não trocaria nada) e libera o MESMO token
  de acesso na hora. O `GET /auth/me` e a resposta do login ganharam `mustChangePassword` (contrato `currentUserSchema`).
- **Reset:** gera outra senha temporária, derruba todas as sessões e destrava a conta, mas não reativa quem está desativado.
- **Refatoração:** as regras de "dar este papel neste escopo" (papel da igreja, Administrador só na igreja toda, congregação
  ativa) viraram `resolveAssignableRole`, usada por atribuir papel e por criar usuário.
- **Auditoria:** `user.created` e `user.password_reset`, só com ids; nem a senha nem o e-mail entram na trilha.
- **Verificado:** mutação manual com 44 mutantes e 1 equivalente (o `organizationId` do primeiro papel da igreja é sempre o
  da própria igreja); 3 sobreviventes da primeira rodada viraram testes (e-mail repetido não gasta hash, `:id` inválido no
  reset e a destrava da conta).
- **Limite conhecido:** o Administrador pode redefinir a própria senha por aqui (fica sem sessão e com uma temporária);
  para trocar a própria senha o caminho certo é `/auth/change-password`.

## Como a etapa 4 ficou (implementado)

- **Telas:** `/usuarios` (lista com papéis e escopos, último acesso, atribuir e remover papel, desativar e reativar,
  redefinir senha), `/usuarios/novo` (e-mail, papel e congregação) e `/trocar-senha`. O item "Usuários" do menu só aparece
  para quem tem `access:manage-users` na igreja toda; a API continua decidindo (403).
- **A senha temporária aparece uma vez e só na memória da tela.** Fica no estado do componente: as mutações que a devolvem
  (criar e redefinir) usam `gcTime: 0`, então o TanStack Query não a guarda; não vai para URL, `localStorage` nem
  `sessionStorage` (verificado no navegador); o botão "Já anotei" a descarta. Há botão de copiar, com aviso quando a área
  de transferência não está disponível.
- **Troca obrigatória na interface:** quem entra com senha temporária é levado a `/trocar-senha` (no login e em qualquer
  rota protegida); a API já recusa todo o resto (seção 4), então isto só leva a pessoa ao lugar certo. Depois de trocar, a
  web relê o usuário (`SessionManager.reloadUser`) para saber que a obrigação acabou. A mesma tela serve para a troca
  voluntária (link em "Minha conta"). Validação local: 10 a 128 caracteres, nova diferente da atual e confirmação igual; os
  campos de senha são apagados ao enviar e, em caso de erro, a nova senha e a confirmação são limpas.
- **Papel de igreja toda não leva congregação:** o Administrador (o papel com `*`) esconde o seletor de congregação e o
  pedido sempre vai com `congregationId: null`, mesmo que o formulário guarde um valor antigo. A API repete a regra.
- **Verificado no navegador contra uma API simulada:** criar a secretária, ver a senha uma vez, entrar com ela e ser levado à
  troca, tentar abrir outra tela (volta para a troca), senha atual errada, regras locais, troca com sucesso (o menu passa a
  mostrar Membros e não mostra Usuários), atribuir papel, "Administrador" sem seletor de congregação, desativar, reativar,
  redefinir (senha aparece uma vez) e a recusa do último Administrador (remover o papel e desativar). Sem rolagem
  horizontal e alvos de toque de 40 px ou mais no celular. Mutação manual: 11 pontos, todos pegos.
- **Não verificado:** contra a API real com PostgreSQL (como o resto da web).
- **Limite conhecido:** não há tela para o Administrador alterar o papel de si mesmo com cuidado extra (a API só protege o
  último Administrador); e a lista não tem busca nem paginação (igreja de poucas dezenas de usuários).
