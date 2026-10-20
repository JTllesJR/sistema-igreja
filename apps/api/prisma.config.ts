import { defineConfig } from 'prisma/config';
import { loadRootEnv } from './load-root-env.js';

// O Prisma CLI não carrega .env sozinho.
loadRootEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Sem env() de propósito: `prisma generate` não precisa de banco e roda no CI sem DATABASE_URL.
    url: process.env['DATABASE_URL'],
  },
});
