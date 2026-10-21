# ADR 0011 — Camada HTTP: validação, autenticação, erros e endurecimento

- **Status:** aceita
- **Data:** 2026-10-21

## Contexto

Os módulos `organization` e `identity-access` têm casos de uso prontos e testados, mas só existe `GET /health`.
Esta decisão define como o mundo externo (navegador, app, ferramentas) conversa com eles. A camada HTTP é um
**adaptador fino**: traduz requisição em chamada ao caso de uso, resultado em JSON e `DomainError` em status HTTP.
Não decide regra de negócio (a regra de camadas está em [arquitetura do código](../arquitetura-do-codigo.md)).

Será entregue em quatro passos, cada um com seus testes e seu commit: **(a)** base (erros, validação, cabeçalhos,
CORS, limite de taxa), **(b)** autenticação e guards, **(c)** endpoints de congregações, **(d)** OpenAPI.

## Decisões

### 1. Express (o padrão do Nest)

O Fastify é mais rápido, mas para o porte do sistema (centenas de membros) a diferença não aparece, e o ecossistema de
cookies e middlewares é mais direto no Express. Trocar depois custa pouco porque os controllers não tocam em
`req`/`res` de forma específica (exceção: a leitura/escrita do cookie de renovação, isolada num único lugar).

### 2. Validação com Zod, schemas em `packages/contracts`

O mesmo schema valida no servidor e, depois, no navegador e no app: é o ganho de ter um monorepo. Um `ZodPipe` próprio
(cerca de 20 linhas) aplica o schema; **não** usamos o `nestjs-zod` porque ele declara suporte ao Nest só até a
versão 11, nem o `class-validator`, que não é compartilhável com o front. Entrada malformada responde **400**; o
detalhe lista só caminho e mensagem de cada problema, **nunca o valor enviado** (uma senha digitada no campo errado não
pode voltar na resposta nem ir para um log).

### 3. O tenant vem do token, nunca do corpo nem da URL

O `RequestContext {organizationId, actorId}` é montado pelo guard a partir do token. Recurso de outra igreja responde
**404**, e não 403, para não revelar que ele existe (ADR 0003).

### 4. Autenticação

- O token de acesso (JWT de 15 min) vai no cabeçalho `Authorization: Bearer`. No navegador fica **só em memória**.
- Guard **global que nega por padrão**: só `@Public()` libera uma rota. Esquecer o decorator fecha a rota em vez de
  abri-la.
- A cada requisição o guard carrega a `AccessPolicy` (o módulo já garante que permissões não vão no token), então mudar
  o papel de alguém vale na hora. `@RequirePermission(...)` exige a permissão em algum escopo; a checagem por
  congregação (`policy.can`) entra na fatia do RBAC completo (ADR 0004).
- **Limite aceito:** uma sessão revogada (logout em outro aparelho) continua valendo no token de acesso por até 15
  minutos. Usuário desativado já é barrado na hora (ADR 0010, seção 10).

### 5. Token de renovação em cookie `httpOnly`

`Set-Cookie` com `HttpOnly; Secure; SameSite=Strict; Path=/auth`. Script injetado (XSS) não consegue lê-lo, e o
navegador só o envia às rotas de renovação e saída. **CSRF:** `SameSite=Strict` mais CORS com lista fechada de origens.
**Alternativa descartada por ora:** devolver o token no corpo e deixar o front guardá-lo (mais simples, serve ao mobile,
mas o expõe a XSS no navegador). O app mobile ganhará uma entrega própria quando existir.

### 6. Erros no formato RFC 9457 (`application/problem+json`)

```json
{ "type": "about:blank", "title": "Conflict", "status": 409, "code": "organization.congregation_name_taken",
  "detail": "Já existe uma congregação com este nome.", "requestId": "…", "errors": [{ "path": "name", "message": "…" }] }
```

`code` é o do `DomainError` (estável, o cliente reage a ele); `detail` é a mensagem em português; `errors` só existe
para entrada malformada. A tabela **código → status** fica num único arquivo e um teste varre o código-fonte e **falha
se algum `code` novo não tiver entrada** (esquecer a tradução viraria um 500 silencioso em produção).

| Status | Quando |
|---|---|
| 400 | corpo/parâmetros malformados (Zod) |
| 401 | credenciais inválidas, sessão inválida ou reuso do token de renovação |
| 403 | autenticado, mas sem a permissão |
| 404 | não encontrado (inclusive recurso de outra igreja) |
| 409 | conflito de estado: nome repetido, já está nesse estado, versão desatualizada |
| 422 | valor recusado por regra de domínio (`validation.invalid_value`, senha atual incorreta) |
| 429 | limite de taxa |
| 500 | erro inesperado ou estado corrompido: mensagem genérica; o detalhe vai só para o log |

Código de domínio **sem** entrada na tabela também responde 500 (falha visível, não um palpite).

### 7. Endurecimento (passo a)

- `helmet` (cabeçalhos de segurança) e **CORS com lista de origens** em `CORS_ORIGINS` (vazia = nenhuma origem
  cruzada), com credenciais habilitadas por causa do cookie.
- Limite de taxa global por IP com `@nestjs/throttler` (armazenamento em memória: serve a uma instância; várias
  instâncias exigirão um armazenamento compartilhado, decisão da hospedagem, ADR 0007). Limites mais apertados no
  login e na renovação entram no passo (b), somando-se ao bloqueio por conta do ADR 0010.
- Corpo JSON limitado a 100 kb; `X-Request-Id` por requisição (aceita o enviado só se tiver formato seguro), repetido no
  corpo dos erros para rastrear.
- **Pendente (hospedagem):** `trust proxy`. Atrás de um proxy reverso o IP visto é o do proxy e o limite por IP
  passaria a valer para todos juntos; configurar quando o ADR 0007 for decidido.

### 8. `GET /health` deixa de lançar exceção do Nest

O controller passa a definir o status (200/503) diretamente e devolver o contrato, em vez de lançar
`ServiceUnavailableException(corpo)`. Assim o filtro de erros pode tratar **toda** exceção HTTP de forma uniforme, e o
health continua com o mesmo corpo (contrato `healthResponseSchema`).

### 9. Rotas sem prefixo de versão

Sem `/v1` por ora: há um único cliente, que evolui junto com a API (mesmo monorepo). O prefixo entra quando um segundo
cliente depender do contrato.

### 10. OpenAPI por último (passo d)

O Zod 4 gera JSON Schema nativamente (`z.toJSONSchema`, verificado), então a documentação sai dos mesmos schemas do
contrato, sem duplicar. `@nestjs/swagger` (compatível com o Nest 12) serve a interface. Fica por último para não
atrasar o login.

### 11. Como o passo (b), autenticação, ficou (implementado)

Endpoints: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` e `POST /auth/change-password`.
Contratos Zod em `packages/contracts` (`auth.ts`).

- **O token de renovação nunca está no corpo**, nem de entrada nem de saída: só no cookie. O corpo do login devolve o
  token de acesso, a validade e o usuário; o da renovação devolve só o token de acesso e a validade. Respostas com token
  levam `Cache-Control: no-store`.
- **Cookie `refresh_token`:** `HttpOnly`, `SameSite=Strict`, `Path=/auth` e `Expires` igual ao da sessão. O atributo
  `Secure` fica ligado em todo ambiente **menos `NODE_ENV=development`**: o Safari não grava cookie `Secure` em
  `http://localhost`. Sem HTTPS em produção o navegador simplesmente não guardaria o cookie, então o erro seria visível.
  Quando a renovação falha por sessão inválida ou por **reuso**, o cookie é apagado na própria resposta.
- **Sem `cookie-parser`:** ler um único cookie dispensa uma dependência (e uma superfície de ataque); são 15 linhas, com
  teste, em `refresh-cookie.ts`, o único arquivo que toca em cookie.
- **Guard global (`AuthGuard`, no `identity-access`)** é registrado como `APP_GUARD` e vale para todos os módulos. Fluxo:
  rota `@Public()`? libera. Senão, confere o JWT (só HS256; recusa `none`, outro algoritmo, token sem `exp` e id
  malformado), monta o `RequestContext` **a partir do token**, carrega a política de acesso e confere
  `@RequirePermission`. Os marcadores (`@Public`, `@RequirePermission`, `@CurrentContext`) ficam em
  `platform/http/access-control.ts` para qualquer módulo usá-los sem depender do `identity-access`.
- **Token válido de conta que não existe mais, foi desativada ou é de outra igreja → 401**, não 404: o motivo não vaza.
- **Sem permissão → 403** (`identity.permission_denied`, novo código na tabela).
- **`GET /health` e `POST /auth/login|refresh|logout` são `@Public()`.** O logout é público porque quem sai pode estar com
  o token de acesso vencido; a prova de quem é está no cookie. É idempotente: 204 mesmo sem cookie.
- **Limites por IP e por rota,** mais apertados que o global de 100 por minuto: login 10, renovação 30 e troca de senha
  10 por minuto. Somam-se ao bloqueio por conta (ADR 0010), que não depende de IP.
- **A verificação do token é uma porta** (`AccessTokenVerifier`, na `application`), implementada pela mesma classe `jose`
  que assina, com a mesma chave.
- **Como foi testado:** a aplicação HTTP inteira (guard, filtro de erros, limite de taxa, cookies) sobe com
  repositórios **em memória** (`auth.http.spec.ts`), sem precisar de banco; o PostgreSQL já é coberto pelos testes de
  contrato dos repositórios. Fez-se também a mutação manual em 19 pontos que os testes pegaram (guard, atributos do cookie, limites,
  verificação do JWT); um mutante era equivalente e não conta (o brand do id já recusa `sid` ausente).
- **Limite conhecido:** não há ainda um teste ponta a ponta HTTP contra o PostgreSQL real; o `pnpm test:integration`
  existente continua sendo o que roda com banco.

### 12. Como o passo (c), congregações, ficou (implementado)

| Rota | Permissão | Escopo exigido |
|---|---|---|
| `GET /organization` | `organization:read` | em algum escopo |
| `PATCH /organization` | `organization:manage` | **igreja toda** |
| `GET /congregations?status=` | `organization:read` | em algum escopo |
| `POST /congregations` (201) | `organization:manage` | **igreja toda** |
| `PATCH /congregations/:id` | `organization:manage` | **igreja toda** |
| `POST /congregations/:id/deactivate`, `/reactivate`, `/designate-headquarters` | `organization:manage` | **igreja toda** |

- **Sem `:id` para a igreja.** `/organization` é sempre a do usuário logado (do token). Em `/congregations/:id`, o id
  de congregação de **outra igreja responde 404**, igual a um que não existe; verificado por teste que confere que a
  outra igreja ficou intacta.
- **`@RequirePermission(permissão, { organizationWide: true })`.** O guard só conferia "tem a permissão em ALGUM
  escopo", o que deixaria um dirigente de **uma** congregação criar ou desativar congregações de **todas** (os casos de
  uso não filtram por escopo; ainda). A opção nova exige a permissão na igreja toda (`AccessPolicy.hasOrganizationWide`).
  É o primeiro uso real do escopo do ADR 0004. Ler (`organization:read`) continua valendo em qualquer escopo: quem
  opera uma congregação precisa enxergar as outras.
- **Ações de situação são `POST` em sub-recurso**, e não `PATCH` de um campo `status`: cada uma tem regra própria (a
  sede não pode ser desativada; só congregação ativa vira sede) e devolve a congregação já atualizada. Respondem 200.
- **Corpo que o cliente não deveria mandar é descartado**, não rejeitado: `organizationId`, `isHeadquarters` e `status`
  enviados na criação são ignorados (o Zod remove campos desconhecidos). `PATCH`: campo ausente = manter,
  `address: null` = remover o endereço, `serviceTimes: []` = remover os horários.
- **Dois níveis de validação.** O contrato (`packages/contracts/src/organization.ts`) barra o que é mal formado e
  limita tamanhos (400, com o caminho do campo); as regras de verdade (UF existente, nome único sem diferenciar caixa,
  horários sem conflito) continuam no domínio (422 ou 409). O `:id` da URL é validado como UUID (400).
- **Os controllers do módulo não importam o `identity-access`.** Os marcadores ficam em `platform/http`; importar o
  módulo daria um ciclo (o `identity-access` já importa o `organization`).
- **Testes:** `organization.http.spec.ts` sobe a aplicação inteira com repositórios em memória e **duas igrejas** (31
  testes: permissões e escopo, isolamento entre igrejas, regras de situação, formato do contrato). Os helpers
  (`startHttpTestApp`) foram extraídos para serem usados também pelos próximos módulos. Mutação manual em 11 pontos
  (permissões, escopo, validações, ação trocada, status HTTP): todos pegos depois de dois testes acrescentados.

## Consequências

- Todo cliente recebe erros num formato único e previsível; a web mostra `detail` e reage a `code`.
- Esquecer `@Public()` ou uma permissão **fecha** a rota, não a abre.
- Duas dependências de produção novas (`helmet`, `@nestjs/throttler`) e `supertest` (já presente) para testes ponta a
  ponta; todas respeitam a política de idade do pnpm (ADR 0008).
