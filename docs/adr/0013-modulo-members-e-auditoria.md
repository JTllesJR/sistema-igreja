# ADR 0013 — Módulo `members` e a trilha de auditoria

- **Status:** aceita
- **Data:** 2026-10-21

## Contexto

Membros são o dado mais sensível do sistema: _quem pertence à igreja_ e _qual a situação espiritual de cada um_ são
convicção religiosa (LGPD, art. 5º, II; [ADR 0006](0006-lgpd-dados-sensiveis.md)). Este bloco entrega o módulo de ponta a
ponta (domínio, banco, API e telas) **e** a trilha de auditoria que o ADR 0006 exige desde o MVP, já que ler membros é um
ato que precisa deixar rastro. A diretriz foi: entregar uma fatia vertical inteira, sem afrouxar a segurança.

**Entra:** UC-06 (cadastrar e editar), UC-07 (história), UC-09 (listar e buscar), UC-10 (transferir) e a anonimização (o
"direito ao apagamento" do ADR 0006). **Fica de fora:** UC-08 (documentos e foto), que exige armazenamento privado e URLs
assinadas (ADR próprio), e cargos e mandatos.

## Decisões

### 1. Minimização: só o que o PRD justifica

Nome, nascimento, telefone, e-mail, endereço, congregação e situação. **Não coletamos** CPF, RG, estado civil, profissão
nem foto: nada disso é necessário para o MVP, e cada campo a mais é risco a mais. A **lista devolve só o mínimo** para achar
a pessoa (id, nome, congregação, situação); contato, nascimento e endereço só saem na **ficha**, que é uma leitura
auditada. Validar com a igreja se algum campo falta (pergunta 6 do `casos-de-uso-mvp.md`).

### 2. Permissões separadas, por congregação, e o escopo vai até o banco

`members:read`, `members:write` e `members:anonymize` ([ADR 0004](0004-rbac-com-escopo.md)). Ler e escrever são
independentes e valem **por congregação**; anonimizar exige a **igreja toda**.

- O guard confere a permissão na rota; o **escopo entra na própria consulta** (`WHERE congregation_id IN (...)`), nunca em
  um filtro depois: a consulta não _enxerga_ o que o usuário não pode ver. Lista vazia de congregações = resultado vazio.
- `memberAccessFrom(policy)` é a **única ponte** entre `identity-access` e `members`: os casos de uso decidem por escopo sem
  conhecer papéis. Um teste fixa a permissão e o escopo de cada rota (`members.controller.spec.ts`).
- **404 e não 403** para quem não pode ver o membro (fora do escopo, de outra igreja ou inexistente respondem
  **idênticos**): quem não pode ver não descobre nem que a pessoa está cadastrada. **403** só quando o usuário vê o membro
  mas não pode a ação.
- Transferir exige escrever na congregação de **origem e de destino**.
- Filtrar a lista por uma congregação fora do escopo devolve **vazio**: o filtro só pode estreitar o escopo, nunca ampliar.

### 3. Trilha de auditoria somente-anexação (módulo `audit`)

Tabela `audit_log` com um **gatilho no banco que recusa `UPDATE` e `DELETE`**: nem um erro do aplicativo reescreve o
passado. Sem chave estrangeira (precisa sobreviver às outras tabelas); o instante é do **banco** (`DEFAULT now()`).
Em produção, o usuário do banco da API também não deve ter `TRUNCATE` nessa tabela (decisão de hospedagem, ADR 0007).

- **Leitura é auditada ANTES de devolver, e a falha é fechada:** se a trilha não grava, a ficha e a lista **não saem**
  (500, sem dado pessoal na resposta). Sem trilha, sem dado. Testado.
- **Escrita é auditada depois de gravar.** **Limite conhecido:** não é atômica com a gravação; se a trilha falhar depois do
  `save`, a mudança existe sem registro e a API responde erro. Uma unidade de trabalho única fica para quando houver mais
  de um módulo auditando.
- **A trilha nunca guarda dado pessoal:** só ids, ações e contexto técnico (contagens, **nomes** de campos alterados, nunca
  valores). O termo buscado **não** é registrado (pode ser o nome de alguém). Verificado por teste em todas as ações.
- **Ainda não auditado:** tentativas negadas (404/403) e eventos de login. Entram quando houver consulta à trilha (UC-04).

### 4. Anonimização (LGPD): apagar a pessoa, manter os números

`POST /members/:id/anonymize` apaga nome (vira "Membro anonimizado"), nascimento, telefone, e-mail, endereço **e as
observações** dos eventos da história; mantém a linha, a congregação, a situação e a história sem texto livre, para as
contas continuarem fechando. É **irreversível** no domínio (depois dela, nenhuma operação é aceita) e some das listas.
Exige `members:anonymize` na igreja toda, conferido **duas vezes** (no guard e no caso de uso). A interface pede que a
pessoa **digite uma palavra** para confirmar. **Limite conhecido:** a irreversibilidade é regra do domínio, não do banco.

### 5. Histórico somente-anexação

Eventos `REGISTERED`, `TRANSFER`, `STATUS_CHANGE` e `ANONYMIZED` são gerados pelo sistema; `BAPTISM` e `RECEPTION` são
informados (com a data em que ocorreram, nunca no futuro). Não há como editar nem apagar um evento (como os lançamentos
financeiros, ADR 0005). Cada evento grava de onde e para onde (congregação ou situação).

### 6. Modelo de dados

`member` e `member_history_event` (migration `*_members_audit`). Chave estrangeira **composta**
`(organization_id, congregation_id)` impede membro em congregação de outra igreja; congregação com membros não pode ser
apagada (`RESTRICT`). `name_key` (nome sem acento e em minúsculas, derivado pelo domínio) existe só para a busca.
`CHECK`s no banco repetem os limites do domínio (nome 2 a 150 caracteres, telefone só com 10 ou 11 dígitos, observação até
500): defesa em profundidade. A data de nascimento é `DATE` e trafega como texto `AAAA-MM-DD`: um dia não escorrega por
causa do fuso. **Situação (`ACTIVE`, `AWAY`, `TRANSFERRED_OUT`, `DECEASED`) é provisória** (pergunta 1 do
`casos-de-uso-mvp.md`); trocar a lista exige migration do enum.

### 7. Travamento otimista e gravação atômica

`version` por membro (duas abas, ou dois secretários, não se sobrescrevem: conflito 409). O membro e seus eventos novos
são gravados **na mesma transação**.

### 8. Mudanças de plataforma que vieram junto

- **`Address` subiu para o kernel (`shared/domain`)**: `organization` e `members` o usam (regra "só o que mais de um
  módulo usa").
- **`OrganizationQueries.findCongregation`**: `members` pergunta ao `organization` pela API pública, nunca por suas tabelas.
  O isolamento entre igrejas é garantido na própria consulta.
- **`GET /auth/me` passou a devolver as permissões de cada papel**, e a web ganhou `hasPermission` (espelho simplificado
  da política). Isso resolve o limite da tela de congregações (ADR 0012, seção 7): botões agora aparecem para quem tem a
  permissão, não só para o Administrador. É só apresentação; a API decide.
- **Limite de leitura por rota** (60 por minuto por IP na lista e na ficha), contra raspagem de dados.

### 9. Web: dado sensível na memória da página

- O cache de dados é **esvaziado ao sair** e quando a sessão acaba (`clearCacheOnLogout`), para que ninguém use o mesmo
  navegador e veja dados da pessoa anterior (nem, no limite, uma pessoa de outra igreja em seguida).
- Dados de membros **nunca** vão para `localStorage`, `sessionStorage` nem para a URL (só o id do membro). `gcTime` de 60 s
  e sem repetir leitura sozinho (cada leitura é um registro na trilha).
- A **busca espera** a pessoa parar de digitar (cada consulta é auditada). **Limite conhecido:** o termo vai na URL da
  requisição (`?search=`); logs de acesso de um proxy teriam nomes. A API não registra URLs, e o proxy da hospedagem deve
  desligar o registro de query string (ADR 0007).
- Ficha e lista avisam que o acesso é registrado; a anonimização exige digitar a palavra de confirmação.

## Alternativas consideradas

- **Filtrar por escopo depois da consulta:** mais simples, mas um erro de filtro vaza dados; o filtro no banco falha
  fechado. Descartada.
- **403 para membro fora do escopo:** revelaria que a pessoa existe. Descartada em favor do 404.
- **Excluir o membro (soft delete):** não atende o pedido do titular (os dados continuam no banco). A anonimização apaga de
  fato e preserva a integridade.
- **Auditar só alterações:** o ADR 0006 exige auditar leitura de dado sensível; foi o que se fez.
- **CPF e documentos agora:** sem necessidade comprovada; entram (se entrarem) com o UC-08 e ADR próprio.

## Consequências

- (+) Um módulo inteiro, com o rastro de quem viu e mexeu em quê, sem dado pessoal na trilha.
- (+) O escopo por congregação passou a existir de ponta a ponta (permissão, consulta, tela).
- (−) Hoje só o Administrador (criado pelo operador) existe de fato: **secretários com papel por congregação dependem do
  UC-02/UC-03** (papéis e convites). Os testes exercitam esses perfis, mas nenhuma tela os cria ainda.
- (−) Leitura auditada deixa a lista e a ficha **dependentes** da trilha: se ela cair, o módulo para de mostrar dados
  (decisão consciente: prefere indisponibilidade a vazamento sem rastro).

## O que foi verificado e o que não foi

Verificado: domínio, casos de uso e a API inteira com repositórios **em memória** (inclusive duas igrejas, escopo por
congregação, falha fechada da trilha e o formato do contrato); o repositório em memória cumpre o mesmo teste de contrato
que o do banco; mutação manual nos pontos de segurança; e as telas no navegador contra uma API simulada.

**Não verificado nesta máquina (sem Docker nem PostgreSQL):** a migration, o repositório Prisma, o gatilho da trilha, as
chaves estrangeiras e os `CHECK`s. Existem os testes (`members.repository.integration-spec.ts`,
`members.http.integration-spec.ts`, `audit.integration-spec.ts`), **mas só o CI os executa**. A parte estrutural da
migration foi gerada com `prisma migrate diff` a partir do schema (sem banco); o SQL manual (`CHECK`s e gatilho) foi
escrito à mão e é o que mais merece atenção na primeira execução.
