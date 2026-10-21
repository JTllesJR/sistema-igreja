import { ValidationError } from '../../../shared/domain/domain-error.js';
import { collapseWhitespace } from '../../../shared/domain/text.js';

export class RoleName {
  static readonly MIN_LENGTH = 2;
  static readonly MAX_LENGTH = 60;

  private constructor(readonly value: string) {}

  static create(raw: string): RoleName {
    const value = collapseWhitespace(raw);

    if (
      value.length < RoleName.MIN_LENGTH ||
      value.length > RoleName.MAX_LENGTH
    ) {
      throw new ValidationError(
        'name',
        `O nome do papel deve ter entre ${RoleName.MIN_LENGTH} e ${RoleName.MAX_LENGTH} caracteres.`,
      );
    }
    return new RoleName(value);
  }
}
