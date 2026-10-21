import { ValidationError } from '../../../shared/domain/domain-error.js';
import {
  collapseWhitespace,
  optionalText,
} from '../../../shared/domain/text.js';

const STATES = new Set([
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
]);

const POSTAL_CODE = /^\d{5}-?\d{3}$/;

/** Dados de entrada: aceita o texto "como o usuário digitou". */
export interface AddressInput {
  street: string;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city: string;
  state: string;
  postalCode?: string | null;
}

/** Forma "achatada" para persistência (JSONB) e para a API: só tipos simples. */
export interface AddressPrimitives {
  street: string;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string;
  state: string;
  postalCode: string | null;
}

/** Endereço de uma congregação. Imutável e comparado por valor. */
export class Address {
  private constructor(private readonly data: AddressPrimitives) {}

  static create(input: AddressInput): Address {
    const street = collapseWhitespace(input.street);
    if (street === '') {
      throw new ValidationError('street', 'A rua é obrigatória.');
    }

    const city = collapseWhitespace(input.city);
    if (city === '') {
      throw new ValidationError('city', 'A cidade é obrigatória.');
    }

    const state = input.state.trim().toUpperCase();
    if (!STATES.has(state)) {
      throw new ValidationError('state', 'A UF informada não existe.');
    }

    const rawPostalCode = optionalText(input.postalCode);
    if (rawPostalCode !== null && !POSTAL_CODE.test(rawPostalCode)) {
      throw new ValidationError('postalCode', 'O CEP deve ter 8 dígitos.');
    }

    return new Address({
      street,
      number: optionalText(input.number),
      complement: optionalText(input.complement),
      district: optionalText(input.district),
      city,
      state,
      postalCode:
        rawPostalCode === null ? null : rawPostalCode.replace('-', ''),
    });
  }

  /** Reconstrói a partir do que foi gravado. Revalida: dado corrompido no banco aparece como erro, não passa em silêncio. */
  static fromPrimitives(primitives: AddressPrimitives): Address {
    return Address.create(primitives);
  }

  toPrimitives(): AddressPrimitives {
    return { ...this.data };
  }

  equals(other: Address): boolean {
    return (
      JSON.stringify(this.toPrimitives()) ===
      JSON.stringify(other.toPrimitives())
    );
  }
}
