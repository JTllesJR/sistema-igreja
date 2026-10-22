# ADR 0016 — OpenAPI gerado dos controllers reais, com Swagger UI desligada por padrão

- **Status:** aceita (refina o item 10 do [ADR 0011](0011-camada-http.md))
- **Data:** 2026-10-22

## Contexto

O [ADR 0011](0011-camada-http.md) deixou o OpenAPI para o fim e previa o `@nestjs/swagger`. Agora a API tem 51 rotas em
8 controllers, e o front-end (uma fase própria, depois do backend) vai precisar de um contrato legível por máquina para
gerar o cliente tipado (ADR 0002) e por gente para entender o que existe.

O projeto já descreve entradas e saídas com **schemas Zod** no pacote `contracts`, e a validação usa esses mesmos schemas
(`ZodValidationPipe`). Qualquer solução que descreva a API **de novo** em outro lugar vai ficar desatualizada.

## Decisão

### 1. O documento sai dos controllers reais, não de uma descrição paralela

`buildOpenApiDocument` lê os metadados que o próprio Nest já guarda: caminho e verbo, código HTTP (`@HttpCode`), rota
pública (`@Public`), permissão exigida (`@RequirePermission`, com "igreja toda" ou não), limite de taxa (`@Throttle`) e,
principalmente, os **schemas dos `ZodValidationPipe`** de `@Body`, `@Query` e `@Param`. O schema que **valida** a entrada é,
por construção, o que a documentação **mostra**: não existe como divergirem. O marcador do método vale e, na falta dele, o
da classe (como no guard), então `@Public()` num controller inteiro (o `/health`) é lido corretamente.

O JSON Schema vem de `z.toJSONSchema` (nativo do Zod 4), em `draft-2020-12`, o dialeto do OpenAPI 3.1. Entradas usam o
lado "input" (o número que chega como texto na URL aparece como o texto que o cliente manda); saídas, o lado "output".

### 2. Uma anotação por rota: `@ApiDoc({ summary, description?, response })`

O TypeScript apaga o tipo de retorno, então o schema da **resposta** não dá para descobrir. Cada rota declara o resumo e o
schema da resposta (`null` para 204). **É obrigatório**: o construtor lança erro se uma rota estiver sem `@ApiDoc`, se uma
resposta sem corpo não for 204 ou se duas rotas tiverem o mesmo verbo e caminho. Documentação faltando é erro, não lacuna.

### 3. Controller novo entra sozinho; esquecer a conferência falha o teste

O documento é montado em execução a partir dos controllers que o Nest registrou (`ModulesContainer`). Um teste sobe a
aplicação com todos os módulos e confere que o número de operações é **igual ao número de decoradores de verbo** nos
arquivos `*.controller.ts`: um controller novo, ou esquecido no teste, derruba a conta.

### 4. Desligada por padrão (`OPENAPI_ENABLED=false`)

`/openapi.json` e `/docs` respondem **404** (como se não existissem) a menos que `OPENAPI_ENABLED=true`. O mapa completo
da API é reconhecimento de graça para um atacante; fica ligado em desenvolvimento (`.env.example`) e, se fizer sentido, num
ambiente interno. As rotas são abertas (sem login) porque o documento só descreve a API: nenhum dado entra nele (há teste
que confere isso). Chamar a API de verdade continua exigindo login.

### 5. Interface: `swagger-ui-dist`, servido de uma lista fechada de arquivos

Uma dependência nova, **estática** (CSS e JS prontos, sem código nosso dentro): `swagger-ui-dist` na **5.33.1**, com mais
de duas semanas de publicação (respeita o `minimumReleaseAge`, ADR 0008). Cuidados:

- A dependência traz o `@scarf/scarf`, cujo `postinstall` só envia **telemetria de uso**. Fica **recusado de propósito** em
  `allowBuilds` (`'@scarf/scarf': false`), e o `pnpm install --frozen-lockfile` do CI continua passando.
- Só três arquivos do pacote são servidos, mais o nosso `docs-init.js` (que é um texto no código). Nada de caminho escolhido
  pelo cliente: `package.json`, `.map`, `index.html` e tentativas de sair da pasta respondem 404 (testado).
- A página não tem `<script>` embutido: a política de segurança do `helmet` (`script-src 'self'`) **não foi afrouxada**.
- "Try it out" fica desligado por padrão na interface; o botão **Authorize** aceita o token de acesso (JWT).

## Alternativas consideradas

- **`@nestjs/swagger` (o que o ADR 0011 previa):** exige uma classe DTO decorada por rota e plugin do compilador; com schemas
  Zod e tipos simples, cada rota precisaria de `@ApiBody({ schema })` repetindo o que o pipe já sabe. Mais código, mais
  dependências e a mesma chance de divergir. Descartado.
- **`nestjs-zod` ou `zod-to-openapi`:** resolvem a ponte, mas são mais uma dependência para algo que o Zod 4 já faz
  (`toJSONSchema`) e que cabe em ~300 linhas testadas. Descartados (ADR 0008: dependência nova só com motivo forte).
- **Arquivo OpenAPI escrito à mão:** a descrição paralela que este ADR existe para evitar.
- **Redoc ou Scalar em vez de Swagger UI:** interfaces mais bonitas, mas mais pesadas ou dependentes de CDN; a política de
  segurança do `helmet` bloquearia scripts de terceiros. Trocar a interface depois é barato: o documento é o mesmo.

## Consequências

- (+) Documentação sempre igual ao que valida: rota nova sem `@ApiDoc` não passa nos testes.
- (+) Base pronta para gerar o cliente tipado do front-end (por exemplo, `openapi-typescript`) na fase de front.
- (+) `operationId` estável (`Controller_método`), bom para cliente gerado.
- (−) A **resposta** vem do que o desenvolvedor declara em `@ApiDoc`: se o código devolver outra coisa, nada confere
  (os testes HTTP já validam as respostas contra os mesmos schemas `contracts`, o que cobre a maior parte).
- (−) As respostas de erro listadas são **possíveis**, deduzidas por regra (entrada → 400, rota protegida → 401/403, caminho
  com `{id}` → 404, não-GET → 409/422, todas → 429); a lista exata de `code` por rota não está no documento.
- (−) Mais uma dependência (`swagger-ui-dist`) e uma exceção documentada no `allowBuilds`.
- (−) Em produção, com `OPENAPI_ENABLED=false`, a documentação não está disponível na própria API; quem precisar dela fora
  de desenvolvimento ou liga a opção ou gera o arquivo em ambiente de desenvolvimento.
