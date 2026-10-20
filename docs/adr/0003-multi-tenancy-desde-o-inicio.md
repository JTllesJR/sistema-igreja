# ADR 0003 — Multi-tenancy no modelo desde o início

- **Status:** aceita
- **Data:** 2026-10-19

## Contexto
Hoje o sistema atende **uma** igreja, mas a intenção é estendê-lo a várias. Introduzir isolamento entre
igrejas depois, com dados reais em produção, é uma das migrações mais caras e arriscadas.

## Decisão
- Existe a entidade **Organization** (a igreja/denominação = *tenant*).
- **Toda tabela de negócio carrega `organization_id`**, e toda consulta é filtrada por ele.
- Estratégia: **banco único, schema único, coluna discriminadora** (`organization_id`).
- A organização atual do request vem do usuário autenticado (nunca de um parâmetro enviado pelo cliente).
- Defesa em profundidade, a ser avaliada na Fase 2: Row-Level Security do PostgreSQL.
- **Fora de escopo agora:** cadastro self-service de igrejas, cobrança, planos, domínios próprios.

## Alternativas consideradas
- **Single-tenant sem `organization_id`:** mais simples hoje, caro de corrigir depois.
- **Schema ou banco por tenant:** isolamento forte, mas complexidade operacional desproporcional para o estágio.

## Consequências
- (+) Adicionar uma segunda igreja será operação de dados, não reescrita.
- (−) Todo repositório precisa aplicar o filtro de tenant; centralizar isso em uma única camada (e testar) é obrigatório.
- (−) Chaves únicas passam a ser compostas (ex.: e-mail único *por organização*, quando fizer sentido).
