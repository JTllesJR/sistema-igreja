# ADR 0021 — Fase de front-end: ordem, fundação e padrões

- **Status:** aceita
- **Data:** 2026-10-23

## Contexto

O backend dos módulos do MVP está pronto e documentado (OpenAPI em `/docs`, [ADR 0016](0016-openapi-a-partir-dos-controllers.md)).
As telas que existem (login, congregações, membros, usuários e papéis) foram feitas para provar a arquitetura de ponta a ponta
([ADR 0012](0012-web-react-vite-tailwind.md)) e, por decisão do dono do projeto, **são só uma amostra**. Não há tela de
finanças, de painéis nem de auditoria.

O `PRODUCT.md` e o `DESIGN.md` já dizem **para quem** é a interface: Secretário e Tesoureiro **no computador** (sessões longas de
digitação), Dirigente e Diretoria **no celular** (consulta rápida), e voluntários **pouco ligados a tecnologia**. O mapa de telas
por papel, as fatias e os critérios de pronto estão em [`docs/plano-front-end.md`](../plano-front-end.md); este ADR registra as
**decisões** que moldam esse plano.

## Decisões

### 1. Ordem: fundação, depois Finanças, painéis, Membros e administração

Fundação primeiro (layout, navegação por papel e componentes base), depois **Finanças**: é o módulo mais complexo e de maior
risco (aprovação da sede, repasse em par, estorno, dado sensível de quem contribuiu). Começar por ele valida a fundação sob
carga real e entrega valor ao Tesoureiro e à sede cedo. Painéis por papel, Membros e administração (congregações, usuários,
papéis, auditoria) vêm em seguida. Escolha do dono do projeto, entre três ordens possíveis.

### 2. Refazer a amostra sobre a nova fundação, reaproveitando a lógica testada

As telas de amostra serão **reescritas** com o layout e os componentes novos. O que é lógica, e já tem teste, **fica**: sessão
(`SessionManager`, renovação de voo único), cliente autenticado, redirecionamento seguro, formulários (`form.ts`) e conversões.
Reescrever só a camada visual evita ter duas aparências no mesmo sistema e uma dívida de "depois a gente refaz".

### 3. Componentes feitos à mão com Tailwind, sem biblioteca de componentes

Poucos componentes, entendidos de ponta a ponta: botão, campos, tabela responsiva, selo de situação, diálogo de confirmação,
aviso, vazio e erro, paginação. **Sem dependência nova** (ADR 0008). O custo assumido é nosso: a acessibilidade do diálogo e do
foco fica por nossa conta, e por isso usamos o elemento `<dialog>` nativo (foco preso, `Esc` e retorno do foco já vêm do
navegador) e `<select>`/`<input>` nativos em vez de reimplementar. **Alternativas descartadas por ora:** biblioteca headless
(Radix, React Aria) e shadcn/ui; se a tela de seleção com busca ou o menu ficarem complicados, reavaliamos com um novo ADR.

### 4. Acessibilidade: WCAG 2.2 nível AA como meta mínima

Coerente com o público (pessoas mais velhas e pouco técnicas): contraste, foco visível, uso completo por teclado, alvos de toque
de pelo menos 44 px no celular, texto redimensionável, estado nunca só por cor (já regra do `DESIGN.md`), rótulos em todo campo e
erros ligados ao campo. Aplicação prática: ligar as regras de acessibilidade do `oxlint` (plugin `jsx-a11y`, embutido) no `web` e
um roteiro de conferência manual por fatia (teclado, leitor de tela, zoom 200%). Não adotamos teste de componente nem ponta a
ponta agora (decisão do dono do projeto); a lógica continua testada fora do React (padrão do ADR 0012) e cada fatia é validada
contra a API real.

### 5. O cliente tipado é o pacote `@igreja/contracts`; o OpenAPI não vira gerador

A web já valida respostas com os **mesmos schemas Zod** que a API usa. Gerar outro cliente a partir do OpenAPI duplicaria o que
já existe e criaria dois caminhos para o mesmo contrato. O OpenAPI fica como documentação e conferência. Cada módulo da web tem
uma camada `api.ts` fina, que chama o cliente autenticado e **faz `parse` com o schema do contrato**: resposta fora do formato
vira erro visível, não tela quebrada.

### 6. Estrutura por funcionalidade, lógica fora do React

Uma pasta por módulo (`finance/`, `members/`, ...), cada uma com `api.ts`, `queries.ts` (TanStack Query), `logic`/`form.ts`
(puro, testado) e as páginas em `pages/`. Componentes compartilhados em `ui/`. Regras de negócio **não** são copiadas para a web:
ela só mostra, valida cedo (para dar retorno rápido) e traduz o erro do servidor. Quem decide é sempre a API.

### 7. A interface só mostra o que o papel e o escopo permitem, sem nunca ser a proteção

Navegação e botões saem das permissões que `GET /auth/me` já devolve (`hasPermission`), respeitando "igreja toda" versus uma
congregação. É conforto, não segurança: a API responde 403 ou 404 mesmo que um botão apareça por engano. Os textos de erro vêm do
`detail` em português do servidor; a tela reage ao `code` estável.

### 8. Dinheiro e datas sem armadilha

- **Dinheiro** é guardado e trafegado em **centavos inteiros** (ADR 0005). A web exibe com `Intl.NumberFormat('pt-BR')` e lê o que
  a pessoa digita com um conversor **estrito** para centavos (aceita "1.234,56" e "1234,56"; recusa o ambíguo), **nunca por
  `float`**. Valor negativo ou zero não existe em lançamento.
- **Datas** de calendário (`AAAA-MM-DD`) são tratadas como **dia**, sem fuso: nunca passam por `Date` local, para "2026-10-20"
  não virar 19.
- **Nomes de usuário** (quem pediu, quem aprovou, quem fez) vêm de `GET /users/directory` ([ADR 0020](0020-diretorio-minimo-de-usuarios.md)),
  em lote por página.

### 9. Dado sensível na tela

Quem contribuiu e a ficha do membro só aparecem a quem a API devolve; a interface não guarda esses dados em `localStorage`, não
os coloca em URL e **não mostra o que não veio** (o campo `member` nulo vira "membro vinculado", sem tentar descobrir quem).
Telas que fazem leitura auditada (ficha, extrato, trilha) avisam que o acesso é registrado. O token de acesso continua só em
memória (ADR 0012, seção 6).

### 10. Celular e computador: uma interface responsiva, dois modos de uso

Sem aplicativo nativo. O mesmo código atende os dois usos do `PRODUCT.md`: **computador** com tabelas densas e atalhos de teclado
para digitação (Secretário, Tesoureiro), **celular** com cartões, números grandes e poucas ações por tela (Dirigente, Diretoria).
Tabelas viram lista de cartões em tela estreita; o menu lateral vira menu recolhível.

## Alternativas consideradas

- **Next.js ou renderização no servidor:** sem SEO nem necessidade (ADR 0012).
- **Manter a amostra e só acrescentar telas:** menos trabalho agora, mas deixaria duas aparências e um visual sem desenho.
- **Gerar o cliente a partir do OpenAPI:** duplica o contrato que o Zod já cumpre nos dois lados.
- **Biblioteca de componentes ou shadcn/ui:** acessibilidade pronta, mas mais peças para entender e manter (ADR 0008).
- **Testes de componente e de ponta a ponta já:** valiosos, mas mais dependências e tempo; ficam como evolução se o dono do
  projeto os pedir (o plano deixa o ponto em aberto).

## Consequências

- (+) Entregas por fatia vertical (tela + lógica testada + conferência com a API real), sem "big bang".
- (+) Nenhuma dependência nova obrigatória; o conhecimento fica no código (útil para estudar).
- (+) Acessibilidade tratada desde o começo, não como remendo no fim.
- (−) A acessibilidade de diálogo, foco e teclado é responsabilidade nossa (mitigada por `<dialog>` e controles nativos).
- (−) Sem testes de componente, regressão visual e de fluxo depende da conferência manual por fatia e da API real.
- (−) Refazer a amostra consome uma fatia inteira antes de aparecer tela nova de negócio.
