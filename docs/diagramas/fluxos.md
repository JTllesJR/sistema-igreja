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

## 6. Ciclo de vida da congregação, UC-05 — implementado (domínio e aplicação; sem camada HTTP)

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

## 7. Designar nova sede, UC-05 — implementado (domínio, aplicação e repositório; sem camada HTTP)

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
  não é adiável. Marcar a nova antes de desmarcar a antiga violaria o índice no meio da transação. O repositório
  Prisma grava em três passos (desmarcar a sede antiga, atualizar as existentes, inserir as novas), e há teste de
  integração que força a pior ordem da lista (nova sede antes da antiga) para provar que o resultado não depende dela.
- **A versão evita sobrescrita silenciosa.** Duas designações simultâneas partem da mesma `version`; só a primeira
  confirma, a outra recebe conflito.

A gravação da auditoria (RN-04) na mesma transação ainda precisa ser detalhada, como no fluxo do UC-06.

## 8. Entrar, UC-01 — implementado (aplicação; sem camada HTTP)

```mermaid
sequenceDiagram
    actor Cliente
    participant UC as Authenticate
    participant Users as UserRepository
    participant Hasher as PasswordHasher
    participant Sessions as SessionRepository
    Cliente->>UC: e-mail e senha
    alt Formato inválido
        UC-->>Cliente: InvalidCredentials
    else Formato válido
        UC->>Users: findByEmail
        alt E-mail não cadastrado
            UC->>Hasher: simulateVerification, gasta o mesmo tempo
            UC-->>Cliente: InvalidCredentials
        else Conta bloqueada ou desativada
            UC-->>Cliente: InvalidCredentials, sem verificar a senha
        else Cadastrado e liberado
            UC->>Hasher: verify
            alt Senha errada
                UC->>Users: registra falha, a 5ª bloqueia por 15 min
                UC-->>Cliente: InvalidCredentials
            else Senha correta
                UC->>Users: zera falhas, registra login e re-hasha se preciso
                UC->>Sessions: add, abre uma nova família
                UC-->>Cliente: token de acesso 15 min e de renovação 30 dias
            end
        end
    end
```

**Toda falha devolve o mesmo erro**, com a mesma mensagem: quem tenta adivinhar não distingue "e-mail inexistente",
"senha errada", "conta bloqueada" ou "dado malformado". Com e-mail inexistente o sistema ainda **gasta o tempo de
uma verificação real**, para a resposta não ser mais rápida e entregar quais e-mails existem. Conta bloqueada ou
desativada não tem a senha verificada (acertar não adiantaria). Um login em duas abas ao mesmo tempo não falha: a
gravação do usuário repete em caso de conflito de versão.

## 9. Renovar a sessão, UC-01 — implementado (aplicação; sem camada HTTP)

```mermaid
sequenceDiagram
    actor Cliente
    participant UC as RefreshSession
    participant Sessions as SessionRepository
    Cliente->>UC: token de renovação
    UC->>Sessions: findByTokenHash
    alt Desconhecido, expirado ou revogado
        UC-->>Cliente: SessionInvalid
    else Já trocado: reuso
        UC->>Sessions: revokeFamily
        UC-->>Cliente: SessionReuseDetected
    else Ativo
        UC->>Sessions: rotate, condicional
        alt Outra requisição trocou antes: corrida
            Sessions-->>UC: conflito
            UC->>Sessions: revokeFamily
            UC-->>Cliente: SessionReuseDetected
        else Troca concluída
            UC-->>Cliente: novos tokens
        end
    end
```

A troca no repositório é **condicional** (só vale se a sessão anterior ainda não foi trocada). Sem isso, duas
requisições simultâneas com o mesmo token criariam duas sessões novas e o roubo passaria despercebido. Quem perde a
corrida é tratado como reuso e a **família inteira** é revogada: dono legítimo e ladrão precisam entrar de novo.
Conta *bloqueada por tentativas* não impede renovar (senão errar a senha de propósito derrubaria o dono); conta
*desativada* impede.

## 10. Estados de uma sessão — implementado (domínio)

```mermaid
stateDiagram-v2
    [*] --> ACTIVE: login, início da família
    ACTIVE --> ROTATED: renovação, nasce a próxima ACTIVE
    ACTIVE --> EXPIRED: passou de expires_at
    ACTIVE --> REVOKED: logout, reuso ou troca de senha
    ROTATED --> REVOKED: família revogada
```

Precedência quando mais de uma condição vale: `REVOKED` vence `ROTATED`, que vence `EXPIRED`. Assim, depois que a
família é revogada, reapresentar um token antigo não parece "reuso" de novo. O prazo é deslizante (30 dias a partir
de cada renovação) com teto absoluto de 90 dias desde o login.
