# Guia visual de engenharia do sistema

Estes diagramas explicam o sistema e servem como referência para implementar, revisar e testar novas funcionalidades. São escritos em **Mermaid**, um formato de texto que permite versionar os desenhos junto com o código.

No GitHub, abra estes arquivos para ver os desenhos renderizados. No editor, use uma visualização Markdown compatível com Mermaid. Edite o bloco `mermaid` para atualizar o desenho.

## Ordem de leitura

| Documento                       | Pergunta que responde                     | Prática de engenharia                         |
| ------------------------------- | ----------------------------------------- | --------------------------------------------- |
| [Arquitetura](arquitetura.md)   | Quais partes existem e como se conectam?  | Visões de contexto, componentes e implantação |
| [Casos de uso](casos-de-uso.md) | Quem precisa fazer o quê?                 | Requisitos funcionais e rastreabilidade       |
| [Modelo ER](modelo-er.md)       | Quais dados existem e como se relacionam? | Modelagem de dados e integridade              |
| [Fluxos](fluxos.md)             | Em que ordem as operações acontecem?      | Diagramas de sequência, atividade e estados   |

## Como interpretar o estágio do projeto

- **Implementado:** encontrado no código em 20/10/2026. Não significa implantação em produção ou execução validada neste documento.
- **Planejado:** definido nos casos de uso, modelo de domínio ou ADRs; ainda não implementado.
- **Proposta:** sugestão para detalhar a implementação; exige revisão antes de virar requisito ou decisão aceita.

O código atual tem API, configuração, acesso ao banco, `/health`, a tabela `organization` e a **camada de domínio do módulo `organization`** (agregado, regras e testes unitários; ainda sem casos de uso, persistência das congregações nem HTTP). Login, permissões, membros, finanças, interface web e isolamento entre organizações ainda são planejados.

## Como usar durante o desenvolvimento

1. Escolha um caso de uso pelo identificador, por exemplo `UC-06`.
2. Defina entradas, resultado esperado, permissões e situações de falha.
3. Confira as entidades e os limites do módulo nos desenhos.
4. Implemente a menor operação completa: contrato, controller, caso de uso, regras e persistência.
5. Teste as regras e a integração com banco; inclua tentativas de acesso a outra organização e a uma congregação sem permissão.
6. Atualize os desenhos afetados na mesma alteração. Se mudar uma decisão estrutural, registre um ADR.

## Outras práticas que sustentam os desenhos

| Prática                       | Registro esperado                                           | Quando usar                                      |
| ----------------------------- | ----------------------------------------------------------- | ------------------------------------------------ |
| Critérios de aceite           | Exemplos verificáveis de sucesso e falha ligados ao UC      | Antes de implementar a funcionalidade            |
| Contrato da API               | Schemas Zod em `packages/contracts`; OpenAPI está planejado | Ao criar ou alterar endpoints                    |
| Decisões arquiteturais        | ADR com contexto, alternativas e consequências              | Ao mudar arquitetura, isolamento ou persistência |
| Migrações revisadas           | Schema Prisma e SQL versionados                             | Ao alterar tabelas, índices ou restrições        |
| Testes proporcionais ao risco | Unitários para regras; integração para banco e autorização  | Durante a implementação                          |
| Observabilidade               | Logs com identificador de requisição, métricas e alertas    | Antes de operar com usuários reais               |
| Recuperação                   | Procedimento de backup e exercício de restauração           | Antes do primeiro uso real                       |
| Planejamento de capacidade    | Cenário de carga, medições e gargalos observados            | Antes de decidir como ampliar a infraestrutura   |

Logs, métricas, recuperação e testes de carga são trabalhos futuros; os diagramas não comprovam essas capacidades.

## Fontes e manutenção

Os desenhos derivam de [casos de uso do MVP](../casos-de-uso-mvp.md), [modelo de domínio](../modelo-dominio.md), [arquitetura do código](../arquitetura-do-codigo.md), [ADRs](../README.md) e do [schema Prisma](../../apps/api/prisma/schema.prisma).

Em caso de divergência, verifique o código para saber o que está implementado e os ADRs para saber a decisão aceita. Corrija o documento divergente; não trate um desenho planejado como uma funcionalidade pronta. Atualize a data de verificação ao revisar o estágio de implementação.
