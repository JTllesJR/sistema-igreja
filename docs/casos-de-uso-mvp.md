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
| UC-02 | Gerenciar papéis e permissões | Administrador | Papéis semente + personalizados. |
| UC-03 | Convidar usuário e atribuir papel com escopo | Administrador | Escopo = organização ou congregação. O **primeiro** administrador é criado pelo Operador com `pnpm cli create-administrator` (implementado); o convite pela interface virá depois. |
| UC-18 | Trocar a própria senha | Todos | Exige a senha atual; revoga as outras sessões (ADR 0010). |
| UC-04 | Consultar trilha de auditoria | Administrador, Diretoria | Quem fez o quê, quando; filtros por entidade e usuário. |

### Organização
| ID | Caso de uso | Ator | Observações |
|---|---|---|---|
| UC-05 | Cadastrar e editar congregações | Administrador | Endereço e horários de culto; inclui desativar, reativar e designar a sede (ADR 0009). Liderança entra junto com `members`. |
| UC-17 | Criar organização inicial | Operador | Linha de comando; cria a organização e sua sede. Sem endpoint público (ADR 0009). O primeiro administrador é criado por comando equivalente no `identity-access`. |

### Membros
| ID | Caso de uso | Ator | Observações |
|---|---|---|---|
| UC-06 | Cadastrar e editar membro | Secretário, Dirigente | Dados pessoais, cargo/função, foto. |
| UC-07 | Registrar histórico do membro | Secretário, Dirigente | Batismo, recepção, transferência. |
| UC-08 | Anexar documentos ao membro | Secretário, Dirigente | Storage privado; acesso auditado. |
| UC-09 | Listar e buscar membros | Secretário, Dirigente, Diretoria | Resultado filtrado pelo escopo do usuário. |
| UC-10 | Transferir membro entre congregações | Secretário, Dirigente | Gera evento de histórico. |

### Finanças
| ID | Caso de uso | Ator | Observações |
|---|---|---|---|
| UC-11 | Gerenciar contas (caixa e bancos) e categorias | Tesoureiro | Categorias personalizáveis. |
| UC-12 | Registrar entrada | Tesoureiro | Dízimo pode ser vinculado a um membro. |
| UC-13 | Registrar saída | Tesoureiro | Acima do limite, exige aprovação (pós-MVP). |
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

## ⚠ Perguntas para validar com a igreja
1. Quais são os cargos e ministérios reais? E os valores de "situação espiritual"?
2. Quem pode ver a **contribuição individual** de um membro? Só o Tesoureiro? O próprio membro?
3. Qual o **limite** de valor que exige aprovação da Diretoria?
4. O dízimo é sempre identificado por membro, ou também anônimo?
5. Uma saída pode ser paga por uma congregação e aprovada pela sede? Há repasse entre congregação e sede?
6. Os dados atuais estão em planilhas? Será necessário importar?
