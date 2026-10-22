# ADR 0019 — Editor de papéis (UC-02) e catálogo de permissões

- **Status:** aceita
- **Data:** 2026-10-22

## Contexto

O ADR 0014 entregou uma versão enxuta do UC-02: cinco papéis padrão, fixos no código. Faltava o Administrador criar
**papéis próprios** ("Secretário de Missões", "Louvor"). Duas perguntas apareceram:

1. **Que permissões existem?** Pelo ADR 0004 cada módulo define as suas e o `identity-access` só confere o formato
   (`modulo:acao`). Sem uma lista, um erro de digitação (`members:raed`) cria um papel que não concede nada, e a tela não
   tem como mostrar as opções.
2. **O que um papel personalizado não pode ter?** Quem cria papéis poderia criar um com tudo e atribuí-lo a si mesmo.

## Decisões

### 1. Catálogo montado na raiz, cada módulo descreve as suas

Cada módulo exporta, no seu `*.permissions.ts` e pelo seu `index.ts`, a lista das suas permissões com uma descrição em
português (`PermissionDefinition`, em `shared/application`). O arquivo `src/permission-catalog.module.ts`, ao lado do
`AppModule`, junta todas e as entrega ao `identity-access` pelo token `PERMISSION_CATALOG`.

- O módulo é **global** porque o `identity-access` não pode importar os outros módulos: eles já importam o
  `identity-access` (para a política de acesso), e importar de volta criaria um ciclo.
- `GET /roles/permissions` mostra à tela o que pode ser marcado.
- Criar ou editar um papel com uma permissão fora do catálogo é recusado (422).
- Um teste confere que os papéis padrão só usam permissões do catálogo e que não há chave repetida.

### 2. Permissões reservadas ao Administrador

Um papel personalizado **nunca** recebe o curinga `*` nem `access:manage-users`. Quem gere acessos pode criar papéis e
atribuí-los, então ter essa permissão equivale a ser Administrador. Por isso ela fica só com o Administrador, e a regra mora
no **domínio** (`Role.custom`): vale venha o pedido de onde vier. O domínio também recusa:

- papel sem nenhuma permissão;
- o nome de um papel padrão, porque o código acha os papéis padrão pelo nome.

### 3. Papéis padrão não mudam

Editar ou excluir um papel padrão dá 409 (`identity.system_role_immutable`). Quem quer algo parecido cria um personalizado.
O código continua sendo a fonte da verdade dos papéis padrão (ADR 0015, item 8).

### 4. Excluir um papel atribuído é recusado

Excluir um papel que ainda está atribuído a alguém, inclusive a um usuário desativado, dá 409 (`identity.role_in_use`):
ninguém perde acesso sem perceber. O Administrador remove as atribuições antes.

- O caso de uso confere antes, para dar o erro certo.
- O banco é a rede de segurança para a corrida entre "conferir" e "excluir": a chave estrangeira das atribuições já era
  `ON DELETE RESTRICT`, e o repositório traduz a recusa (`P2003`) para o mesmo erro. **Nenhuma migration foi necessária.**

### 5. Vale na hora e é auditado

As permissões são lidas do banco a cada requisição, então editar um papel muda o acesso de quem o tem na próxima chamada.
Criar, editar e excluir gravam na trilha **depois** de salvar (`role.created`, `role.updated`, `role.deleted`), como as
outras ações administrativas (ADR 0014). O registro leva as permissões e se o nome mudou, sem nenhum dado pessoal.

## Rotas

Todas exigem `access:manage-users` na igreja toda.

| Rota | O que faz |
|---|---|
| `GET /roles/permissions` | Permissões que um papel personalizado pode receber, com descrição |
| `POST /roles` | Cria um papel personalizado (201) |
| `PATCH /roles/:id` | Muda nome e/ou permissões; campo ausente fica como estava |
| `DELETE /roles/:id` | Exclui (204); 409 se for padrão ou estiver atribuído |

## Alternativas consideradas

- **Lista fixa dentro do `identity-access`**, conferida por teste contra os módulos. Menos código, mas toda permissão nova
  exigiria lembrar de atualizar dois lugares.
- **Só o formato**, sem catálogo. O mínimo de código, mas aceita erro de digitação e não dá à tela a lista de opções.
- **Permitir `access:manage-users` em papel personalizado** ("Gerente de acessos"). Mais flexível, porém é uma escalada de
  privilégio disfarçada.
- **Excluir levando as atribuições junto**, ou **desativar em vez de excluir**. A primeira tira acesso sem aviso; a segunda
  exige um estado a mais em toda checagem de acesso.

## Consequências

- (+) A tela do editor (fase de front-end) já tem tudo de que precisa: catálogo, lista, criar, editar e excluir.
- (+) Uma permissão nova de um módulo aparece no editor assim que entra na lista dele e no catálogo da raiz.
- (−) Edição concorrente do mesmo papel: vence a última gravação (não há versão no papel). Aceitável, porque só o
  Administrador edita papéis.
- (−) A checagem de "papel atribuído" lê todos os usuários da igreja. Está marcada como atalho (`shortcut:`) no código e
  só pesa a partir de alguns milhares de usuários.
- O convite por link (o resto do UC-03) continua adiado, agora como próximo passo.
