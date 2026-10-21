# Arquitetura do código (apps/api)

Como o monólito modular (ADR 0001) se traduz em pastas e regras. Vale para todo módulo novo.

## Mapa de pastas

```
apps/api/src/
  main.ts                 ponto de entrada (sobe o Nest)
  app.module.ts           compõe os módulos
  platform/               infraestrutura transversal (NÃO é negócio)
    config/               variáveis de ambiente validadas (Zod), token ENV
    database/             PrismaService + DatabaseModule
  modules/                um diretório por módulo de negócio
    health/               (exemplo mínimo: controller + service)
    <modulo>/
      <modulo>.module.ts  declara o módulo Nest e o que ele EXPORTA
      index.ts            API pública do módulo (único ponto de entrada para outros módulos)
      presentation/       controllers, DTOs (schemas Zod) — fala HTTP
      application/        casos de uso: orquestram, controlam transação e autorização
      domain/             entidades, value objects, regras, interfaces de repositório — TypeScript puro
      infrastructure/     repositórios com Prisma, adaptadores (e-mail, storage...)
  generated/              cliente Prisma (gerado, não versionado)
```

## Regras de dependência

```
presentation ──▶ application ──▶ domain ◀── infrastructure
```

1. **`domain` não importa nada de framework, banco ou `platform`.** Só TypeScript e outros arquivos do próprio
   `domain`. **Verificado pelo linter** (`.oxlintrc.json`): importar `@nestjs/*`, `@prisma/*`, `pg`, `generated` ou
   `platform` dentro de `src/modules/*/domain/` quebra o `pnpm lint`.
2. `application` depende de **interfaces** do `domain` (ex.: `MemberRepository`). Quem as implementa é a
   `infrastructure`, ligada pelo container de injeção do Nest. É a inversão de dependência na prática.
   Casos de uso são classes comuns, **sem decorators do Nest**: o `.module.ts` faz a ligação (`useFactory`).
   **Verificado pelo linter**, assim como no `domain` (ADR 0009).
3. **Um módulo não acessa as tabelas de outro.** Para dados de outro módulo, chame o que ele exporta em
   `index.ts`, ou reaja a um evento de domínio. Referências cruzadas no banco são só IDs.
4. **Nunca importe de dentro de outro módulo** (`../members/domain/...`). Importe do `index.ts` dele.
   *(Pendente: ainda não há regra automática para isso; entra junto com o segundo módulo real, ver "Próximos passos".)*
5. Módulos Nest são importados **explicitamente** por quem os usa. O único `@Global()` é o `ConfigModule`.

## Convenções

- Arquivos em `kebab-case` com sufixo de papel: `create-member.use-case.ts`, `member.repository.ts`.
- Imports relativos terminam em `.js` (projeto ESM com `nodenext`), mesmo apontando para arquivos `.ts`.
- Testes unitários ao lado do código (`*.spec.ts`); integração em `apps/api/test/` (`*.integration-spec.ts`).
- Contratos que cruzam a fronteira da API (corpo de resposta, DTOs) vivem em `packages/contracts` como schemas Zod.
- Toda tabela de negócio tem `organization_id` (ADR 0003), e todo repositório filtra por ele.
- Tabelas em `snake_case` no banco (`@@map`/`@map`).
- **A partir do módulo `organization` (ADR 0009):** os ids UUID v7 são gerados pelo domínio, por uma porta
  `IdGenerator`, e não pelo Prisma; todo caso de uso recebe `execute(contexto, comando)` com
  `contexto = { organizationId, actorId }`. O banco não tem default de id; o gerador é `UuidV7IdGenerator`.
- **Kernel compartilhado (`src/shared`)**: só o que mais de um módulo usa, sem regra de negócio de nenhum deles:
  `DomainError`/`ValidationError`, ids de tenant (`OrganizationId`, `CongregationId`, `ActorId`), `RequestContext`,
  `IdGenerator` (+ `UuidV7IdGenerator`) e utilitários de texto. Um módulo nunca coloca ali o que é só seu.
- **`presentation` é todo adaptador de entrada**, não só HTTP: o comando de linha do operador
  (`presentation/cli` + `src/cli.ts`) é função comum que devolve código de saída; o `src/cli.ts` só sobe o contexto
  do Nest (sem servidor) e a chama. Assim o comando é testável sem processo.
- **Raiz de composição:** o `<modulo>.module.ts` liga cada porta à sua implementação (`useFactory`) e cria os casos de
  uso. É o único lugar que conhece `application` e `infrastructure` ao mesmo tempo.
- **Repositórios cumprem um teste de contrato** (`describe<...>RepositoryContract`) e rodam contra o fake em memória
  e contra o PostgreSQL. Teste de integração cobre ainda o que só o banco real prova (índices, concorrência, rollback).
- Restrições que o Prisma não expressa (índices parciais ou funcionais) vão em SQL manual na migration e devem ser
  preservadas ao alterar a tabela. Referências a tabelas de outros módulos usam FK composta `(organization_id, id)`.

## Como criar um módulo novo (checklist)

1. Criar `src/modules/<nome>/` com as quatro camadas acima (só as necessárias).
2. Modelar as tabelas no `prisma/schema.prisma` e gerar a migration (`pnpm db:migrate`), revisando o SQL.
3. Escrever o domínio e seus testes unitários primeiro (sem Nest, sem banco).
4. Casos de uso na `application`; repositórios na `infrastructure`; controller na `presentation`.
5. Exportar somente o necessário em `index.ts` e registrar o módulo em `app.module.ts`.
6. Testes de integração para o que depende de banco (repositórios, consultas com escopo de congregação).

## Próximos passos de arquitetura (fora da Fase 1)

- Pipe de validação com Zod e filtro global de exceções (entram com o primeiro endpoint de negócio).
- OpenAPI gerado a partir dos schemas Zod.
- Regra automática de fronteira entre módulos (dependency-cruiser ou regra de lint) quando existirem dois módulos reais.
- Log estruturado (pino) e identificador de requisição.
- Autenticação e RBAC com escopo (Fase 2, ADR 0004).
