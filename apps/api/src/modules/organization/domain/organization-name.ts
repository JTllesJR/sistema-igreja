import { ValidationError } from '../../../shared/domain/domain-error.js';
import { collapseWhitespace } from '../../../shared/domain/text.js';

/** Nome da igreja. Todo `OrganizationName` existente já é válido: não há como criá-lo de outro jeito. */
export class OrganizationName {
  static readonly MIN_LENGTH = 2;
  static readonly MAX_LENGTH = 120;

  private constructor(readonly value: string) {}

  static create(raw: string): OrganizationName {
    const value = collapseWhitespace(raw);

    if (
      value.length < OrganizationName.MIN_LENGTH ||
      value.length > OrganizationName.MAX_LENGTH
    ) {
      throw new ValidationError(
        'name',
        `O nome da igreja deve ter entre ${OrganizationName.MIN_LENGTH} e ${OrganizationName.MAX_LENGTH} caracteres.`,
      );
    }

    return new OrganizationName(value);
  }

  equals(other: OrganizationName): boolean {
    return this.value === other.value;
  }
}
