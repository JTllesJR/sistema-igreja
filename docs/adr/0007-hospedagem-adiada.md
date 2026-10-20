# ADR 0007 — Hospedagem: adiada

- **Status:** adiada (decidir antes do primeiro uso real)
- **Data:** 2026-10-19

## Contexto
Durante o desenvolvimento e os testes, a hospedagem deve ter custo zero. Em produção, o provedor será
escolhido por indicação, com base em orçamento, localização dos dados e suporte.

## Decisão
- **Desenvolvimento:** tudo roda localmente via Docker Compose (Postgres + serviços de apoio).
- **Testes na nuvem:** usar *free tiers* de PaaS e Postgres gerenciado, escolhidos na Fase 1. Limites e condições
  desses planos mudam com frequência e devem ser verificados na hora.
- **Produção:** decisão futura. Critérios: backup com restauração pontual (PITR), região próxima ao Brasil,
  preço previsível e portabilidade.

## Regra de portabilidade
Nada no código pode depender de um provedor específico. Configuração via variáveis de ambiente, storage por
interface S3-compatível, banco PostgreSQL padrão, deploy por container.

## Consequências
- (+) Trocar de provedor depois será trabalho de configuração, não de código.
