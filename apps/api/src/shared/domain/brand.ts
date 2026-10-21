/**
 * "Marca" um tipo para o compilador distinguir valores que, em tempo de execução, são o mesmo `string`.
 * Evita passar um `OrganizationId` onde se espera um `CongregationId`, erro fácil e grave em um sistema multi-igreja.
 * A marca existe só no sistema de tipos: não há custo nem campo extra em execução.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };
