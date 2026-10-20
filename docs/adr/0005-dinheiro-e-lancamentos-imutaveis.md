# ADR 0005 — Dinheiro e lançamentos financeiros imutáveis

- **Status:** aceita
- **Data:** 2026-10-19

## Contexto
O módulo de tesouraria registra entradas e saídas, calcula saldo, fluxo de caixa e gera prestação de contas.
Erros de arredondamento ou edição silenciosa de lançamentos destroem a confiança no sistema.

## Decisão
- Valores monetários são armazenados como **inteiros em centavos** (`BIGINT`), nunca `float`.
  Na aplicação, um *value object* `Money` encapsula soma, comparação e formatação.
- **Lançamentos (FinancialEntry) não são editados nem apagados** após confirmados. A correção é feita por
  **estorno**: um novo lançamento que referencia o original (`reverses_entry_id`).
- **Saldo não é armazenado**: é calculado a partir dos lançamentos (e, se necessário por desempenho, de um
  snapshot periódico reconstruível).
- Todo lançamento registra quem criou, quando, congregação, conta e categoria; mudanças vão para o `audit_log`.
- Aprovações (despesas acima do limite) são um fluxo separado (`approvals`) que antecede a confirmação do lançamento.

## Alternativas consideradas
- **`DECIMAL(14,2)`:** também correto; escolhemos centavos inteiros para evitar conversões de tipo entre banco, Prisma e JS.
- **Edição permitida com log:** mais simples para o usuário, mas enfraquece a prestação de contas.

## Consequências
- (+) Auditabilidade e saldo sempre reconciliável.
- (−) A interface precisa deixar o fluxo de estorno claro para quem está acostumado a "editar".
