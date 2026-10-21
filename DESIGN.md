---
name: Sistema de Igreja
description: Interface administrativa calma e direta, em papel claro, para quem cuida da secretaria e das finanças da igreja.
colors:
  primary: '#10b981'
  status-done-tint: '#d1fae5'
  status-done-ink: '#065f46'
  status-backend-tint: '#e0f2fe'
  status-backend-ink: '#075985'
  alert-red: '#ef4444'
  caution-amber: '#f59e0b'
  idle-gray: '#94a3b8'
  ink: '#0f172a'
  muted-ink: '#64748b'
  soft-ink: '#475569'
  canvas: '#f8fafc'
  surface: '#ffffff'
  track: '#f1f5f9'
  hairline: '#e2e8f0'
typography:
  headline:
    fontFamily: 'ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.25rem'
    fontWeight: 600
    lineHeight: 1.4
  title:
    fontFamily: 'ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.125rem'
    fontWeight: 600
    lineHeight: 1.556
  body:
    fontFamily: 'ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: 1.429
  label:
    fontFamily: 'ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 500
    lineHeight: 1.333
  figure:
    fontFamily: 'ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.5rem'
    fontWeight: 600
    lineHeight: 1.333
  code:
    fontFamily: 'ui-monospace, SFMono-Regular, monospace'
    fontSize: '0.75rem'
    fontWeight: 400
    lineHeight: 1.333
rounded:
  md: '8px'
  xl: '12px'
  full: '9999px'
spacing:
  xs: '8px'
  sm: '12px'
  md: '16px'
  lg: '20px'
  xl: '24px'
components:
  card:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.xl}'
    padding: '20px'
  status-badge-done:
    backgroundColor: '{colors.status-done-tint}'
    textColor: '{colors.status-done-ink}'
    typography: '{typography.label}'
    rounded: '{rounded.full}'
    padding: '2px 8px'
  status-badge-backend:
    backgroundColor: '{colors.status-backend-tint}'
    textColor: '{colors.status-backend-ink}'
    typography: '{typography.label}'
    rounded: '{rounded.full}'
    padding: '2px 8px'
  status-badge-planned:
    backgroundColor: '{colors.track}'
    textColor: '{colors.soft-ink}'
    typography: '{typography.label}'
    rounded: '{rounded.full}'
    padding: '2px 8px'
  api-status-pill:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.full}'
    padding: '6px 12px'
  progress-track:
    backgroundColor: '{colors.track}'
    rounded: '{rounded.full}'
    height: '12px'
  progress-fill:
    backgroundColor: '{colors.primary}'
    rounded: '{rounded.full}'
    height: '12px'
---

# Design System: Sistema de Igreja

## Overview

**Creative North Star: "A Secretaria Organizada"**

Uma mesa de secretaria bem arrumada: papel claro, cada coisa no seu lugar, nenhuma peça de enfeite. O sistema existe para tarefas administrativas feitas por pessoas que nem sempre são técnicas, então o visual trabalha a favor da leitura e da conferência, nunca da expressão. A superfície é quase toda neutra; a cor aparece só quando carrega informação (um estado, um alerta, um progresso).

A densidade é média e confortável: texto pequeno nos detalhes (14px), mas com respiro generoso entre blocos e linhas separadas por filetes finos, não por caixas. Os componentes são calmos e diretos: planos, de borda fina, com rótulos óbvios e nada que peça atenção sem necessidade. O sistema nasceu em modo **Operate** (tarefa e consulta), e a interface existente é pequena e ainda sem formulários nem tabelas; as decisões abaixo são as observadas no código atual.

O visual **evita** a cara de painel de startup (gradientes, brilhos, cartões de métrica chamativos) e **não usa símbolos religiosos como decoração**: a igreja ainda não definiu identidade, e nenhum símbolo deve fingir que definiu.

**Key Characteristics:**

- Papel claro e quase monocromático (cinza-azulado), com acentos só semânticos.
- Cartões planos, sem sombra, delimitados por uma borda fina.
- Cor sempre acompanhada de texto: o estado nunca depende só da cor.
- Tipografia do sistema, em poucos pesos (400, 500, 600).
- Layout de coluna única centralizada que vira duas colunas em telas médias.

## Colors

Uma paleta fria e contida: cinza-azulado como base e um verde-esmeralda como única voz de "feito/saudável", com azul-céu para "intermediário" e vermelho e âmbar reservados a alerta.

### Primary

- **Verde Concluído** (#10b981): o preenchimento da barra de progresso e o ponto de "API e banco no ar". Sinaliza algo completo ou saudável; não é cor de marca.

### Secondary

- **Azul Intermediário** (tinta #e0f2fe, texto #075985): o selo "Backend pronto", para o que está parcialmente entregue.

### Tertiary

- **Vermelho de Alerta** (#ef4444): ponto de "API offline".
- **Âmbar de Atenção** (#f59e0b): ponto de resposta inesperada ou banco fora.

### Neutral

- **Tinta Profunda** (#0f172a): texto principal e títulos.
- **Tinta Apagada** (#64748b): textos de apoio, legendas e ids.
- **Tinta Suave** (#475569): texto do selo "Planejado".
- **Papel de Fundo** (#f8fafc): fundo da página.
- **Papel Branco** (#ffffff): cartões e cabeçalho.
- **Trilho** (#f1f5f9): fundo de trilhos e do selo "Planejado".
- **Filete** (#e2e8f0): bordas de cartões e divisórias de lista.
- **Cinza Ocioso** (#94a3b8): ponto de "verificando", antes da primeira resposta.
- **Verde Concluído, tinta e texto** (#d1fae5 e #065f46): o selo "Concluído".

### Named Rules

**The Color-Is-Information Rule.** A cor só aparece para dizer algo (estado, progresso, alerta). Superfícies, bordas e texto comum ficam nos neutros.

**The Never-Color-Alone Rule.** Todo estado colorido vem com texto ("Concluído", "API offline"). Quem não distingue cores, ou está no sol com o celular, entende do mesmo jeito.

## Typography

**Display Font:** fonte do sistema (`ui-sans-serif, system-ui, sans-serif`)
**Body Font:** a mesma
**Label/Mono Font:** `ui-monospace` só para identificadores como "UC-05"

**Character:** neutra e familiar, a que o aparelho de cada pessoa já usa, sem fonte externa para baixar. A hierarquia vem do peso (semibold) e do tamanho, não de fontes diferentes.

### Hierarchy

- **Headline** (600, 1.25rem/20px, 1.4): o nome do sistema no cabeçalho.
- **Title** (600, 1.125rem/18px, 1.556): título do cartão-resumo.
- **Body** (400, 0.875rem/14px, 1.429): itens de lista, textos de apoio e o estado da API.
- **Label** (500, 0.75rem/12px, 1.333): selos de status.
- **Figure** (600, 1.5rem/24px, 1.333): números do resumo.
- **Code** (400, 0.75rem/12px): ids de caso de uso.

### Named Rules

**The System-Font Rule.** Sem fonte web: a tela carrega na hora e respeita o aparelho. Introduzir uma fonte exige um motivo de produto, não de gosto.

## Layout

Coluna centralizada de largura máxima de 1024px (`max-w-5xl`), com margens laterais de 16px. O conteúdo é uma pilha vertical com 24px entre blocos; abaixo disso vira grade de duas colunas a partir de 768px, com 16px de vão. Os totais do resumo ficam em 2 colunas no celular e 4 a partir de 640px. O ritmo usa múltiplos de 4: 8, 12, 16, 20 e 24px. Cartões têm 20px de respiro interno e linhas de lista, 8px de respiro vertical. A leitura de texto corrido é curta; não há medida de linha a controlar ainda.

## Elevation & Depth

O sistema é **plano por padrão**: nenhuma sombra. A separação vem de tonalidade (fundo cinza-azulado atrás de cartões brancos) e de filetes de 1px. Não há estados elevados, pois ainda não existem menus, diálogos nem interações.

### Named Rules

**The Flat-By-Default Rule.** Superfícies não têm sombra em repouso. Uma sombra só entra quando algo realmente flutua sobre o conteúdo (menu, diálogo), nunca como enfeite de cartão.

## Shapes

Cantos suaves e consistentes: **12px** (`rounded-xl`) nos cartões, **pílula completa** em selos, no indicador da API e na barra de progresso, e **círculo** no ponto de status (10px). Bordas sempre de 1px em cinza-azulado claro. Nada de formas assimétricas, recortes ou ornamentos.

## Components

### Cartão

Contêiner branco, canto de 12px, borda de 1px (Filete), 20px de respiro interno, sem sombra. Contém um título e conteúdo; cada módulo do sistema é um cartão.

### Selo de status

Pílula de 12px em peso médio, com 2px/8px de respiro e cor de tinta suave com texto escuro da mesma família: verde para "Concluído", azul para "Backend pronto", cinza para "Planejado". Não encolhe e não quebra linha.

### Indicador de estado da API

Pílula branca com borda fina no cabeçalho: um ponto de 10px colorido (verde, âmbar, vermelho ou cinza) e um texto explicando o estado e a ação ("API offline (rode pnpm dev)"). Anunciado a leitores de tela como `status`.

### Barra de progresso

Trilho de 12px em pílula (Trilho), preenchimento em Verde Concluído, com papel de `progressbar` e valor numérico acessível.

### Lista com filetes

Itens separados por uma linha de 1px; id em mono pequeno e cinza, título à esquerda e selo à direita, alinhados ao topo. Sem zebra.

### Navegação, campos e botões

**Navegação:** links de texto em 14px e peso médio, com cantos de 6px; o ativo ganha fundo Trilho e tinta profunda, os demais ficam em cinza-escuro. Ficam no cabeçalho, ao lado do indicador da API.

**Campos:** rótulo SEMPRE visível acima (14px, peso médio), nunca só placeholder. Altura de 44px, canto de 8px, borda de 1px em cinza médio (#94a3b8, mais forte que o filete dos cartões, para o campo ser percebido) e texto de 16px. Foco com contorno de 2px na tinta profunda.

**Botão principal:** 44px de altura, largura total em formulários, fundo na tinta profunda (#0f172a), texto branco, canto de 8px. Desativado fica com 60% de opacidade e cursor de bloqueio.

**Botão secundário:** mesmo tamanho, fundo branco, borda cinza média e texto na tinta profunda.

**Mensagem de erro:** faixa com fundo vermelho muito claro, borda vermelha clara e texto vermelho-escuro, no topo do formulário, com `role="alert"`; diz o que aconteceu e o que fazer, nunca só a cor.

## Do's and Don'ts

### Do:

- **Do** manter a base em Papel de Fundo (#f8fafc) com cartões brancos de canto de 12px e borda de 1px.
- **Do** acompanhar toda cor de estado com texto explícito.
- **Do** usar só os pesos 400, 500 e 600 da fonte do sistema.
- **Do** separar conteúdo com filetes e espaço, em múltiplos de 4px.
- **Do** escrever mensagens e rótulos em português simples, dizendo o que fazer.

### Don't:

- **Don't** usar gradientes, brilhos ou cartões de métrica chamativos: nada de cara de painel de startup.
- **Don't** usar símbolos religiosos (cruzes, pombas, vitrais) como decoração.
- **Don't** colocar sombra em cartões em repouso.
- **Don't** usar cor como o único indicador de estado.
- **Don't** introduzir uma cor de marca ou fonte web sem que a igreja defina a identidade.
