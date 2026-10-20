# Fluxos e comportamento

[Voltar ao guia](README.md)

Diagramas de sequência mostram a ordem das mensagens; atividades mostram decisões; estados mostram o ciclo de vida de uma entidade. Apenas o primeiro fluxo abaixo está implementado.

## 1. Verificar saúde da API — implementado

```mermaid
sequenceDiagram
    actor Cliente
    participant Controller as HealthController
    participant Service as HealthService
    participant Prisma as PrismaService
    participant DB as PostgreSQL
    Cliente->>Controller: GET /health
    Controller->>Service: check()
    Service->>Prisma: $queryRaw
    Prisma->>DB: SELECT 1
    alt Consulta bem-sucedida
        DB-->>Service: Resposta via Prisma
        Service-->>Controller: status ok, database up
        Controller-->>Cliente: HTTP 200
    else Falha na consulta ou conexão
        Prisma-->>Service: Erro
        Service-->>Controller: status degraded, database down
        Controller-->>Cliente: HTTP 503
    end
```

Não exige autenticação. Uma resposta saudável comprova que uma consulta simples ao banco funcionou, não que todos os futuros módulos estão operacionais.

## 2. Autorizar uma operação — planejado

```mermaid
flowchart TD
    Inicio[Requisição para operação de negócio] --> Autenticado{Identidade válida?}
    Autenticado -->|Não| NegarIdentidade[Rejeitar autenticação]
    Autenticado -->|Sim| Tenant[Obter organização da identidade autenticada]
    Tenant --> Guard{Tem a permissão em algum escopo?}
    Guard -->|Não| NegarPermissao[Rejeitar autorização]
    Guard -->|Sim| Escopo[Determinar congregações permitidas para a ação]
    Escopo --> Dados[Consultar ou alterar com filtro de organização e escopo]
    Dados --> Permitido{Recurso acessível nesse escopo?}
    Permitido -->|Não| Rejeitar[Rejeitar sem revelar dados de outro escopo]
    Permitido -->|Sim| Executar[Concluir operação e auditar quando aplicável]
```

O guard e o filtro de dados cumprem funções diferentes. Ter permissão para cadastrar em uma congregação não libera todas as congregações. A organização vem da identidade autenticada, nunca de um `organization_id` enviado pelo cliente. Os detalhes do contexto autenticado e dos erros ainda serão implementados.

## 3. Cadastrar membro, UC-06 — proposta de sequência

```mermaid
sequenceDiagram
    actor Usuario as Secretário
    participant API as Controller e autenticação
    participant UC as Caso de uso de cadastro
    participant Org as Interface pública de organization
    participant Repo as Repositório de members
    participant DB as PostgreSQL
    Usuario->>API: Enviar dados e congregação
    API->>API: Validar contrato e permissão na rota
    API->>UC: Dados e contexto autenticado
    UC->>Org: Validar congregação na organização e no escopo
    Org-->>UC: Resultado da validação
    alt Dados, regras e acesso válidos
        UC->>UC: Aplicar regras do membro
        UC->>Repo: Persistir no contexto autorizado
        Repo->>DB: INSERT do membro
        DB-->>Repo: Registro criado
        Repo-->>UC: Membro
        Note over UC,DB: Conclusão deve garantir auditoria conforme RN-04
        UC-->>API: Resultado
        API-->>Usuario: Cadastro concluído
    else Validação ou autorização falhou
        UC-->>API: Falha sem criar membro
        API-->>Usuario: Erro apropriado
    end
```

A fronteira com `organization` evita consultar diretamente suas tabelas dentro de `members`. Este fluxo é ilustrativo: nomes finais de classes, tratamento de falhas de persistência e integração com auditoria ainda precisam ser definidos. O modelo de domínio prevê interceptor de auditoria; garantir consistência entre gravação e auditoria exige detalhar a transação antes da implementação.

## 4. Transferir membro, UC-10 — proposta de atividade

```mermaid
flowchart TD
    Inicio[Solicitar transferência] --> Carregar[Carregar membro na organização e no escopo autorizado]
    Carregar --> Validar[Validar destino pela interface de organization]
    Validar --> Pode{Origem, destino e permissões válidos?}
    Pode -->|Não| Rejeitar[Rejeitar sem alterar o cadastro]
    Pode -->|Sim| Transacao[Iniciar transação]
    Transacao --> Atualizar[Atualizar congregação atual do membro]
    Atualizar --> Historico[Registrar evento de transferência]
    Historico --> Auditoria[Garantir registro de auditoria]
    Auditoria --> Sucesso{Todas as gravações concluídas?}
    Sucesso -->|Não| Rollback[Desfazer a transação]
    Sucesso -->|Sim| Commit[Confirmar a transação]
```

A atualização e o histórico precisam ser consistentes: não pode existir transferência sem rastro. Ainda é necessário decidir se um usuário precisa de acesso às duas congregações ou se haverá outro procedimento de autorização. Transferência entre organizações não está definida neste caso de uso.

## 5. Lançamento e estorno, UC-12 a UC-14 — planejado

```mermaid
stateDiagram-v2
    [*] --> Confirmado: Registro aceito
    Confirmado --> Estornado: Novo lançamento de estorno referencia o original
    Estornado --> [*]
```

Este é um **estado lógico**, calculado pela existência de um estorno; não propõe uma coluna de status. O original continua armazenado e imutável. O encerramento no desenho não significa exclusão. Rascunhos, aprovações e estorno de estorno não estão especificados aqui.

Exemplo: uma entrada de R$ 100,00 é armazenada como `10000` centavos com direção `IN`. Seu estorno gera um novo lançamento de `10000` centavos com direção `OUT`, referenciando o original. O efeito líquido no saldo é zero, e os dois registros preservam a história.

Na implementação, validar organização, escopo, unicidade de estorno e vínculo com o original. Duas requisições simultâneas de estorno devem resultar em apenas um estorno persistido.

## 6. Ciclo de vida da congregação, UC-05 — planejado

```mermaid
stateDiagram-v2
    [*] --> Ativa: Cadastrar
    Ativa --> Inativa: Desativar, se não for a sede
    Inativa --> Ativa: Reativar
```

Congregação não é excluída: há membros e lançamentos ligados a ela. "Sede" não é um estado, e sim um atributo de uma
congregação **ativa**, e a sede não pode ser desativada. Para desativá-la, designa-se outra sede antes (fluxo abaixo).
Este estado é regra de negócio, visível e reversível; não é o soft delete (`deleted_at`) dos demais cadastros.
Decisão em [ADR 0009](../adr/0009-modulo-organization.md).

## 7. Designar nova sede, UC-05 — planejado

```mermaid
sequenceDiagram
    actor Admin as Administrador
    participant UC as Caso de uso: designar sede
    participant Org as Organization (domínio)
    participant Repo as Repositório
    participant DB as PostgreSQL
    Admin->>UC: Congregação que será a sede
    UC->>Repo: Carregar organização do contexto
    Repo->>DB: SELECT organização e congregações
    DB-->>Repo: Dados e version
    Repo-->>UC: Organization
    UC->>Org: designateHeadquarters(congregação)
    alt Inexistente, inativa ou já é a sede
        Org-->>UC: Erro de domínio
        UC-->>Admin: Rejeitado, nada alterado
    else Regra satisfeita
        Org-->>UC: Nova sede definida
        UC->>Repo: Salvar
        Repo->>DB: BEGIN
        Repo->>DB: UPDATE organização WHERE version = n
        alt Nenhuma linha atualizada: alteração concorrente
            Repo->>DB: ROLLBACK
            Repo-->>UC: Conflito de versão
            UC-->>Admin: Conflito, tentar novamente
        else Versão confere
            Repo->>DB: UPDATE sede antiga: is_headquarters = false
            Repo->>DB: UPDATE nova sede: is_headquarters = true
            Repo->>DB: COMMIT
            UC-->>Admin: Sede alterada
        end
    end
```

Dois pontos que o desenho torna visíveis:

- **A ordem dos `UPDATE`s importa.** O índice único parcial "uma sede por organização" é verificado a cada comando e
  não é adiável. Marcar a nova antes de desmarcar a antiga violaria o índice no meio da transação.
- **A versão evita sobrescrita silenciosa.** Duas designações simultâneas partem da mesma `version`; só a primeira
  confirma, a outra recebe conflito.

A gravação da auditoria (RN-04) na mesma transação ainda precisa ser detalhada, como no fluxo do UC-06.
