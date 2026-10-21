/** Tokens de injeção das portas (interfaces não existem em execução; o Nest precisa de um identificador). */
export const ORGANIZATION_REPOSITORY = Symbol('OrganizationRepository');
export const ID_GENERATOR = Symbol('IdGenerator');
/** API pública de consulta do módulo, para uso dos outros módulos (ADR 0009, seção 8). */
export const ORGANIZATION_QUERIES = Symbol('OrganizationQueries');
