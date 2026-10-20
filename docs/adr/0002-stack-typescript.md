# ADR 0002 — Stack TypeScript de ponta a ponta

- **Status:** aceita
- **Data:** 2026-10-19

## Contexto
O desenvolvedor tem familiaridade com TypeScript. O produto terá API, web responsiva e app mobile (Android/iOS).
Compartilhar tipos e validações entre as três pontas reduz bugs e retrabalho.

## Decisão

| Camada | Escolha |
|---|---|
| Backend | NestJS |
| Banco | PostgreSQL |
| ORM / migrations | Prisma |
| Validação / contratos | Zod (pacote `contracts` compartilhado) |
| API | REST + OpenAPI (cliente tipado gerado) |
| Web | React + Vite + TanStack Query |
| Mobile (v1.2) | Expo (React Native) |
| Jobs assíncronos | pg-boss (fila sobre o próprio Postgres) |
| Arquivos | Storage S3-compatível, com URLs assinadas |
| Monorepo | pnpm workspaces + Turborepo |

## Alternativas consideradas
- **Spring Boot / .NET / Django:** igualmente válidos, mas sem ganho que compense sair da linguagem que o desenvolvedor domina.
- **Next.js:** SSR não agrega num painel atrás de login; reavaliar se o portal do membro (v2.0) precisar de páginas públicas.
- **Redis + BullMQ:** mais um componente de infraestrutura. pg-boss atende a carga prevista; migrar depois é viável.

## Consequências
- (+) Uma linguagem, tipos compartilhados, curva de aprendizado menor.
- (−) Ecossistema JS muda rápido: fixar versões e manter dependências atualizadas.
