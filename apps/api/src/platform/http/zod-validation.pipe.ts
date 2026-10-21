import type { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { RequestValidationError } from './request-validation.error.js';

/**
 * Valida (e converte) a entrada com um schema Zod do pacote `contracts`: o mesmo schema vale no servidor e no cliente.
 * Uso: `@Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest`.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    // Só caminho e mensagem: o valor recebido (que pode ser uma senha) nunca volta na resposta nem vai para o log.
    throw new RequestValidationError(
      result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    );
  }
}
