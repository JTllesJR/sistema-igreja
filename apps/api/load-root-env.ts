import { fileURLToPath } from 'node:url';

/**
 * Carrega o .env da raiz do monorepo, se existir, usando o carregador nativo do Node (sem dependência extra).
 * Usado por ferramentas de desenvolvimento (Prisma CLI, Vitest). Em CI/produção as variáveis já vêm do
 * ambiente e o arquivo não existe, o que é esperado. Variáveis já definidas no ambiente têm precedência.
 */
export function loadRootEnv(): void {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
