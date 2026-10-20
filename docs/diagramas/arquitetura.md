# Arquitetura em desenhos

[Voltar ao guia](README.md)

## 1. Contexto do produto — planejado

Esta visão mostra quem usa o produto e quais sistemas externos participam. A interface web, o storage e os módulos de negócio ainda não existem no código.

```mermaid
flowchart LR
    Admin[Administrador] --> Sistema
    Equipe[Secretário, dirigente e tesoureiro] --> Sistema
    Diretoria[Diretoria] --> Sistema
    Sistema[Sistema de gestão de igreja] --> Banco[(PostgreSQL)]
    Sistema --> Storage[Storage privado de arquivos]
```

O membro é uma pessoa cadastrada; ele não é necessariamente um usuário com login. O portal do membro está fora do MVP.

## 2. Execução local — implementado

```mermaid
flowchart LR
    Cliente[Cliente HTTP] -->|GET /health, porta 3000 por padrão| API
    subgraph Maquina[Máquina do desenvolvedor]
        API[API NestJS executada com pnpm dev]
        Prisma[Prisma e adaptador pg]
        subgraph Docker[Docker Compose]
            DB[(PostgreSQL 17)]
            Volume[Volume db-data]
            DB --- Volume
        end
        API --> Prisma
        Prisma -->|Conexão local, porta 5432 por padrão| DB
    end
```

A API roda fora do Docker. O volume mantém os dados quando o container é recriado. Isso não substitui backup. O Compose atual é para desenvolvimento, e a hospedagem de produção está adiada no ADR 0007.

## 3. Módulos do backend — planejado

```mermaid
flowchart TB
    HTTP[Requisições HTTP] --> API
    subgraph API[Uma aplicação NestJS: monólito modular]
        Identity[identity-access: usuários e permissões]
        Org[organization: igreja e congregações]
        Members[members: cadastro e histórico]
        Finance[finance: contas e lançamentos]
        Audit[audit: trilha de ações]
        Platform[platform: configuração e acesso ao banco]
    end
    Identity --> DB[(Um banco PostgreSQL)]
    Org --> DB
    Members --> DB
    Finance --> DB
    Audit --> DB
```

As setas para o banco representam a persistência das tabelas de cada módulo. Ter um banco compartilhado não autoriza um módulo a consultar as tabelas de outro. A colaboração deve acontecer por uma interface pública ou por eventos; ainda não existe uma infraestrutura de eventos implementada.

## 4. Camadas de um módulo — padrão planejado

```mermaid
flowchart LR
    Controller[Presentation: controller] --> UseCase[Application: caso de uso]
    UseCase --> Domain[Domain: regras e interfaces]
    Repo[Infrastructure: repositório Prisma] --> Domain
    Repo --> DB[(Banco)]
    Nest[Container de injeção do NestJS] -. conecta a interface à implementação .-> Repo
```

Aqui as setas sólidas entre camadas indicam **dependências de código**. O caso de uso chama uma interface de repositório; em execução, o Nest fornece sua implementação com Prisma. O domínio permanece independente de HTTP e banco. Veja a [regra de camadas](../arquitetura-do-codigo.md).

## 5. Possível evolução de implantação — proposta

```mermaid
flowchart LR
    Web[Interface web] --> Entrada[Entrada HTTPS e balanceador]
    Entrada --> API1[API: instância 1]
    Entrada --> API2[API: instância 2]
    API1 --> DB[(PostgreSQL)]
    API2 --> DB
    API1 --> Storage[Storage privado]
    API2 --> Storage
    Worker[Worker de tarefas, se necessário] -. fila pg-boss planejada .-> DB
```

Este desenho é uma hipótese de evolução, não uma decisão de hospedagem. Antes de adotá-lo, medir carga e garantir que sessões, arquivos e tarefas não dependam da memória ou disco de uma única instância. Dimensionar o total de conexões ao banco considerando todas as instâncias e workers. A fila pg-boss é a escolha registrada no ADR 0002, mas ainda não foi implementada.
