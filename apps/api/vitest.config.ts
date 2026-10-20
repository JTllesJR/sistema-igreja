import { defineConfig } from 'vitest/config';

// Testes unitários: rápidos, sem rede e sem banco. Ficam ao lado do código (*.spec.ts).
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    // Folga para a primeira execução (cache frio carrega muitos módulos ESM do Nest); testes normais levam ms.
    testTimeout: 15_000,
  },
});
