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

## Consequências

- Todo cliente recebe erros num formato único e previsível; a web mostra `detail` e reage a `code`.
- Esquecer `@Public()` ou uma permissão **fecha** a rota, não a abre.
- Duas dependências de produção novas (`helmet`, `@nestjs/throttler`) e `supertest` (já presente) para testes ponta a
  ponta; todas respeitam a política de idade do pnpm (ADR 0008).
