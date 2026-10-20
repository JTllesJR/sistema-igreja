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
- Tabelas em `snake_case` no banco (`@@map`/`@map`), ids UUID v7 gerados pelo Prisma.

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
