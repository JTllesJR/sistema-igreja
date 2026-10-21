# ADR 0010 — `identity-access` mínimo: usuários, senha, sessões e papéis

- **Status:** aceita
- **Data:** 2026-10-20

## Contexto

Nenhum endpoint de dados de uma igreja pode existir sem autenticação (ADR 0009, seção 2). O `identity-access` é a
base do login e da autorização por escopo (ADR 0004). Este ADR cobre a **primeira fatia**: o suficiente para entrar
no sistema como Administrador. Papéis personalizados e permissões por escopo na interface (UC-02) e convites
(UC-03 completo) ficam para depois. Camadas e pastas seguem a [arquitetura do código](../arquitetura-do-codigo.md);
aqui só o que é específico.

## Decisões

### 1. E-mail único em todo o sistema

O login recebe só e-mail e senha, então o e-mail identifica o usuário (e, por ele, a igreja). Cada usuário pertence a
**uma** organização. Normalizado (aparado, minúsculas) e com índice único em `lower(email)`.
**Consequência:** se a mesma pessoa vier a servir em duas igrejas, será preciso uma tabela de associação
usuário↔organização. Aceito por ora: é raro e o ADR 0003 já isola dados por igreja.

### 2. Papéis em tabela; o Administrador é um papel de sistema com permissão curinga

Tabelas `role` e `role_permission` desde já, porque o PRD exige perfis configuráveis (ADR 0004) e assim a atribuição
(`user_role_assignment`) referencia sempre um `role_id`, sem referência ambígua entre "chave em código" e "id".

- O **Administrador** é uma linha `is_system` com uma única permissão, `*` ("tudo"). Permissões novas valem para ele
  automaticamente, sem migration.
- É criado de forma **idempotente por igreja** pelo `CreateAdministrator` (dentro do `identity-access`), então o
  módulo `organization` continua sem conhecer papéis.
- Papéis de sistema não são editáveis nem excluíveis pelo domínio.
- Permissão tem a forma `modulo:ação` (ex.: `finance:approve`) ou `*`. O módulo `identity-access` não mantém um
  catálogo das permissões dos outros módulos.

**Alternativa considerada:** Administrador em código, com `role_key` na atribuição. Menos código agora, mas deixaria
uma referência polimórfica (chave ou id) e uma migração de dados depois. Descartada.

### 3. Senhas: argon2id embutido no Node

`crypto.argon2` (Node 24, verificado: funciona e é assíncrono), sem dependência nativa nem script de instalação
(ADR 0008). Parâmetros iniciais: **19 MiB de memória, 2 passes, paralelismo 1** (mínimo recomendado pela OWASP),
cerca de 50 ms nesta máquina. Não usamos 64 MiB (cerca de 250 ms): com tentativas simultâneas, a memória por tentativa
vira superfície de negação de serviço. Os parâmetros ficam no próprio hash (formato PHC), então dá para endurecer
depois e **re-hashar no login** quando os parâmetros mudarem.

Política de senha: 10 a 128 caracteres e diferente do e-mail; sem regras de composição (NIST). A senha em texto
nunca é registrada (o objeto de valor se oculta em `toString`, JSON e `inspect`).

### 4. Login e bloqueio

- Erro **único e genérico** para e-mail inexistente e senha errada.
- Com e-mail inexistente, o sistema ainda calcula um hash falso, para o tempo de resposta não revelar e-mails
  cadastrados.
- **5 falhas seguidas bloqueiam a conta por 15 minutos.** O contador reinicia no sucesso e depois que o bloqueio expira.
  O tempo entra por uma porta `Clock` (testável). Limite por IP e auditoria dos logins ficam para a camada HTTP e o
  módulo `audit`.

### 5. Sessões: JWT curto + token de renovação opaco com rotação

- **Acesso:** JWT de 15 minutos com `sub`, `org` e `sid`, assinado com HS256 (biblioteca `jose`, sem dependências,
  fixada em 6.2.12 pela política de idade do pnpm). O segredo vem do ambiente (mínimo de 32 caracteres, validado no
  boot). Permissões **não** vão no token: mudanças de papel valem na hora.
- **Renovação:** valor aleatório de 256 bits; só o hash SHA-256 é gravado. A cada uso é **trocado** (rotação). Reuso de
  um token já trocado é tratado como roubo e **revoga a família inteira**. Validade de 30 dias deslizantes, com teto
  absoluto de 90 dias desde o início da família.
- **Logout** revoga a família.

### 6. Autorização: `AccessPolicy`

Montada das atribuições do usuário e dos seus papéis. Responde `hasPermission` (em algum escopo), `can` (permissão em
uma congregação) e `scopeFor` (organização inteira, lista de congregações ou nenhuma), que é o que o guard da rota e o
filtro dos repositórios usarão (ADR 0004). Papel ausente significa nenhuma permissão (falha fechada). A checagem na
rota é feita pelo guard da camada HTTP, no passo seguinte.

### 7. Modelo de dados

Todas com `organization_id` e `version` onde há edição concorrente. O nome `user` é palavra reservada no
PostgreSQL, então a tabela é **`user_account`**.

| Tabela | Notas |
|---|---|
| `user_account` | e-mail único global (`lower(email)`), `password_hash`, `status`, falhas seguidas, `locked_until`, `last_login_at`, `version` |
| `role` | por igreja; `is_system`; nome único por igreja |
| `role_permission` | `(role_id, permission)` |
| `user_role_assignment` | `role_id` e `congregation_id` (nulo = igreja toda), com FK compostas `(organization_id, role_id)` e `(organization_id, congregation_id)` (padrão do ADR 0009) |
| `session` | `family_id`, `token_hash` único, `expires_at`, `rotated_at`, `revoked_at`, `family_started_at` |

`User` contém suas atribuições (agregado). `Role` e `Session` são agregados próprios.

### 8. Operador e primeiro administrador

O primeiro administrador nasce por comando de linha, como a primeira igreja (ADR 0009). A senha é pedida por **prompt
oculto** (e por `--password-stdin` para automação), nunca como argumento, para não ir ao histórico do shell nem à lista
de processos. A **troca da própria senha** entra nesta fatia e revoga as outras sessões.

### 9. Convenções que este módulo introduz

- `IdGenerator` sobe para `shared/application` (dois módulos o usam). `CongregationId` sobe para o kernel
  `shared/domain`, junto de `OrganizationId`, pois vários módulos referenciam congregações.
- Entra a porta `Clock` (`shared/application`); o domínio recebe `now` por parâmetro, nunca lê o relógio.

### 10. Como a camada `application` ficou (implementado)

Casos de uso: `CreateAdministrator` (operador), `Authenticate`, `RefreshSession`, `Logout`, `GetCurrentUser`,
`GetAccessPolicy` e `ChangeOwnPassword`. Portas: `UserRepository`, `RoleRepository`, `SessionRepository` (domínio),
`PasswordHasher`, `AccessTokenSigner`, `RefreshTokenCodec` e `OrganizationDirectory` (aplicação), `Clock` e
`IdGenerator` (kernel). Detalhes que não estavam nas decisões acima:

- **Falhas de login sempre iguais.** Até dado malformado (e-mail inválido, senha fora da política) vira
  `InvalidCredentials`, e e-mail inexistente ainda executa `simulateVerification`.
- **Troca atômica do token de renovação.** `SessionRepository.rotate` é condicional; quem perde a corrida é tratado
  como reuso e a família é revogada.
- **Renovar não é bloqueado por tentativas de login.** Só usuário desativado impede. Caso contrário, errar a senha de
  propósito derrubaria o dono da conta.
- **Logout recebe o token de renovação**, revoga a família e é idempotente e silencioso (token desconhecido não dá erro).
- **Trocar senha:** errar a senha atual conta como tentativa de login (um token de acesso roubado não pode adivinhar a
  senha sem limite), conta bloqueada nem é verificada, e as outras famílias são revogadas (a atual é mantida).
- **Isolamento entre igrejas:** `GetCurrentUser`, `GetAccessPolicy` e `ChangeOwnPassword` tratam usuário de outra igreja
  como inexistente; usuário desativado vira "sessão inválida" na hora, mesmo com token de acesso ainda dentro do prazo.
- **Conflito de versão** ao gravar o usuário (duas abas) é repetido até 3 vezes (`updateUser`).
- **Existência da igreja** vem da porta `OrganizationDirectory`: o `identity-access` não consulta tabelas do
  `organization`. A implementação real usará a API pública do `organization` (primeiro consumidor da seção 8 do ADR 0009).

## Consequências

- (+) O modelo é o definitivo do ADR 0004; UC-02 depois só acrescenta gestão de papéis, sem migração estrutural.
- (+) Sessões revogáveis e com detecção de roubo, sem guardar nada recuperável no banco.
- (−) Uma consulta de atribuições por requisição autenticada (pode ganhar cache depois).
- (−) E-mail global impede a mesma pessoa em duas igrejas sem nova tabela.
- (−) Segredo de assinatura único: trocar exige reemitir sessões (aceitável; renovação reemite).

## Fora de escopo

Recuperação de senha por e-mail, 2FA, convites, papéis personalizados pela interface, limite por IP, auditoria de
logins, cookies e cabeçalhos (camada HTTP).
