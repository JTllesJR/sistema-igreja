# Casos de uso do MVP

Escopo do MVP no PRD: **login, permissões, cadastro de membros, finanças básicas, dashboard**.

> Decisão de planejamento: o PRD deixa "Congregações" para a v1.1, mas o MVP já inclui o **cadastro mínimo de
> congregações e o escopo por congregação**, porque membros, finanças e permissões dependem disso (ver ADR 0004).
> O que fica para a v1.1 são relatórios enviados à sede, painel individual e comunicação interna.

## Atores

| Ator | Descrição | Escopo típico |
|---|---|---|
| **Administrador da Organização** | Configura a igreja, congregações, papéis e usuários. | Organização |
| **Diretoria** | Visão consolidada e aprovações. | Organização |
| **Dirigente** (1º/2º) | Acesso total à sua congregação. | Congregação |
| **Tesoureiro** (1º/2º) | Finanças da sua congregação. | Congregação |
| **Secretário** (1º/2º) | Cadastro de membros e eventos da sua congregação. | Congregação |
| **Operador** | Quem instala e mantém o sistema (não é um usuário da igreja). Atua por linha de comando. | Fora do sistema |

## Casos de uso

### Identidade e acesso
| ID | Caso de uso | Ator | Observações |
|---|---|---|---|
| UC-01 | Entrar e sair do sistema | Todos | Sessão com token curto + refresh; bloqueio após tentativas falhas. |
| UC-02 | Gerenciar papéis e permissões | Administrador | Papéis semente + personalizados. **Editor implementado no backend** ([ADR 0019](adr/0019-editor-de-papeis-e-catalogo-de-permissoes.md)): catálogo de permissões, criar, editar e excluir. |
| UC-03 | Convidar usuário e atribuir papel com escopo | Administrador | Escopo = organização ou congregação. O **primeiro** administrador é criado pelo Operador com `pnpm cli create-administrator` (implementado); o convite pela interface virá depois. |
| UC-18 | Trocar a própria senha | Todos | Exige a senha atual; revoga as outras sessões (ADR 0010). |
| UC-04 | Consultar trilha de auditoria | Administrador, Diretoria | Quem fez o quê, quando; filtros por usuário, dado afetado, ação, módulo e período; página por cursor. **Implementado no backend** ([ADR 0017](adr/0017-consulta-a-trilha-de-auditoria.md)); a consulta também é auditada. |

### Organização
| ID | Caso de uso | Ator | Observações |
|---|---|---|---|
| UC-05 | Cadastrar e editar congregações | Administrador | Endereço e horários de culto; inclui desativar, reativar e designar a sede (ADR 0009). Liderança entra junto com `members`. |
| UC-17 | Criar organização inicial | Operador | Linha de comando; cria a organização e sua sede. Sem endpoint público (ADR 0009). O primeiro administrador é criado por comando equivalente no `identity-access`. |

### Membros

> **Implementados** (API e telas; [ADR 0013](adr/0013-modulo-members-e-auditoria.md)): UC-06, UC-07, UC-09 e UC-10, mais a
> anonimização (LGPD). **UC-08 (documentos e foto) fica de fora** por exigir armazenamento privado.
| ID | Caso de uso | Ator | Observações |
|---|---|---|---|
| UC-06 | Cadastrar e editar membro | Secretário, Dirigente | Dados pessoais e **cargo** (lista da igreja: membro, auxiliar, diácono, diaconisa, presbítero, evangelista, pastor). Foto fica para o UC-08. |
| UC-07 | Registrar histórico do membro | Secretário, Dirigente | Batismo, recepção, transferência. |
| UC-08 | Anexar documentos ao membro | Secretário, Dirigente | Storage privado; acesso auditado. |
| UC-09 | Listar e buscar membros | Secretário, Dirigente, Diretoria | Resultado filtrado pelo escopo do usuário. |
| UC-10 | Transferir membro entre congregações | Secretário, Dirigente | Gera evento de histórico. |

### Finanças

> **Implementados no backend** ([ADR 0015](adr/0015-modulo-finance.md)): UC-11 a UC-15 e a parte financeira do UC-16, além
> do repasse com a sede, do saldo inicial e do extrato de contribuição por membro. Sem telas ainda (fase de front-end).
> A parte de membros do UC-16 é `GET /members/stats` ([ADR 0018](adr/0018-painel-consolidado-composto-no-cliente.md)).

| ID | Caso de uso | Ator | Observações |
|---|---|---|---|
| UC-11 | Gerenciar contas (caixa e bancos) e categorias | Tesoureiro | Categorias personalizáveis. |
| UC-12 | Registrar entrada | Tesoureiro | Dízimo pode ser vinculado a um membro. |
| UC-13 | Registrar saída | Tesoureiro | A congregação paga e a **sede aprova TODA saída** (resposta da igreja, 2026-10-22); entra no MVP. |
| UC-14 | Estornar lançamento | Tesoureiro | Nunca edita nem apaga; gera novo lançamento (ADR 0005). |
| UC-15 | Ver dashboard financeiro da congregação | Tesoureiro, Dirigente | Entradas, saídas e saldo; filtros por período e categoria. |

### Diretoria
| ID | Caso de uso | Ator | Observações |
|---|---|---|---|
| UC-16 | Ver dashboard consolidado | Diretoria | Membros ativos e finanças consolidadas de todas as congregações. |

## Regras de negócio transversais
- **RN-01:** toda consulta é filtrada por organização e pelo escopo de congregação do usuário.
- **RN-02:** lançamentos confirmados são imutáveis; correção só por estorno.
- **RN-03:** valores monetários em centavos inteiros.
- **RN-04:** toda alteração de dado de negócio gera registro de auditoria; leitura de dado sensível também.
- **RN-05:** um usuário pode ter múltiplas atribuições, cada uma com seu escopo.
- **RN-06:** cada organização tem exatamente uma sede, e ela está ativa. Nome de congregação é único na organização.
- **RN-07:** congregação não é excluída, apenas desativada.
- **RN-08:** e-mail único no sistema; cada usuário pertence a uma igreja. Senha de 10 a 128 caracteres, guardada só como hash.
- **RN-09:** 5 falhas seguidas de login bloqueiam a conta por 15 minutos; o erro de login não revela se o e-mail existe.
- **RN-10:** reapresentar um token de renovação já trocado é tratado como roubo e revoga todas as sessões daquele login.

## Fora do MVP (já previstos, não construídos)
Carteirinha e certificados · frequência · agenda · atas · comunicação interna · relatórios avançados e
exportação · fluxo de caixa · aprovações · push/e-mail · app mobile · PIX · portal do membro.

## Perguntas para validar com a igreja

Respostas recebidas em 2026-10-22 (✅ respondida, ⚠ ainda em aberto):

1. ✅ **Cargos:** Membro, Auxiliar, Diácono, Diaconisa, Presbítero, Evangelista e Pastor. ⚠ Ministérios e a lista de
   "situação espiritual" **ainda não foram informados** (a lista de situações do `members` segue provisória, ADR 0013).
2. ✅ **Contribuição individual:** o **próprio membro** vê a sua dos **últimos 12 meses**; **Tesoureiro, Dirigente e
   Diretoria** veem **todo o período**. (O acesso do próprio membro exige o portal do membro, v2.0; o MVP entrega o
   extrato de todo o período para quem tem a permissão, com a janela de 12 meses já prevista no desenho. ADR 0015.)
3. ✅ **Aprovação:** **toda saída** precisa de aprovação da sede (não há valor de corte).
4. ✅ **Dízimo:** pode ser identificado por membro **ou** anônimo (cada lançamento tem ou não membro).
5. ✅ **Uma saída pode ser paga pela congregação, com aprovação da sede. Há repasse entre congregação e sede.**
6. ✅ **Não há planilhas: o sistema começa do zero** (nenhum importador é necessário).

### O que isso muda no código

- **Cargo do membro (resposta 1):** `members` ganha o campo `position` com os 7 valores ("Membro" é o padrão). Mandatos
  (período no cargo) continuam fora do MVP.
- **Aprovação da sede (respostas 3 e 5):** a saída entra no `finance` do MVP como fluxo (pendente, aprovada, recusada,
  cancelada), com aprovador diferente de quem pediu.
- **Repasse (resposta 5):** par de lançamentos ligados (sai da conta de uma congregação, entra na da outra), aprovado pela
  sede como um só ato.
- **Extrato individual (resposta 2):** permissão própria (`finance:read-individual`, ADR 0004) e leitura auditada
  (ADR 0006 e 0013).
- **Sem importação (resposta 6):** o sistema precisa registrar o **saldo inicial** de cada conta.
