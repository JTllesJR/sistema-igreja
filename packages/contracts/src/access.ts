import { z } from 'zod';

/**
 * Contratos de papéis e usuários (módulo `identity-access`, ADR 0014).
 * O login e o usuário atual ficam em `auth.ts`.
 */

/** Um papel da igreja. `permissions` são textos `modulo:acao` (ou `*`, que concede tudo), em ordem alfabética. */
export const roleSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** Papel de sistema: não pode ser editado nem excluído. */
  isSystem: z.boolean(),
  permissions: z.array(z.string()),
});
export type Role = z.infer<typeof roleSchema>;
