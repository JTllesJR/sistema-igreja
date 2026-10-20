import { execSync } from 'node:child_process';

/**
 * Roda uma vez antes de todos os testes de integração: aplica as migrations versionadas no banco de testes.
 *
 * É o mesmo comando usado em produção (`prisma migrate deploy`). Fazer isso aqui, e não à mão, garante que
 * local e CI exercitem exatamente o mesmo caminho e que o schema nunca fique defasado em relação ao código.
 * É idempotente: sem migration pendente, não faz nada.
 */
export default function setup(): void {
  const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL não definida.');
  }

  execSync('pnpm exec prisma migrate deploy', {
    // vitest.config.integration.ts já validou que o nome do banco termina em "_test".
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: 'inherit',
    // pnpm é um .cmd no Windows; o shell resolve isso. O comando é fixo (sem entrada externa).
    shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
  });
}
