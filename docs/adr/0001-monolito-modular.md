# ADR 0001 — Monólito modular

- **Status:** aceita
- **Data:** 2026-10-19

## Contexto
O sistema tem vários módulos de negócio (membros, finanças, eventos, documentos...), um time pequeno
e uma carga inicial baixa (~200 membros, 3 congregações). Há intenção de crescer para várias igrejas.

## Decisão
Um único deploy (monólito) organizado em **módulos com fronteiras rígidas**:

- Um módulo não lê nem escreve nas tabelas de outro módulo.
- A comunicação entre módulos acontece pela **interface pública** do módulo (um service exportado) ou por **eventos de domínio**.
- Dentro de cada módulo: `controller → application (casos de uso) → domain → infrastructure (repositório)`.
- DDD "leve": entidades e regras de negócio ficam no `domain`; aprofundar apenas em `finance`.

## Alternativas consideradas
- **Microserviços:** custo operacional (deploy, rede, consistência distribuída) sem ganho real nesta escala.
- **Monólito sem módulos (camadas globais):** mais rápido no início, mas vira acoplamento difuso e dificulta extrair partes depois.

## Consequências
- (+) Um deploy, uma transação de banco, depuração simples.
- (+) Se um módulo precisar virar serviço, as fronteiras já existem.
- (−) Exige disciplina: as fronteiras precisam ser verificadas (regra de lint para imports entre módulos).
