# ADR 0004 — RBAC com escopo de congregação

- **Status:** aceita
- **Data:** 2026-10-19

## Contexto
O PRD define perfis por congregação (Dirigente: acesso total; Tesoureiro: financeiro; Secretário: cadastro,
eventos e comunicação) e uma Diretoria com visão consolidada, além de "controle granular por módulo e ação".
Um RBAC simples ("o usuário tem o papel X") não expressa "Tesoureiro **da congregação 2**".

## Decisão
- **Permissão** = `modulo:ação` (ex.: `finance:create`, `members:read`, `finance:approve`). Definidas no código.
- **Papel (Role)** = conjunto de permissões, **configurável por organização**. Os perfis do PRD entram como papéis semente.
- **Atribuição (RoleAssignment)** = `(usuário, papel, escopo)`, onde escopo é `ORGANIZATION` (global) ou uma `congregation_id`.
- Um usuário pode ter várias atribuições (ex.: Secretário na congregação 1 e Tesoureiro na 3).
- A Diretoria é um papel com escopo `ORGANIZATION`, **não um módulo de dados separado**.
- A autorização tem duas etapas:
  1. **Guard** na rota: o usuário tem a permissão em algum escopo?
  2. **Filtro de escopo** no repositório: a consulta só enxerga as congregações em que ele tem a permissão.
- Leitura de dados sensíveis (ex.: contribuição individual) usa permissão própria (`finance:read-individual`).

## Alternativas consideradas
- **ABAC / motor de políticas (CASL, OPA):** poderoso demais para o estágio. O modelo acima pode migrar para CASL depois sem mudar o banco.
- **Papéis fixos no código:** impede a Diretoria de ajustar permissões, requisito explícito do PRD.

## Consequências
- (+) Atende o PRD e as extensões prováveis (novos papéis, novas congregações) sem mudar código.
- (−) O filtro de escopo precisa ser garantido na camada de dados; testes de autorização são obrigatórios.
