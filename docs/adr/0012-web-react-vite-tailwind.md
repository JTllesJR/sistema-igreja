# ADR 0012 — Web: React, Vite e Tailwind

- **Status:** aceita
- **Data:** 2026-10-21

## Contexto

Toda a lógica de negócio estava pronta, mas sem nenhuma tela: não havia como _ver_ o andamento. Criamos `apps/web` já
na primeira fatia visual, antes do login, com uma página de **andamento do sistema** (saúde da API ao vivo e estado
de cada caso de uso). Isso valida a cadeia navegador → API → banco e dá uma base onde as telas reais entram depois.

## Decisões

### 1. React + Vite (SPA)

O Vite já fazia parte do catálogo do pnpm (ADR 0008) e o React tem o maior ecossistema, o que facilita achar
material para estudar. O sistema é uma aplicação autenticada, sem necessidade de SEO, então uma SPA basta: um
framework com renderização no servidor (Next.js) traria um segundo servidor para operar sem benefício aqui.

### 2. Tailwind CSS 4

Estilo por classes utilitárias, sem arquivo CSS por componente. O plugin `@tailwindcss/vite` dispensa arquivo de
configuração. **Alternativas:** CSS Modules (sem dependência, mas mais trabalho manual para um visual consistente) e
uma biblioteca de componentes como shadcn/ui (visual pronto, porém mais peças para entender e manter). Podemos
adotar componentes prontos depois, em cima do Tailwind, quando houver formulários e tabelas.

### 3. Contratos compartilhados

A resposta de `GET /health` é validada no navegador com o mesmo `healthResponseSchema` que a API usa
(`packages/contracts`, ADR 0011). Se a API mudar o formato, a tela acusa "resposta inesperada" em vez de quebrar em
silêncio. Falha de rede vira o estado `offline`; a função de consulta nunca lança.

### 4. O estado dos casos de uso é mantido à mão

`apps/web/src/andamento/casos-de-uso.ts` lista cada UC com o status `concluido`, `backend` ou `planejado`. É um
arquivo simples e honesto; gerar isso automaticamente a partir do código custaria mais do que vale. A contrapartida é
lembrar de atualizá-lo ao entregar algo. Um teste garante só que os ids não se repetem.

### 5. Sem biblioteca de rotas nem de dados ainda

A página única não precisa de roteador nem de TanStack Query. Eles entram com a tela de login, quando houver rotas
protegidas e cache de requisições; adicioná-los antes seria dependência sem uso.

## Consequências

- `pnpm dev` passa a subir API e web; a web fica em `http://localhost:5173`, a origem já liberada em `CORS_ORIGINS`.
- `VITE_API_URL` (opcional) muda o endereço da API; o padrão é `http://localhost:3000`.
- Tudo o que vai para o navegador é público: **nunca** colocar segredo em variável `VITE_*`.
- Novas dependências de produção: `react` e `react-dom`; de desenvolvimento: `vite` (já existia), `@vitejs/plugin-react`,
  `tailwindcss`, `@tailwindcss/vite` e os tipos do React. Todas respeitam a política de idade do pnpm (ADR 0008).
- Os testes da web ficam em lógica pura (sem `jsdom`); testes de componentes entram quando houver interação.
