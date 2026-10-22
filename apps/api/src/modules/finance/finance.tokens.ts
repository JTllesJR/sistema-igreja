/** Tokens de injeção das portas (interfaces não existem em execução; o Nest precisa de um identificador). */
export const ACCOUNT_REPOSITORY = Symbol('FinanceAccountRepository');
export const CATEGORY_REPOSITORY = Symbol('FinanceCategoryRepository');
export const ENTRY_REPOSITORY = Symbol('FinanceEntryRepository');
export const CONGREGATION_DIRECTORY = Symbol('FinanceCongregationDirectory');
export const MEMBER_DIRECTORY = Symbol('FinanceMemberDirectory');
export const ID_GENERATOR = Symbol('FinanceIdGenerator');
export const CLOCK = Symbol('FinanceClock');
