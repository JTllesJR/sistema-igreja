import { ValidationError } from '../../../shared/domain/domain-error.js';

// "modulo:ação" em minúsculas (ex.: finance:approve) ou "*" (tudo).
const FORMAT = /^(\*|[a-z][a-z0-9-]*:[a-z][a-z0-9-]*)$/;

/**
 * Direito de executar uma ação em um módulo (ADR 0004). O módulo identity-access não mantém um catálogo das
 * permissões dos outros módulos: cada módulo define as suas, e aqui só se valida o formato.
 */
export class Permission {
  /** Curinga: concede qualquer permissão, inclusive as que ainda não existem. Usado pelo papel Administrador. */
  static readonly ALL = new Permission('*');

  private constructor(readonly value: string) {}

  static of(raw: string): Permission {
    if (!FORMAT.test(raw)) {
      throw new ValidationError(
        'permission',
        'A permissão deve ter a forma "modulo:acao" ou "*".',
      );
    }
    return raw === '*' ? Permission.ALL : new Permission(raw);
  }

  /** Esta permissão (concedida) satisfaz a permissão exigida? O curinga satisfaz qualquer uma. */
  covers(required: Permission): boolean {
    return this.value === '*' || this.value === required.value;
  }
}
