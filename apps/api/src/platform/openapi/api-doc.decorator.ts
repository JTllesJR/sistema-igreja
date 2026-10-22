import { SetMetadata } from '@nestjs/common';
import type { ZodType } from 'zod';

export const API_DOC_KEY = 'openapi:doc';

export interface ApiDocOptions {
  /** Uma frase, no imperativo ou em terceira pessoa: "Lista as contas...". Aparece como título da operação. */
  summary: string;
  /** Detalhes que não cabem no resumo (regras, efeitos colaterais). Opcional. */
  description?: string;
  /**
   * Schema Zod do corpo da resposta (o MESMO do pacote `contracts`). `null` = a resposta não tem corpo (204).
   * Obrigatório de propósito: o TypeScript apaga o tipo de retorno, então a documentação não consegue descobri-lo.
   */
  response: ZodType | null;
}

/**
 * Documenta uma rota no OpenAPI (ADR 0016). O resto vem do próprio controller: caminho, método, permissão exigida,
 * rota pública, código HTTP e os schemas de entrada (lidos dos `ZodValidationPipe`). Toda rota precisa de um `@ApiDoc`:
 * o teste de documentação falha se alguma ficar sem.
 */
export const ApiDoc = (options: ApiDocOptions) =>
  SetMetadata(API_DOC_KEY, options);
