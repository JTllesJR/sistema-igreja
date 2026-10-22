# ADR 0018 — Painel consolidado (UC-16): contagem de membros no próprio `members`, composição no cliente

- **Status:** aceita
- **Data:** 2026-10-22

## Contexto

O UC-16 ("Diretoria: membros ativos e finanças consolidadas de todas as congregações") estava pela metade: a parte
financeira já existe em `GET /finance/dashboard` ([ADR 0015](0015-modulo-finance.md)), sem filtro de congregação para quem vê
a igreja toda. Faltava o número de membros. A pergunta é **onde** essa contagem mora, sem quebrar a regra de que um módulo não
toca nas tabelas de outro ([ADR 0001](0001-monolito-modular.md)).

## Decisão

### 1. `GET /members/stats` no próprio módulo `members`

Conta os membros **por situação e por congregação**. O financeiro não muda. O painel da Diretoria (fase de front-end) chama
as duas rotas e as mostra lado a lado.

```json
{
  "scope": "ORGANIZATION",
  "totals": { "ACTIVE": 120, "AWAY": 8, "TRANSFERRED_OUT": 3, "DECEASED": 1 },
  "byCongregation": [{ "congregationId": "…", "counts": { "ACTIVE": 70, "AWAY": 5, "TRANSFERRED_OUT": 0, "DECEASED": 0 } }]
}
```

Devolve **todas as situações**, não só "ativos": custa a mesma consulta e serve a outros painéis (afastados, por exemplo).
Toda situação aparece, mesmo com zero, para o cliente não tratar chave ausente.

### 2. Mesmas regras de acesso da lista (UC-09)

- Permissão `members:read`. O escopo do usuário vai **até a consulta** (`GROUP BY` filtrado pelas congregações que ele lê):
  a Diretoria e o Administrador veem a igreja toda; um Secretário da congregação 1 vê só a 1.
- `?congregationId=` só **estreita** o escopo; pedir uma congregação que não se lê devolve zeros (como a lista devolve vazio).
- Membros **anonimizados não contam** (não existem mais para o sistema, como na busca).
- Só congregações com pelo menos um membro aparecem em `byCongregation`.

### 3. Auditada, mesmo sendo só números

Nenhum nome sai, mas a situação é dado sensível ([ADR 0006](0006-lgpd-dados-sensiveis.md)): numa congregação pequena, "1
afastado" pode identificar alguém. Por isso a consulta grava `member.stats_read` **antes** de devolver e falha fechada, como
toda leitura de `members` ([ADR 0013](0013-modulo-members-e-auditoria.md)). O registro leva só se houve filtro de
congregação.

### 4. Contagem no banco

Novo método `countByStatus` no `MemberRepository`, com teste de contrato rodado contra o fake e contra o PostgreSQL. No
Prisma é um `groupBy`: nenhuma linha de membro sai do banco, só as contagens. A ordem do resultado não faz parte do contrato
(o PostgreSQL ordena enums pela declaração; o fake, por texto); quem ordena é o caso de uso.

## Alternativas consideradas

- **Contagem dentro de `GET /finance/dashboard`**, perguntando ao `members` pela API pública (como o financeiro já faz com
  nomes). Uma chamada só para o cliente, mas o financeiro passaria a depender de regra de membros e a rota exigiria duas
  permissões ao mesmo tempo. Rejeitada.
- **Módulo novo `dashboard`** que compõe os dois numa rota única. É o desenho certo quando houver relatórios e exportação
  (fase 1.1); hoje seria um módulo inteiro só para juntar duas respostas. Fica como o caminho natural se o painel crescer.
- **Contar no cliente** a partir de `GET /members`: obrigaria a paginar a igreja toda e trafegaria nomes só para contá-los.
  Rejeitada (custo e LGPD).

## Consequências

- (+) Nenhum acoplamento novo entre módulos; o UC-16 fica completo no backend.
- (+) Um Dirigente ou Secretário também ganha a contagem da sua congregação, sem rota nova.
- (−) O painel da Diretoria faz duas chamadas. Aceitável: são independentes e podem ir em paralelo.
- (−) Contagens pequenas ainda podem sugerir quem é a pessoa; a mitigação é o escopo e a auditoria, não esconder números.
