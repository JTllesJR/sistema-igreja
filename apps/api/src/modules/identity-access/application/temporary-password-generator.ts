/**
 * Porta que gera a senha temporária de um usuário novo ou redefinido (ADR 0014). A implementação usa um gerador
 * criptograficamente seguro; nos testes entra um fake previsível.
 */
export interface TemporaryPasswordGenerator {
  generate(): string;
}
