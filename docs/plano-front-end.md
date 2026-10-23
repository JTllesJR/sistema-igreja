# Plano da fase de front-end

Decisões em [ADR 0021](adr/0021-fase-de-front-end.md). Quem usa e o visual estão em [`PRODUCT.md`](../PRODUCT.md) e
[`DESIGN.md`](../DESIGN.md). Este documento é o **roteiro**: mapa de telas por papel, fatias de entrega, a fundação e como
cada fatia é conferida. Os nomes dos endpoints são os do OpenAPI (`/docs`, com `OPENAPI_ENABLED=true`).

## 1. Quem usa, e onde

| Papel | Escopo | Dispositivo principal | O que mais faz |
|---|---|---|---|
| **Tesoureiro** | uma congregação (ou várias) | computador | lançar entrada, pedir saída, repasse, estorno, conferir saldos |
| **Secretário** | uma congregação | computador | cadastrar e atualizar membros, registrar batismo e recepção |
| **Dirigente** | uma congregação (na sede, aprova) | celular | consultar saldo, membros, pedidos; na sede, aprovar |
| **Diretoria** | igreja toda | celular | painel consolidado, fila de aprovação, trilha de auditoria |
| **Administrador** | igreja toda | computador | congregações, usuários, papéis |

A tela inicial (`/`) é **por papel**: cada pessoa cai no que mais usa. A navegação é montada das permissões de `GET /auth/me`.

## 2. Mapa de telas

Caminhos em português (como já são `/membros` e `/congregacoes`). **C** = computador, **M** = celular, **C+M** = os dois.

### Entrada e conta
| Tela | Caminho | API | Uso |
|---|---|---|---|
| Entrar | `/entrar` | `POST /auth/login` | C+M |
| Trocar senha (obrigatória no primeiro acesso) | `/trocar-senha` | `POST /auth/change-password` | C+M |
| Minha conta | `/conta` | `GET /auth/me`, `POST /auth/logout` | C+M |
| Andamento do sistema (pública) | `/andamento` | `GET /health` | C |

### Financeiro (`finance:*`)
| Tela | Caminho | API | Quem | Uso |
|---|---|---|---|---|
| Resumo financeiro (painel UC-15/16) | `/financeiro` | `GET /finance/dashboard`, `GET /finance/accounts` | `finance:read` | C+M |
| Lançamentos (lista, filtros, paginação) | `/financeiro/lancamentos` | `GET /finance/entries`, `GET /users/directory`, `GET /finance/categories` | `finance:read` | C+M |
| Nova entrada (dízimo, oferta…) | `/financeiro/lancamentos/entrada` | `POST /finance/entries/income`, `GET /finance/members/search` | `finance:write` | C |
| Pedir saída | `/financeiro/lancamentos/saida` | `POST /finance/entries/expenses` | `finance:write` | C |
| Pedir repasse (sede ↔ congregação) | `/financeiro/lancamentos/repasse` | `GET /finance/transfer-destinations`, `POST /finance/entries/transfers` | `finance:write` | C |
| Estornar / cancelar (ações na linha) | na lista | `POST /finance/entries/:id/reversal`, `…/cancel` | `finance:write` | C |
| Saldo inicial de uma conta | `/financeiro/contas` | `POST /finance/entries/opening-balances` | `finance:write` | C |
| Contas (criar, renomear, arquivar) | `/financeiro/contas` | `GET/POST/PATCH /finance/accounts` | `finance:write` | C |
| Categorias (criar, arquivar, padrão) | `/financeiro/categorias` | `GET/POST/PATCH /finance/categories`, `POST …/defaults` | `finance:write` (igreja toda) | C |
| **Fila da sede** (aprovar / recusar) | `/financeiro/aprovacoes` | `GET /finance/approvals`, `POST …/approve`, `…/reject` | `finance:approve` na sede | **M** e C |
| Extrato de contribuição de um membro | `/financeiro/membros/:id` | `GET /finance/members/:id/contributions` | `finance:read-individual` | C+M |

### Membros (`members:*`)
| Tela | Caminho | API | Uso |
|---|---|---|---|
| Lista e busca | `/membros` | `GET /members` | C+M |
| Cadastro e edição (inclui **cargo**) | `/membros/novo`, `/membros/:id/editar` | `POST /members`, `PATCH /members/:id` | C |
| Ficha (história, situação, transferência, anonimização) | `/membros/:id` | `GET /members/:id`, `POST …/status`, `…/transfer`, `…/history`, `…/anonymize` | C+M |
| Contagem por situação e congregação (no painel) | `/` (Diretoria) | `GET /members/stats` | M |

### Administração
| Tela | Caminho | API | Quem |
|---|---|---|---|
| Congregações | `/congregacoes`, `/congregacoes/nova`, `/congregacoes/:id/editar` | `/congregations…`, `GET /organization` | `organization:*` |
| Usuários | `/usuarios`, `/usuarios/novo` | `/users…` | `access:manage-users` |
| Papéis e permissões (editor) | `/papeis`, `/papeis/novo`, `/papeis/:id` | `/roles…`, `GET /roles/permissions` | `access:manage-users` |
| **Trilha de auditoria** | `/auditoria` | `GET /audit` (cursor) | `audit:read` |

## 3. Telas iniciais por papel (`/`)

- **Tesoureiro:** saldos das suas contas, pedidos pendentes seus e atalho "Nova entrada". (C)
- **Secretário:** busca de membro em destaque e atalho "Novo membro". (C)
- **Dirigente:** saldo da congregação, membros por situação, pedidos pendentes; na sede, a fila para aprovar. (M)
- **Diretoria:** painel consolidado (receita, despesa, saldo, repasses, por congregação), membros por situação e fila de
  aprovação. Duas chamadas (`/finance/dashboard` e `/members/stats`), lado a lado ([ADR 0018](adr/0018-painel-consolidado-composto-no-cliente.md)). (M)
- **Administrador:** atalhos para congregações, usuários e papéis. (C)

## 4. Fatias de entrega

Cada fatia é **vertical** (telas + lógica testada fora do React + conferência com a API real) e termina com o critério de pronto da
seção 6. A ordem é a do ADR 0021.

| # | Fatia | Conteúdo |
|---|---|---|
| **0** | **Fundação** | Tokens do `DESIGN.md` no Tailwind; casca (cabeçalho, menu lateral no computador e recolhível no celular); navegação por permissão; componentes base (seção 5); utilitários de dinheiro, data e erro; regras `jsx-a11y` ligadas; **entrar, trocar senha, conta** refeitas; `/` com um esqueleto por papel. |
| **1** | **Finanças do Tesoureiro** | Contas e categorias (com "criar padrão"), nova entrada (com busca de membro), pedir saída, saldo inicial, lista de lançamentos com filtros e paginação, cancelar e estornar. |
| **2** | **Finanças da sede** | Fila de aprovação (aprovar, recusar com motivo; **repasse como um item de duas pernas**), pedir repasse, painel financeiro, extrato do membro. |
| **3** | **Início por papel** | Os painéis da seção 3, mobile primeiro para Dirigente e Diretoria. |
| **4** | **Membros** | Lista e busca, cadastro com cargo, ficha completa, história, transferência, situação, anonimização (com o aviso de leitura auditada). |
| **5** | **Administração** | Congregações, usuários (senha temporária mostrada uma vez), editor de papéis, **trilha de auditoria**. |
| **6** | **Acabamento** | Auditoria de acessibilidade (teclado, leitor de tela, zoom), revisão dos textos de erro, estados vazios e de carregamento, atualização da página de andamento e da documentação. |

## 5. Fundação (fatia 0): o que entra

**Componentes** (`apps/web/src/ui/`, feitos à mão, sem biblioteca):

- `Button` (primário, secundário, perigo; estado "carregando"), `Field` com rótulo e erro ligados ao campo, `Input`, `Select`,
  `Textarea`, `MoneyInput` (centavos), `DateInput` (dia, sem fuso).
- `Card`/`Section`, `Badge` de situação (cor sempre com texto), `EmptyState`, `ErrorNotice` (problema da API → mensagem), `Notice`
  (informação e aviso, inclusive "este acesso é registrado").
- `DataTable` **responsiva** (tabela no computador, lista de cartões no celular), `Pagination` (por posição e por cursor).
- `ConfirmDialog` sobre `<dialog>` nativo (foco preso, `Esc`, retorno do foco), para ações destrutivas e a recusa com motivo.
- `CongregationPicker` (respeita o escopo) e `MemberSearch` (busca mínima, só para quem tem `finance:read-individual`).

**Utilitários** (puros, com teste): `formatMoney(cents)`, `parseMoney(texto) → cents` estrito (recusa o ambíguo, nunca `float`),
`formatDay('AAAA-MM-DD')` sem passar por `Date` local, `problemMessage(erro)`, `can(permissão, congregação?)`, `useUserNames(ids)` em
lote (até 50) sobre `GET /users/directory`.

**Casca:** menu lateral no computador; no celular, barra superior com menu recolhível e **alvos de toque de 44 px**. Marca: nenhuma
identidade definida ainda; nada é inventado ([`PRODUCT.md`](../PRODUCT.md), "Brand Commitments").

## 6. Como cada fatia é conferida (critério de pronto)

1. `format:check`, `lint` (com `jsx-a11y`), `typecheck`, `test` e `build` passam. A lógica nova tem teste, e os pontos críticos
   passam por **mutação manual** (como no backend).
2. **Fluxo completo no navegador**, contra uma API simulada (eu, nesta máquina) e, **no seu computador com Docker, contra a API
   real** com PostgreSQL. Cada fatia traz um roteiro curto de "o que clicar e o que deve acontecer".
3. **Roteiro de acessibilidade:** só teclado do começo ao fim; foco sempre visível; leitor de tela lê rótulo, erro e estado;
   zoom a 200% sem perder função; contraste conferido; cor nunca sozinha.
4. **Dois tamanhos:** conferido em computador e em celular (viewport estreito), nas telas marcadas **M**.
5. **Escopo e papel:** conferido com pelo menos dois papéis (o que um vê e o outro não), e com um usuário sem permissão (o botão
   não aparece e, se a rota for aberta à mão, a API devolve 403 e a tela mostra a mensagem).
6. A documentação é atualizada (`docs/README.md`, `casos-de-uso-mvp.md`, `andamento/casos-de-uso.ts`).

## 7. Pequenos ajustes de backend previstos (descobertos ao desenhar as telas)

- **Lançamento já estornado:** a lista de lançamentos não diz se um lançamento já tem estorno, então a tela não sabe se mostra
  o botão "Estornar". Hoje só o `409` (`finance.already_reversed`) avisa. Vale acrescentar `reversedBy` (id do estorno, ou `null`)
  na visão do lançamento. É pequeno, fica no começo da fatia 1.
- Nada mais bloqueia o início: nomes de usuário já têm o diretório ([ADR 0020](adr/0020-diretorio-minimo-de-usuarios.md)), nomes de
  congregação vêm de `/congregations` (o Tesoureiro tem `organization:read`), e nomes de categoria de `/finance/categories`.

## 8. Em aberto

- **Identidade visual** (nome, logo, cores) da igreja: segue sem definição; o sistema continua neutro.
- **Testes de componente e de ponta a ponta:** fora desta fase por decisão; reavaliar se a conferência manual pesar.
- **Documentos e foto do membro (UC-08)** e **convite por link (UC-03)**: backend ainda não existe; entram como telas extras.
- **Exportação e relatórios** (versão 1.1) e **portal do membro** (2.0): fora do MVP.
- **Primeira tela por papel quando uma pessoa tem vários papéis:** regra proposta, a de maior escopo vence; confirmar na fatia 3.
