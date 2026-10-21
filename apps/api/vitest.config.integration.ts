import { defineConfig } from 'vitest/config';
import { loadRootEnv } from './load-root-env.js';

// Testes de integração: sobem a aplicação Nest de verdade contra um PostgreSQL real.
// Ficam em test/ (*.integration-spec.ts) e exigem um banco dedicado a testes.
loadRootEnv();

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
if (!testDatabaseUrl) {
  throw new Error(
    'Defina TEST_DATABASE_URL (veja .env.example). Testes de integração usam um banco separado.',
  );
}

// Trava de segurança: testes futuros vão limpar tabelas. Nunca permitir apontar para um banco com dados reais.
const databaseName = new URL(testDatabaseUrl).pathname.slice(1);
if (!databaseName.endsWith('_test')) {
  throw new Error(
    `TEST_DATABASE_URL aponta para "${databaseName}". O nome do banco de testes deve terminar em "_test".`,
  );
}

export default defineConfig({
  test: {
    include: ['test/**/*.integration-spec.ts'],
    // Aplica as migrations no banco de testes antes de tudo.
    globalSetup: ['./test/global-setup.ts'],
    // Um único banco compartilhado: arquivos de teste executam em sequência.
    fileParallelism: false,
    testTimeout: 15_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      // Segredo FIXO e só de teste (nunca use em outro lugar): torna o ambiente de teste e o CI independentes do .env.
      JWT_SECRET: 'segredo-somente-para-testes-de-integracao-0123456789',
    },
  },
});
