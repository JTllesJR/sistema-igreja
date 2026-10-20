# Glossário do domínio

Linguagem comum entre a igreja, o PRD e o código. **Os nomes das entidades no código seguem este glossário**
(em inglês, entre parênteses). Termos marcados com ⚠ precisam ser confirmados com a igreja.

## Organização

| Termo | Definição | No código |
|---|---|---|
| **Igreja / Organização** | A entidade que usa o sistema (tenant). Hoje há uma; no futuro, várias. | `Organization` |
| **Sede** | Congregação principal, para onde as demais reportam. | `Congregation` com `isHeadquarters = true` |
| **Congregação** | Unidade local da igreja, com liderança, endereço e horários de culto próprios. | `Congregation` |
| **Congregação inativa** | Congregação desativada, mas preservada: seus membros e lançamentos continuam existindo. Não se exclui congregação. A sede nunca fica inativa. | `status = INACTIVE` |
| **Operador** | Quem instala e mantém o sistema, por linha de comando. Não é um usuário da igreja. | — |
| **Diretoria** | Grupo gestor com visão consolidada de todas as congregações. Não é um conjunto de dados à parte: é um *papel com escopo global*. | `Role` + `RoleAssignment` (escopo organização) |
| **Cargo / Função** | Posição eclesiástica ou administrativa de um membro (ex.: diácono, presbítero, tesoureiro). ⚠ lista de cargos | `Position` |
| **Mandato** | Período em que um membro ocupa um cargo (início e fim). | `Mandate` |
| **Ministério / Departamento** | Grupo de atuação (ex.: louvor, jovens, EBD). ⚠ lista | `Ministry` |

## Pessoas

| Termo | Definição | No código |
|---|---|---|
| **Membro** | Pessoa cadastrada na igreja, vinculada a uma congregação. | `Member` |
| **Histórico do membro** | Eventos da vida eclesiástica: batismo, recepção, transferência etc. | `MemberHistoryEvent` |
| **Situação espiritual** | Estado do membro na igreja (ex.: ativo, afastado, em disciplina). **Dado sensível.** ⚠ valores possíveis | `Member.status` |
| **Usuário** | Quem faz login no sistema. Pode estar ligado a um membro. | `User` |

## Acesso

| Termo | Definição | No código |
|---|---|---|
| **Permissão** | Direito de executar uma ação num módulo (`modulo:ação`). | `Permission` |
| **Papel** | Conjunto de permissões, configurável (ex.: Tesoureiro). | `Role` |
| **Escopo** | Abrangência de uma atribuição: toda a organização ou uma congregação. | `scope` / `congregationId` |
| **Atribuição** | Liga usuário + papel + escopo. | `RoleAssignment` |
| **Perfis da congregação** | 1º/2º Dirigente (acesso total), 1º/2º Tesoureiro (financeiro), 1º/2º Secretário (cadastro, eventos, comunicação). | papéis semente |

## Finanças

| Termo | Definição | No código |
|---|---|---|
| **Dízimo / Oferta / Contribuição específica / Doação** | Tipos de entrada. Podem ser categorias personalizáveis. | `FinanceCategory` |
| **Lançamento** | Registro de uma entrada ou saída. **Imutável** depois de confirmado. | `FinancialEntry` |
| **Estorno** | Lançamento que corrige outro, referenciando-o. Substitui "editar/excluir". | `FinancialEntry.reversesEntryId` |
| **Conta** | Onde o dinheiro está: caixa ou conta bancária. | `FinancialAccount` |
| **Categoria** | Classificação do lançamento (personalizável). | `FinanceCategory` |
| **Saldo** | Resultado da soma dos lançamentos. Calculado, não armazenado. | — |
| **Fluxo de caixa** | Previsão de despesas futuras e projeção de saldo. (MVP: não inclui) | — |
| **Prestação de contas** | Relatório financeiro formal apresentado à igreja. | `reporting` |
| **Aprovação** | Autorização da Diretoria para compra, projeto ou movimentação acima de um limite. ⚠ valor do limite | `ApprovalRequest` |

## Atividades

| Termo | Definição |
|---|---|
| **Culto** | Reunião principal da igreja. |
| **EBD** | Escola Bíblica Dominical. |
| **Reunião ministerial** | Encontro interno de um ministério. |
| **Frequência** | Registro de presença em culto, EBD ou reunião. |
| **Ata** | Registro oficial de uma reunião. |
| **Carteirinha** | Cartão de identificação do membro, com QR Code opcional. |
| **Certificado / Carta** | Documentos emitidos: batismo, casamento, apresentação, declaração de membro; cartas de mudança, recomendação e convite. |
