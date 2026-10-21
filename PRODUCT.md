# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Pessoas de igreja que usam o sistema para tarefas administrativas, em três situações confirmadas:

- **Secretário e Tesoureiro, no computador:** cadastro de membros e lançamentos financeiros, conferência de dados, em sessões longas de digitação.
- **Dirigente e Diretoria, no celular:** consulta rápida de saldos, membros e dashboards pelo navegador do celular (web responsiva, não app nativo).
- **Pessoas pouco ligadas a tecnologia:** voluntários e líderes que não são usuários frequentes de software; a interface precisa ser direta e legível.

Existe ainda o **Administrador da Organização** (configura congregações, papéis e usuários) e o **Operador** (quem instala o sistema, atua só por linha de comando, fora da interface). Os atores e seus escopos estão em `docs/casos-de-uso-mvp.md`.

## Product Purpose

Sistema de gestão para igrejas com várias congregações: organização e congregações, controle de acesso por papel e escopo, cadastro de membros, finanças básicas e dashboards. O requisito original é o PRD em PDF; as decisões estão em `docs/`. Sucesso do MVP: a igreja substitui planilhas e controles soltos por um sistema confiável, onde cada pessoa vê só o que o seu papel e a sua congregação permitem.

## Positioning

Um sistema feito para a estrutura real de igreja com **sede e congregações**, onde cada usuário tem permissões **com escopo de congregação** (ADR 0004), o dinheiro é **imutável e corrigido só por estorno** (ADR 0005) e os dados de membros são tratados como sensíveis conforme a LGPD (ADR 0006). O que o diferencia de uma planilha ou de um sistema contábil genérico é essa combinação de hierarquia, escopo e rastreabilidade.

## Operating Context

- Hoje os dados provavelmente estão em planilhas; se será preciso importá-los é uma pergunta em aberto (docs/casos-de-uso-mvp.md).
- O sistema nasce multi-tenant (ADR 0003): cada organização é uma igreja, com sua sede e congregações.
- Não há tela de cadastro público: a organização inicial e o primeiro administrador são criados pelo Operador por linha de comando.
- Hospedagem ainda não decidida (ADR 0007).

## Capabilities and Constraints

- Já existe a página "Andamento do sistema" (`apps/web`), que mostra a saúde da API e o estado dos casos de uso. As telas de negócio ainda não existem.
- Próximas telas previstas: login, depois congregações; em seguida membros e finanças, cada módulo já com sua tela.
- Stack da web: React, Vite, Tailwind CSS (ADR 0012).
- Interface e textos em português do Brasil. Dinheiro em centavos inteiros, exibido em reais.
- Erros da API vêm em `application/problem+json` com um `code` estável; a interface mostra `detail` e reage ao `code` (ADR 0011).
- Em aberto, a validar com a igreja: cargos e ministérios reais, quem vê a contribuição individual, limite de aprovação, dízimo identificado ou anônimo.

## Brand Commitments

Nenhuma identidade definida até agora: sem nome de marca, logo, cores ou voz estabelecidos para o sistema ou para a igreja. É uma decisão em aberto; nada deve ser inventado como se fosse compromisso de marca.

## Evidence on Hand

- Documentação de domínio e arquitetura em `docs/`, incluindo diagramas em `docs/diagramas/`.
- Nenhum cliente real, depoimento, dado de uso ou material visual da igreja. Não fabricar nada disso.

## Product Principles

1. **Clareza antes de tudo:** quem usa não é técnico; cada tela deve deixar óbvio o que fazer e o que aconteceu.
2. **Mostrar só o que o papel e a congregação permitem:** o escopo do usuário molda o que aparece, e a interface nunca sugere acesso que ele não tem.
3. **Dinheiro e dados de membros exigem confiança:** valores, estornos e dados sensíveis são apresentados com precisão e sem ambiguidade.
4. **Funciona no computador e no celular:** a digitação intensa acontece no desktop, a consulta rápida no celular.
5. **Erros dizem o que fazer:** mensagens em português simples, sem jargão técnico, em linha com o `detail` da API.

## Accessibility & Inclusion

Há usuários pouco ligados a tecnologia e possivelmente mais velhos: texto legível, alvos de toque confortáveis no celular, contraste adequado e fluxos curtos. Nenhum padrão formal (como WCAG) foi exigido ainda; adotar um nível mínimo é decisão em aberto.
