# ADR 0017 — Consulta à trilha de auditoria (UC-04)

- **Status:** aceita
- **Data:** 2026-10-22

## Contexto

A trilha de auditoria ([ADR 0013](0013-modulo-members-e-auditoria.md)) já grava, de forma somente-anexação, quem fez o quê:
leituras de dado sensível de membros, todas as escritas do financeiro, decisões de aprovação. Faltava **ler** a trilha (UC-04,
"Administrador, Diretoria"). A trilha não guarda dado pessoal por regra, mas **mostra quem leu o quê**: consultá-la é, em si,
uma operação sensível, e a tabela só cresce.

## Decisões

### 1. Permissão `audit:read`, só para a igreja toda

Nova permissão do módulo `audit` ([ADR 0004](0004-rbac-com-escopo.md)). Exige a **igreja toda** (a rota usa
`organizationWide`, e o caso de uso confere de novo): a trilha cruza todas as congregações, então "ler a trilha da minha
congregação" não existe. Quem tem: o **Administrador** (curinga `*`) e a **Diretoria** (papel padrão, que passa a ter
`audit:read`; a sincronização de papéis de sistema do ADR 0015 atualiza as igrejas existentes). O Dirigente, o Secretário e o
Tesoureiro **não** consultam a trilha.

### 2. A consulta é registrada, antes de devolver, e falha fechada

Quem consulta a trilha sabe quem leu cada ficha. Por isso a consulta grava `audit.queried` **antes** de devolver; se a
gravação falhar, nada é devolvido (o mesmo contrato das leituras sensíveis, ADR 0013). O registro leva só a **contagem** e os
**nomes** dos filtros usados (`entityId,module`), **nunca os valores**: o id de um membro que alguém buscou é dado do titular.

### 3. Filtros e página por cursor

Filtros: quem fez (`actorId`), tipo e dado afetado (`entity`, `entityId`), ação exata (`action`), módulo (`module=finance`
casa `finance.*`, sempre como texto literal: curingas de `LIKE` são escapados) e período (`from` e `to`, inclusivos, em UTC).
A ordem é do mais recente para o mais antigo (instante e, no empate, `id`).

A paginação é **por cursor** `(instante, id)`, não por `OFFSET`: a trilha só cresce, e `OFFSET` fica mais lento a cada página.
Também **não há contagem total** (um `COUNT(*)` numa tabela enorme custa caro): a consulta pede um registro a mais para saber se
há próxima página e devolve `nextCursor` (ou `null`). O cursor é opaco para o cliente e não é segredo: a igreja do token sempre
entra na consulta, então um cursor forjado só anda dentro da própria trilha de quem consulta.

### 4. A trilha devolve ids, não nomes

`actorId` e `entityId` saem como ids. Resolver "quem é esse usuário" é com o `identity-access` (`GET /users`), e "quem é esse
membro" exigiria ler dado sensível: a tela de consulta decide o que mostrar. A trilha continua sem dado pessoal.

### 5. Estrutura: um segundo módulo Nest para a consulta

`AuditModule` (escrita, `AUDIT_LOG`) continua como era e é importado pelo `identity-access`. A consulta vive em
`AuditTrailModule`, com ponto de entrada próprio (`modules/audit/trail.ts`). Motivo: o controller da consulta usa a política de
acesso do `identity-access`, que importa o `AuditModule` para gravar; juntos, no mesmo arquivo de entrada, formariam um **ciclo
de importações** (o decorator rodaria antes de a classe existir). Separados, não há ciclo.

### 6. Índice por autor

Migration `20261022140000_audit_actor_index`: índice `(organization_id, actor_id, occurred_at)` para o filtro "quem fez". Só um
índice, sem tocar nas linhas, então o gatilho de somente-anexação não é afetado. O filtro por ação usa `LIKE 'módulo.%'`; um
índice para ele fica para quando a tabela justificar.

## Alternativas consideradas

- **Consulta por congregação:** a trilha não tem congregação (só `organization_id`); inventar esse vínculo seria guardar mais
  dado na trilha.
- **`OFFSET` e total de resultados:** mais simples, mas degrada com o tamanho da trilha e custa uma contagem a cada página.
- **Não registrar a consulta:** mais simples, mas deixaria a leitura mais reveladora do sistema sem rastro.
- **Devolver nome do usuário e do membro na trilha:** vira um segundo cadastro de pessoas e uma leitura sensível escondida.

## Consequências

- (+) A Diretoria fiscaliza leituras e aprovações sem acesso ao banco, e a consulta é, ela mesma, rastreável.
- (+) A paginação continua barata com a trilha crescendo.
- (−) Sem total de resultados nem "ir para a página N" (a interface navega pelo cursor).
- (−) O filtro por módulo usa `LIKE` por prefixo e a consulta por ação sem índice dedicado.
- (−) A parte do PostgreSQL (migration do índice, `startsWith` com escape, ordem por `(instante, id)`) só roda no CI; o contrato
  de consulta foi escrito para os dois.
