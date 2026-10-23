# ADR 0020 — Diretório mínimo de usuários (ids viram nomes nas telas do financeiro e da trilha)

- **Status:** aceita
- **Data:** 2026-10-23

## Contexto

Várias respostas da API trazem **ids de usuário**: `requestedBy` e `decidedBy` nos lançamentos e na fila de aprovação
([ADR 0015](0015-modulo-finance.md)), `actorId` na trilha de auditoria ([ADR 0017](0017-consulta-a-trilha-de-auditoria.md)). A
tela precisa mostrar **quem** ("pedido por Maria"), mas a única forma de trocar id por nome era `GET /users`, que exige
`access:manage-users` para a igreja toda. O Tesoureiro, a Diretoria e o Dirigente **não** têm essa permissão (e não devem ter:
ela dá poder de administrar acessos). Resultado: a tela da sede mostraria "pedido por 0199…". Percebido antes de começar o
front-end.

## Decisão

### 1. `GET /users/directory?ids=a,b,c`: resolve só os ids pedidos

Devolve `{ id, email, active }` para os ids informados (de 1 a 50, separados por vírgula). **Não é uma lista de usuários**:
sem `ids` é 400, e ninguém "varre" a igreja; só pergunta por quem já viu num lançamento. Sem papéis, sem data de login, sem
senha nem dado de bloqueio. O que o usuário vê por aqui é o e-mail, que já é o identificador de login e já aparece em qualquer
tela de administração. Usuário desativado aparece com `active: false` (a pessoa existiu; o histórico continua legível).

### 2. Quem pode perguntar: qualquer um que veja ids de usuário em alguma tela

A rota exige **estar logado** e o caso de uso confere se a pessoa tem **alguma** de: `finance:read`, `finance:approve`,
`audit:read` ou `access:manage-users`, em qualquer escopo. Quem tem uma delas já recebe ids de usuário em alguma resposta;
dar o nome não amplia o que ela vê. Quem só lê membros (por exemplo) recebe 403.

A rota **não usa `@RequirePermission`**: o guard exige exatamente uma permissão, e o diretório atende a vários papéis. Foi
preferível uma rota autenticada com a conferência "alguma de" no caso de uso a criar uma permissão nova (`users:directory`),
que obrigaria a conceder a todos os papéis de sistema e a migrar as igrejas existentes, só para repetir o que as outras
quatro já dizem. Os textos das permissões ficam na fábrica (o `identity-access` não importa o financeiro nem a trilha, para
não criar ciclos de importação), e um teste os confere com as constantes dos módulos dono.

### 3. Sempre limitado à igreja do token

O repositório ganhou `findManyByIds(organizationId, ids)`: a igreja entra na própria consulta, então id de outra igreja ou
desconhecido **some da resposta**, igual a inexistente (sem erro, sem revelar nada). Limite de 50 ids por chamada e limite de
taxa de 60 por minuto, contra raspagem.

## Alternativas consideradas

- **Devolver o nome (ou e-mail) junto em cada resposta do financeiro e da trilha:** a tela não precisaria de segunda chamada,
  mas repetiria a mesma pessoa em todas as linhas e acoplaria o módulo `finance` e o `audit` ao `identity-access` (leitura de
  tabela de outro módulo, ADR 0001). Descartado.
- **Dar `access:manage-users` ou "listar usuários" ao Tesoureiro e à Diretoria:** entrega muito mais do que o necessário
  (a lista inteira, papéis e datas de login) e mistura ler com administrar. Descartado.
- **Uma permissão nova `users:directory`:** explícita, mas redundante e exige migração dos papéis de sistema (ver acima).
- **Mostrar o nome do membro vinculado ao usuário:** hoje usuário e membro são entidades separadas (modelo de domínio, item 3);
  o vínculo não existe. Fica o e-mail.

## Consequências

- (+) A tela da sede, a lista de lançamentos e a trilha mostram **quem**, sem dar poder de administrar usuários.
- (+) A exposição é mínima: só e-mails de quem já aparece numa resposta que a pessoa já pode ler.
- (−) Uma segunda chamada por tela (a tela junta os ids da página e pergunta uma vez, até 50).
- (−) O "nome" é o e-mail. Quando usuário e membro puderem ser ligados (ou o usuário ganhar um nome de exibição), o diretório
  passa a devolvê-lo sem mudar o contrato de quem chama (o campo `email` ganha um irmão).
- (−) A parte do PostgreSQL (`findManyByIds`) só roda no CI; o contrato do repositório foi estendido para os dois.
