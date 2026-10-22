# ADR 0015 — Módulo `finance`: contas, lançamentos imutáveis, aprovação da sede e repasse

- **Status:** aceita
- **Data:** 2026-10-22

## Contexto

Dinheiro é onde um erro silencioso ou uma fraude pequena custam mais confiança. Este ADR desenha o `finance` do MVP
sobre o [ADR 0005](0005-dinheiro-e-lancamentos-imutaveis.md) (centavos inteiros, lançamentos imutáveis, saldo calculado) e
as respostas da igreja (`casos-de-uso-mvp.md`, 2026-10-22): **toda saída precisa de aprovação da sede**, **há repasse
entre congregação e sede**, o dízimo pode ser **identificado ou anônimo**, a contribuição individual é vista por
Tesoureiro, Dirigente e Diretoria em **todo o período** (o próprio membro, só os **últimos 12 meses**, no portal da v2.0) e
**não há dados antigos para importar** (o sistema começa do zero, então precisa de **saldo inicial**).

**Entra:** UC-11 (contas e categorias), UC-12 (entrada), UC-13 (saída com aprovação), UC-14 (estorno), UC-15 e UC-16
(painéis), repasse e extrato individual. **Fica de fora:** fluxo de caixa, conciliação bancária, anexos (notas fiscais),
movimentação entre contas da MESMA congregação (ex.: depósito do caixa no banco) e o portal do membro.

## Decisões

### 1. Dinheiro: centavos inteiros e um tipo `Money`

Inteiro positivo em centavos, no máximo R$ 100 milhões por lançamento (`BIGINT` no banco, com `CHECK > 0`). Nenhum `float`
em lugar nenhum. A soma de lançamentos é feita no banco (`SUM` em `BIGINT`) e convertida com checagem de limite.

### 2. Um lançamento é um fato; o que está pendente ainda não é dinheiro

`financial_entry` guarda **tudo** num só lugar, com `status`:

| Status | Significado | Conta no saldo? |
|---|---|---|
| `CONFIRMED` | valeu | sim |
| `PENDING` | pedido aguardando a sede | não |
| `REJECTED` / `CANCELLED` | a sede recusou / quem pediu desistiu | não |

- **Entrada (`IN`) comum nasce `CONFIRMED`.** Tudo que **diminui** o saldo (saída, perna de saída de um repasse, estorno
  de uma entrada) e tudo que **cria** saldo sem dinheiro de verdade (saldo inicial) nasce **`PENDING`** e só vale depois da
  aprovação da sede. Estornar uma entrada é, na prática, tirar dinheiro do caixa; por isso exige o mesmo cuidado.
- **Isto refina o ADR 0005**, que previa um fluxo `approvals` à parte: manter o pedido na própria tabela, sem efeito no
  saldo até ser decidido, dá uma única fonte da verdade e permite a trava no banco (item 3).
- **Nunca se edita nem se apaga.** Depois de decidido, nada muda. A correção é um **estorno**: novo lançamento, de sentido
  oposto, ligado ao original (`reverses_entry_id`), uma vez só, herdando conta, valor, categoria e membro do original (assim
  o painel por categoria e o extrato do membro "se anulam" sem consulta especial).

### 3. O banco impõe o que o domínio promete (defesa em profundidade)

- **Gatilho** recusa `DELETE` sempre e `UPDATE` de qualquer lançamento já decidido; num pendente só mudam os campos da decisão
  (`status`, `decided_by`, `decided_at`, `decision_note`). Valor, conta, sentido, data, descrição, membro: imutáveis desde o
  pedido.
- **`CHECK (decided_by IS NULL OR decided_by <> requested_by)`**: **quem pede nunca aprova o próprio pedido**, nem por um
  erro do aplicativo. (Quem aprova é sempre outra pessoa, mesmo se for o Tesoureiro da sede aprovando a si.)
- Chave estrangeira **composta** `(organization_id, account_id, congregation_id)`: o lançamento não pode apontar para uma
  conta de outra congregação (nem de outra igreja). Índice único parcial: **um estorno por lançamento** (não conta o estorno
  recusado ou cancelado). `CHECK`s de coerência (categoria só em lançamento comum e estorno, `transfer_id` só no repasse...).

### 4. Aprovação da sede, com separação de funções

`finance:approve` é concedida por congregação, mas **só vale para aprovar se o escopo do usuário alcança a SEDE**
(`policy.can(approve, sede)`): a Diretoria (igreja toda) e o Dirigente da sede aprovam; o Dirigente de uma filial, não. A
sede aprova pedidos de TODAS as congregações, inclusive os dela, **desde que o aprovador seja outra pessoa** (item 3).
Recusar exige um motivo. Quem pediu (ou quem tem escrita na congregação) pode **cancelar** o pedido pendente.

**Consequência assumida:** uma igreja precisa de pelo menos duas pessoas com poder na sede para aprovar as saídas da própria
sede. É o preço da separação de funções.

### 5. Saldo nunca fica negativo, nem em corrida

Confirmar uma saída que deixaria a conta negativa é recusado (`finance.insufficient_balance`, 422). Como duas aprovações
simultâneas poderiam passar juntas, a confirmação roda numa transação que **trava as linhas das contas** (`SELECT ... FOR
UPDATE`, em ordem de id para não travar em círculo), recalcula o saldo e só então grava, o mesmo padrão da regra do
último Administrador (ADR 0014).

### 6. Repasse: um par de lançamentos aprovado de uma vez

Repasse é **entre congregações diferentes**: uma perna `OUT` na conta de origem e uma `IN` na de destino, com o mesmo
`transfer_id`, ambas `PENDING`. A sede aprova (ou recusa) as **duas** na mesma transação, e o saldo de origem é conferido.
Nos painéis, repasses aparecem à parte (não são receita nem despesa e, na soma da igreja, se anulam). Corrigir um repasse
errado é fazer outro no sentido contrário; não se estorna uma perna isolada.

### 7. Entrada com ou sem membro; quem vê quem deu

O dízimo pode ser anônimo (`member_id` nulo). **Quem contribuiu é dado sensível** (ADR 0006): a lista de lançamentos só
revela o membro a quem tem `finance:read-individual`; os demais veem apenas que há um membro vinculado. O **extrato
individual** (`GET /finance/members/:id/contributions`) exige essa permissão, é uma **leitura auditada que falha fechada** e
tem janela de tempo no desenho (`since`): hoje todo o período (Tesoureiro, Dirigente, Diretoria); os 12 meses do próprio
membro entram com o portal. O Tesoureiro **não** ganha `members:read` (a ficha completa do membro tem endereço e telefone):
ele escolhe o membro por uma **busca mínima** (id, nome e congregação) que o módulo `members` oferece pela sua API pública.

### 8. Permissões e papéis

`finance:read` (painéis e lançamentos sem identidade), `finance:write` (registrar entrada, pedir saída, repasse e estorno,
cancelar pedido, criar contas), `finance:approve` (item 4) e `finance:read-individual` (item 7); todas por congregação.
Criar e alterar **categorias** (que são da igreja toda) exige `finance:write` na igreja toda.
Papéis padrão novos, de sistema e fixos no código: **Tesoureiro** (`read`, `write`, `read-individual` e `organization:read`,
para ver os nomes das congregações) e **Diretoria**
(`read`, `approve`, `read-individual`, `members:read`, `organization:read`, na igreja toda); o **Dirigente** ganha `read`,
`approve` e `read-individual` (acesso total à congregação, PRD). Como as permissões de um papel de sistema ficam gravadas
quando ele é criado, `ensureDefaultRoles` passa a **sincronizar** as permissões dos papéis de sistema já existentes com a
definição do código (papéis de sistema não são editáveis; o código é a fonte da verdade).

### 9. Auditoria

Toda escrita grava na trilha **depois** de salvar; toda leitura que revela quem contribuiu (extrato, lista com identidade)
grava **antes** de devolver. A trilha leva ids, ações e contexto técnico (sentido, tipo, valor em centavos): **nunca** nome
nem descrição digitada. O `memberId` do extrato é o `entityId` da leitura; nos demais registros só se diz que havia membro.

### 10. Painéis

Uma consulta agrega os lançamentos confirmados por congregação, conta, categoria, tipo e sentido; a aplicação dobra o
resultado: receita e despesa por categoria (estorno desconta da categoria de origem), repasses à parte, saldo por conta e
quantos pedidos aguardam a sede. A visão consolidada (UC-16) é a mesma consulta sem filtro de congregação, para quem tem
escopo da igreja toda.

### 11. Detalhes que o código fixou

- **Repasse é sempre entre a sede e uma congregação** (em qualquer sentido): entre duas filiais é recusado
  (`finance.transfer_requires_headquarters`). Quem repassa escolhe o destino em `GET /finance/transfer-destinations`, que
  mostra só nome e tipo das contas (sem saldo), então não precisa ler o financeiro da outra ponta.
- **Só a entrada comum nasce confirmada sem decisor.** O banco também recusa confirmar qualquer outro lançamento sem
  `decided_by` (`CHECK`), além de proibir `decided_by = requested_by`.
- **Categorias padrão** (dízimo, oferta, aluguel...) não são criadas escondidas: `POST /finance/categories/defaults` as cria
  uma vez só (idempotente) e nunca mexe nas que a igreja já tem ou arquivou.
- **Busca mínima de membro** (`GET /finance/members/search`) e **extrato** (`GET /finance/members/:id/contributions`) usam a
  API pública `MemberQueries` do módulo `members` (id, nome, congregação) e só alcançam as congregações em que o usuário
  tem `finance:read-individual`. Um membro fora desse alcance e sem nada visível responde 404, igual a inexistente.
- **A fila da sede** (`GET /finance/approvals`) mostra os pedidos pendentes de TODAS as congregações a quem alcança a sede:
  é da natureza de aprovar. Quem contribuiu continua escondido de quem não tem `read-individual`.
- **Cargo do membro** (`MemberPosition`: membro, auxiliar, diácono, diaconisa, presbítero, evangelista, pastor) entrou junto,
  no módulo `members`, como campo do cadastro (a igreja respondeu a lista); a mudança aparece na auditoria só como nome de campo.
- **Backend apenas.** Por decisão do dono do projeto, as telas de todos os módulos formam uma fase própria, depois do
  backend; as telas existentes são uma amostra.

## Alternativas consideradas

- **Fluxo de aprovação em tabela separada (ADR 0005):** descartada, ver item 2.
- **Permitir saldo negativo:** esconderia saída maior que o caixa; para conta bancária com limite, a regra pode virar uma
  opção por conta depois.
- **Aprovar só acima de um valor:** a igreja respondeu que **toda** saída é aprovada.
- **Dar `members:read` ao Tesoureiro:** mais simples, mas entrega endereço e telefone de todos; descartado pela busca mínima.
- **Estornar uma perna do repasse:** deixaria o par inconsistente; descartado.

## Consequências

- (+) O que o domínio promete (imutável, sem autoaprovação, uma sede aprova, saldo não negativo) está também no banco.
- (+) Painel e extrato partem da mesma tabela e do mesmo saldo.
- (−) Toda saída espera a sede: é lento por desenho. A igreja pode pedir um limite depois (vira configuração).
- (−) Duas pessoas na sede são necessárias para aprovar as saídas da própria sede.
- (−) O gatilho, os `CHECK`s, a trava de linhas (`FOR UPDATE`) e os repositórios Prisma só são exercitados no CI (sem Docker
  nesta máquina). O SQL da migration (estrutura gerada com `prisma migrate diff`, mais o SQL manual) e o contrato dos
  repositórios foram escritos para isso, mas **não foram executados contra um PostgreSQL aqui**.
- (−) Um mesmo saldo inicial pode ser pedido duas vezes para a mesma conta: a sede percebe ao aprovar, e o estorno corrige.
  Uma regra de "um saldo inicial por conta" fica para quando a igreja pedir.
