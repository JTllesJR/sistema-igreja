# ADR 0009 — Módulo `organization`: agregado, ordem de construção e integridade

- **Status:** aceita
- **Data:** 2026-10-20

## Contexto

`organization` é o primeiro módulo de negócio. Cobre o UC-05 (congregações) e o UC-17 (criar a organização inicial).
Camadas, pastas e regras de dependência já estão em [arquitetura do código](../arquitetura-do-codigo.md) e em
[diagramas/arquitetura.md](../diagramas/arquitetura.md) (§4); **este ADR não as repete**. Registra o que é
específico do módulo e as convenções que os próximos módulos herdam.

## Decisões

### 1. Agregado: `Organization` contém as `Congregation`

Uma regra atravessa várias congregações: *há exatamente uma sede por organização*. Com a congregação como agregado
separado, nenhum objeto de domínio conseguiria garanti-la. Como uma igreja tem de 3 a algumas dezenas de
congregações, carregá-las junto com a organização é barato.

Invariantes garantidas pelo domínio (testáveis sem banco):

1. Sempre há exatamente uma sede, e ela está ativa.
2. O nome da congregação é único na organização, sem diferenciar maiúsculas, acentos ou espaços nas pontas.
3. Congregação **não é excluída**: fica `ACTIVE` ou `INACTIVE`. Há membros e finanças ligados a ela.
4. A sede não pode ser desativada. Para desativá-la, designa-se outra sede antes.
5. `designateHeadquarters` é uma operação única: a nova sede precisa estar ativa, e a troca nunca deixa 0 ou 2 sedes.

`status` (regra de negócio, visível e reversível) é distinto de `deleted_at` (soft delete de cadastro): congregação não
usa `deleted_at`.

**Alternativa descartada:** congregação como agregado próprio, com a regra da sede só no banco. A regra viraria um
`if` no caso de uso ou uma exceção de banco traduzida, sem lugar natural no domínio.

### 2. Ordem de construção: sem HTTP até existir autenticação

Primeiro `domain`, `application` e `infrastructure`, testados sem HTTP. A `presentation` só entra depois do
`identity-access`, porque a organização vem do usuário autenticado e nunca de parâmetro do cliente (ADR 0003).
Nenhum endpoint de dados de uma igreja fica aberto, nem provisoriamente.

A primeira organização nasce por **comando de linha** (UC-17), que chama o mesmo caso de uso. Não há endpoint público
de criação de igrejas (self-service está fora de escopo, ADR 0003). O primeiro administrador será criado por comando
equivalente no `identity-access`.

### 3. IDs gerados pelo domínio (UUID v7)

O agregado precisa de identidade antes de ser salvo. Uma porta `IdGenerator`, implementada com o pacote `uuid`
(v7, ordenável por tempo), gera os IDs; os testes usam um gerador previsível. O `@default(uuid(7))` do Prisma deixa
de ser usado nas tabelas do módulo e a convenção em `arquitetura-do-codigo.md` passa a refletir isso.

### 4. Contexto explícito em todo caso de uso

`execute(contexto, comando)`, com `contexto = { organizationId, actorId }`. Quando a autenticação chegar, as
assinaturas não mudam. Vale para todos os módulos.

**Única exceção:** UC-17 (criar a organização), porque o tenant ainda não existe, é ele que está sendo criado.
`OrganizationId` e `ActorId` moram no kernel compartilhado (`shared/domain/identifiers.ts`), pois todo módulo os usa.
Como nenhum caso de uso aceita outro id de organização além do `contexto`, **não existe caminho de código** para
tocar os dados de outra igreja; isso é verificado por testes (`tenant-isolation.use-case.spec.ts`).

### 5. Persistência

- **Timestamps** (`created_at`, `updated_at`) são só da persistência; o domínio não os conhece.
- **Sem Unit of Work.** Salvar um agregado é uma transação. Operações que cruzem módulos usarão eventos quando
  houver consumidor real (hoje não há infraestrutura de eventos nem consumidor).
- **Concorrência:** coluna `version` na `organization` (travamento otimista). `UPDATE ... WHERE id = ? AND version = ?`;
  se nenhuma linha mudar, o caso de uso falha com conflito (HTTP 409 na etapa de `presentation`).
- **Endereço e horários de culto** em colunas `JSONB`, validados por value objects e Zod na escrita. São pertencentes
  à congregação, não são consultados isoladamente. Contrapartida: sem restrições no nível do banco e relatórios por
  cidade exigirão consultas em JSON; reavaliar se isso virar requisito.
- **Liderança** (dirigentes) fica fora: são membros, e `members` ainda não existe.

### 6. Integridade também no banco

O domínio protege contra bugs; o banco protege contra concorrência e contra qualquer caminho que não passe pelo
domínio. Três restrições na migration de `congregation`:

| Restrição | Garante |
|---|---|
| `UNIQUE (organization_id) WHERE is_headquarters` | uma sede por organização |
| `UNIQUE (organization_id, lower(name))` | nome único por organização, sem diferenciar caixa |
| `UNIQUE (organization_id, id)` | permite que outras tabelas usem **FK composta** `(organization_id, congregation_id)`, impedindo que um registro aponte para congregação de outra organização |

As duas primeiras não são expressáveis no `schema.prisma`; vão em SQL manual na migration.

**Verificado em 2026-10-20** (PostgreSQL 17.11, Prisma 7.10.1):

- `prisma migrate diff` entre as migrations (com os índices manuais) e o schema devolve *empty migration*: o Prisma não
  trata os índices como deriva e não tentará removê-los.
- Uma segunda sede na mesma organização é recusada; sedes de organizações diferentes coexistem.
- O mesmo nome com outra caixa na mesma organização é recusado; em organizações diferentes é aceito.
- Várias congregações comuns na mesma organização são aceitas.

**Limites conhecidos:**

- `lower()` não ignora acentos. O domínio normaliza (caixa, acentos, espaços) e rejeita antes; o banco é a rede de
  segurança só para o caso de caixa.
- Trocar a sede exige **desmarcar a antiga antes de marcar a nova**, dentro da mesma transação. Índice único não é
  adiável (`DEFERRABLE` só existe para constraints), então a ordem dos `UPDATE`s importa. O repositório precisa respeitar
  isso, e o teste de integração do repositório deve cobrir a troca de sede (a escrever junto com o módulo).

### 7. API (etapa de `presentation`)

Recursos em inglês, como o [glossário](../glossario.md). A organização vem do token, não da URL. Mudanças de estado
são sub-recursos de ação, porque têm regras e falhas próprias:

```
GET   /organization                             PATCH /organization
GET   /congregations                            POST  /congregations
PATCH /congregations/:id
POST  /congregations/:id/deactivate             POST  /congregations/:id/reactivate
POST  /congregations/:id/designate-headquarters
```

### 8. Fronteira pública do módulo

O `index.ts` expõe só **consultas somente-leitura**, por exemplo `congregationExists(organizationId, congregationId)`
e `listCongregationIds(organizationId)`, usadas por `identity-access` para validar o escopo de uma atribuição e por
`members`/`finance` para validar a congregação de destino. Entidades e repositório não são exportados. Eventos de
domínio (ex.: congregação desativada) entram quando houver um consumidor.

### 9. `application` sem framework; contrato do repositório

- Casos de uso são **classes comuns** (sem `@Injectable`, sem import do Nest): dependem de interfaces
  (`OrganizationRepository`, `IdGenerator`) e são testados com `new` e fakes. A ligação interface → implementação
  fica no `organization.module.ts`. O **linter impõe** isso (`.oxlintrc.json`): `application` não importa
  `@nestjs/*`, `@prisma/*`, `pg`, `generated`, `platform`, `infrastructure` nem `presentation`; `domain` não importa
  nenhuma das camadas externas. Custo: um pouco mais de código de ligação no módulo.
- `OrganizationRepository` (porta, no `domain`) tem `findById`, `add` (insere; falha se o id existe) e `save`
  (grava o agregado inteiro em uma operação atômica, com travamento otimista por `version`).
- Os casos de uso devolvem **visões** simples (`OrganizationView`, `CongregationView`), não objetos de domínio.
- **Teste de contrato** (`describeOrganizationRepositoryContract`): uma bateria que descreve o comportamento exigido
  de qualquer repositório (cópias independentes, conflito de versão, troca de sede). Roda hoje contra o repositório em
  memória e, quando existir, contra o Prisma/PostgreSQL: a mesma bateria nas duas garante que o fake dos testes se
  comporta como o real.

## Consequências

- (+) A regra mais delicada do módulo (sede única) vive no domínio, é testada em milissegundos e tem rede de
  segurança no banco.
- (+) A FK composta estabelece desde já o padrão contra vazamento entre organizações para os próximos módulos.
- (+) Contexto explícito e `IdGenerator` evitam refatoração quando chegarem autenticação e testes mais complexos.
- (−) Carregar todas as congregações a cada alteração. Aceitável na escala prevista; se uma organização passar de
  centenas de congregações, reavaliar o agregado.
- (−) Duas migrations manuais (índices) que o Prisma não regenera: quem mexer em `congregation` precisa preservá-las.
- (−) JSONB para endereço troca restrições do banco por validação na aplicação.

## Fora de escopo

Liderança da congregação, relatórios à sede e comunicação interna (v1.1), eventos de domínio, e qualquer endpoint
HTTP do módulo (aguardam `identity-access`).
