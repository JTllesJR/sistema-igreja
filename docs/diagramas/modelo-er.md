# Modelo entidade-relacionamento em partes

[Voltar ao guia](README.md)

O modelo ER mostra entidades, seus atributos e as quantidades possíveis de relacionamentos. Estes desenhos dividem o [modelo de domínio](../modelo-dominio.md) para facilitar a leitura.

## Como ler

| Símbolo | Significado                                  |
| ------- | -------------------------------------------- | --- | ------------- |
| `       |                                              | `   | Exatamente um |
| `o      | `ou`                                         | o`  | Zero ou um    |
| `o{`    | Zero ou muitos                               |
| `PK`    | Chave que identifica o registro              |
| `FK`    | Referência a outro registro no modelo lógico |

Os diagramas planejados são um **modelo lógico resumido**, não migrations prontas. `FK` indica a referência desejada; a definição de restrições físicas, nulabilidade e índices deve ser revisada ao implementar. IDs entre módulos não autorizam acesso às tabelas do outro módulo.

## Banco atual — implementado

```mermaid
erDiagram
    ORGANIZATION {
        uuid id PK
        string name
        timestamptz created_at
        timestamptz updated_at
    }
```

Esta é a única entidade no [schema Prisma atual](../../apps/api/prisma/schema.prisma). O ID é UUID v7. Os modelos abaixo ainda não estão no banco.

## Organização e acesso — planejado

```mermaid
erDiagram
    ORGANIZATION ||--o{ CONGREGATION : possui
    ORGANIZATION ||--o{ USER : possui
    ORGANIZATION ||--o{ ROLE : define
    USER ||--o{ ROLE_ASSIGNMENT : recebe
    ROLE ||--o{ ROLE_ASSIGNMENT : concede
    ROLE ||--o{ ROLE_PERMISSION : contem
    CONGREGATION |o--o{ ROLE_ASSIGNMENT : limita

    ORGANIZATION {
        uuid id PK
        string name
    }
    CONGREGATION {
        uuid id PK
        uuid organization_id FK
        string name
        boolean is_headquarters
    }
    USER {
        uuid id PK
        uuid organization_id FK
        string email
        string password_hash
        boolean active
    }
    ROLE {
        uuid id PK
        uuid organization_id FK
        string name
    }
    ROLE_PERMISSION {
        uuid organization_id FK
        uuid role_id FK
        string permission
    }
    ROLE_ASSIGNMENT {
        uuid id PK
        uuid organization_id FK
        uuid user_id FK
        uuid role_id FK
        uuid congregation_id FK
    }
```

Uma atribuição com `congregation_id` nulo vale para a organização inteira. Um usuário pode receber vários papéis em congregações diferentes. A sede é uma congregação marcada com `is_headquarters`, não outra entidade.

## Membros — planejado

```mermaid
erDiagram
    CONGREGATION ||--o{ MEMBER : recebe
    USER |o--o| MEMBER : vinculo_opcional
    MEMBER ||--o{ MEMBER_HISTORY_EVENT : possui
    MEMBER ||--o{ MEMBER_DOCUMENT : possui
    MEMBER ||--o{ MANDATE : exerce
    POSITION ||--o{ MANDATE : define

    MEMBER {
        uuid id PK
        uuid organization_id FK
        uuid congregation_id FK
        string full_name
        string status
        string photo_key
    }
    MEMBER_HISTORY_EVENT {
        uuid id PK
        uuid organization_id FK
        uuid member_id FK
        string type
        date occurred_on
    }
    MEMBER_DOCUMENT {
        uuid id PK
        uuid organization_id FK
        uuid member_id FK
        string kind
        string storage_key
    }
    POSITION {
        uuid id PK
        uuid organization_id FK
        string name
        string kind
    }
    MANDATE {
        uuid id PK
        uuid organization_id FK
        uuid member_id FK
        uuid position_id FK
        date starts_on
        date ends_on
    }
```

O vínculo opcional entre usuário e membro é conceitual: a coluna e a restrição que o implementarão ainda devem ser definidas. Documentos e fotos guardam chaves de storage; o conteúdo dos arquivos fica no storage privado planejado. Os valores finais de status e tipos de histórico aguardam validação com a igreja.

## Finanças — planejado

```mermaid
erDiagram
    CONGREGATION ||--o{ FINANCIAL_ACCOUNT : possui
    CONGREGATION ||--o{ FINANCIAL_ENTRY : registra
    FINANCIAL_ACCOUNT ||--o{ FINANCIAL_ENTRY : recebe
    FINANCE_CATEGORY ||--o{ FINANCIAL_ENTRY : classifica
    MEMBER |o--o{ FINANCIAL_ENTRY : contribui
    FINANCIAL_ENTRY |o--o| FINANCIAL_ENTRY : estorna

    FINANCIAL_ACCOUNT {
        uuid id PK
        uuid organization_id FK
        uuid congregation_id FK
        string name
        string kind
    }
    FINANCE_CATEGORY {
        uuid id PK
        uuid organization_id FK
        string name
        string direction
    }
    FINANCIAL_ENTRY {
        uuid id PK
        uuid organization_id FK
        uuid congregation_id FK
        uuid account_id FK
        uuid category_id FK
        uuid member_id FK
        string direction
        bigint amount_cents
        date occurred_on
        uuid reverses_entry_id FK
    }
```

`member_id` é opcional, permitindo oferta anônima. `reverses_entry_id` é opcional e identifica o lançamento original; cada original pode ter no máximo um estorno. O saldo é calculado pelos lançamentos, sem coluna de saldo neste modelo.

## Auditoria transversal — planejado

```mermaid
erDiagram
    ORGANIZATION ||--o{ AUDIT_LOG : delimita
    AUDIT_LOG {
        uuid id PK
        uuid organization_id FK
        uuid actor_id
        string action
        string entity
        string entity_id
        json before
        json after
        timestamptz at
    }
```

`actor_id` identifica quem realizou a ação e `entity`/`entity_id` identificam o objeto afetado. Não há uma FK genérica de `entity_id` para todas as tabelas. O desenho resume o modelo existente; retenção, minimização dos dados registrados e casos sem ator autenticado precisam ser detalhados ao implementar.

## Revisões necessárias antes das migrations

- Garantir que referências não conectem dados de organizações diferentes, usando restrições e validações apropriadas.
- Definir chaves únicas por organização, inclusive a política de e-mail dos usuários.
- Impedir estornos duplicados também sob concorrência, com restrição de unicidade no banco.
- Garantir coerência entre organização, congregação e conta em um lançamento.
- Definir nulabilidade, índices para consultas reais e regras de exclusão; cadastros seguem o soft delete previsto no modelo de domínio.
- Definir como registrar o autor dos lançamentos conforme ADR 0005; esse atributo ainda não aparece no modelo resumido de domínio.
- Incluir campos comuns de datas e organização nas tabelas apropriadas. A própria `organization` é a raiz e não precisa referenciar a si mesma.
