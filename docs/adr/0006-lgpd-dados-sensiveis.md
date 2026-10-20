# ADR 0006 — LGPD e tratamento de dados sensíveis

- **Status:** aceita
- **Data:** 2026-10-19

## Contexto
O sistema trata dados de **convicção religiosa** (situação espiritual, batismo, ministério), que são dados
pessoais sensíveis (LGPD, art. 5º, II), além de documentos pessoais, fotos e histórico de contribuições.

## Decisão
- **Minimização:** só coletar o que o PRD justifica; campos opcionais ficam realmente opcionais.
- **Controle de acesso:** dados sensíveis exigem permissões específicas (ver ADR 0004).
- **Auditoria de leitura:** consultas a dados sensíveis (histórico de contribuição individual, documentos
  anexos) são registradas no `audit_log`, não apenas alterações.
- **Arquivos:** fotos e anexos em storage privado, acessados por URL assinada e de curta duração.
- **Exclusão/anonimização:** membros usam *soft delete*; deve existir procedimento de anonimização para
  atender pedido do titular, preservando a integridade dos lançamentos financeiros.
- **Segurança de credenciais:** senhas com argon2; tokens de acesso curtos; 2FA planejado para perfis financeiros.
- **Backups:** criptografados e com restauração testada periodicamente.
- A base legal e o texto de consentimento/aviso de privacidade devem ser validados com a igreja (e, idealmente, um jurista).

## Consequências
- (+) Reduz risco legal e reputacional.
- (−) Adiciona requisitos transversais (auditoria de leitura, anonimização) que entram no desenho desde o MVP.
