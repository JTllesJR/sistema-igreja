import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { AuditTrailModule } from '../../modules/audit/trail.js';
import { FinanceModule } from '../../modules/finance/index.js';
import { HealthModule } from '../../modules/health/health.module.js';
import {
  type HttpTestApp,
  startHttpTestApp,
} from '../../modules/identity-access/presentation/http/testing/http-test-app.js';
import { MembersModule } from '../../modules/members/index.js';
import { OrganizationModule } from '../../modules/organization/index.js';
import { OpenApiModule } from './openapi.module.js';

const running: HttpTestApp[] = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map((app) => app.close()));
});

/** A aplicação com TODOS os módulos que têm controller (é o que garante que nenhuma rota fica de fora da conferência). */
async function start(enabled: boolean) {
  const app = await startHttpTestApp({
    imports: [
      OrganizationModule,
      MembersModule,
      AuditTrailModule,
      FinanceModule,
      HealthModule,
      OpenApiModule,
    ],
    ...(enabled ? { env: { OPENAPI_ENABLED: 'true' } } : {}),
  });
  running.push(app);
  return app;
}

type Operation = {
  operationId: string;
  summary: string;
  description?: string;
  security: unknown[];
  parameters?: {
    name: string;
    in: string;
    required: boolean;
    schema: Record<string, unknown>;
  }[];
  requestBody?: {
    content: { 'application/json': { schema: Record<string, unknown> } };
  };
  responses: Record<string, { content?: Record<string, unknown> }>;
  'x-required-permission'?: string;
  'x-rate-limit'?: { requests: number; windowSeconds: number };
};
type Document = {
  openapi: string;
  tags: { name: string }[];
  paths: Record<string, Record<string, Operation>>;
  components: {
    securitySchemes: Record<string, unknown>;
    schemas: Record<string, unknown>;
  };
};

async function document(app: HttpTestApp): Promise<Document> {
  const response = await request(app.server).get('/openapi.json');
  expect(response.status).toBe(200);
  return response.body as Document;
}

const operations = (doc: Document) =>
  Object.entries(doc.paths).flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, operation]) => ({
      path,
      method,
      operation,
    })),
  );

/** Quantas rotas existem DE VERDADE no código: cada decorator de verbo nos controllers de negócio. */
function routesInSource(): number {
  const root = join(import.meta.dirname, '..', '..', 'modules');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return files(path);
      return path.endsWith('.controller.ts') ? [path] : [];
    });
  return files(root)
    .map(
      (file) =>
        readFileSync(file, 'utf8').match(/^\s*@(Get|Post|Patch|Put|Delete)\(/gm)
          ?.length ?? 0,
    )
    .reduce((a, b) => a + b, 0);
}

describe('GET /openapi.json', () => {
  it('é um OpenAPI 3.1 que descreve TODAS as rotas existentes no código', async () => {
    const doc = await document(await start(true));

    expect(doc.openapi).toBe('3.1.0');
    // Se alguém criar um controller novo e não o incluir aqui (ou esquecer o @ApiDoc), esta conta (ou o boot) falha.
    expect(operations(doc)).toHaveLength(routesInSource());
    expect(operations(doc).length).toBeGreaterThanOrEqual(52);
  });

  it('toda operação tem resumo e id único; toda resposta de erro aponta para o formato de problema', async () => {
    const doc = await document(await start(true));
    const ops = operations(doc);

    expect(new Set(ops.map((o) => o.operation.operationId)).size).toBe(
      ops.length,
    );
    for (const { path, method, operation } of ops) {
      expect(operation.summary.length, `${method} ${path}`).toBeGreaterThan(5);
      expect(
        Object.keys(operation.responses).some((code) => code.startsWith('2')),
        `${method} ${path}`,
      ).toBe(true);
      expect(operation.responses['429'], `${method} ${path}`).toBeDefined();
    }
    expect(doc.components.schemas['ProblemDetails']).toMatchObject({
      type: 'object',
    });
  });

  it('só as rotas públicas dispensam o token; as demais exigem o Bearer', async () => {
    const doc = await document(await start(true));
    const publics = operations(doc)
      .filter(({ operation }) => operation.security.length === 0)
      .map(({ method, path }) => `${method} ${path}`)
      .sort();

    expect(publics).toEqual([
      'get /health',
      'post /auth/login',
      'post /auth/logout',
      'post /auth/refresh',
    ]);
    for (const { operation } of operations(doc).filter(
      (o) => o.operation.security.length > 0,
    )) {
      expect(operation.security).toEqual([{ bearerAuth: [] }]);
    }
  });

  it('a permissão exigida de cada rota vem do controller, e aparece na descrição', async () => {
    const doc = await document(await start(true));
    const approve = doc.paths['/finance/entries/{id}/approve']?.['post'];
    const categories = doc.paths['/finance/categories']?.['post'];
    const dashboard = doc.paths['/finance/dashboard']?.['get'];

    expect(approve?.['x-required-permission']).toBe('finance:approve');
    expect(approve?.description).toContain('finance:approve');
    expect(categories?.description).toContain('para a igreja toda');
    expect(dashboard?.['x-required-permission']).toBe('finance:read');
  });

  it('a entrada vem dos MESMOS schemas que validam a requisição (corpo, consulta e caminho)', async () => {
    const doc = await document(await start(true));
    const income = doc.paths['/finance/entries/income']?.['post'];
    const incomeBody = income?.requestBody?.content['application/json']
      .schema as {
      required: string[];
      properties: Record<string, Record<string, unknown>>;
    };
    const list = doc.paths['/finance/entries']?.['get'];
    const approve = doc.paths['/finance/entries/{id}/approve']?.['post'];

    expect(incomeBody.required).toEqual(
      expect.arrayContaining([
        'accountId',
        'categoryId',
        'amountCents',
        'occurredOn',
      ]),
    );
    expect(incomeBody.properties['amountCents']).toMatchObject({
      type: 'integer',
      minimum: 1,
      maximum: 10_000_000_000,
    });
    expect(incomeBody.properties['accountId']).toMatchObject({
      type: 'string',
      format: 'uuid',
    });
    expect(incomeBody.properties['accountId']).not.toHaveProperty('pattern');
    const status = list?.parameters?.find((p) => p.name === 'status');
    expect(status).toMatchObject({ in: 'query', required: false });
    expect(status?.schema['enum']).toEqual([
      'PENDING',
      'CONFIRMED',
      'REJECTED',
      'CANCELLED',
    ]);
    expect(approve?.parameters).toEqual([
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      },
    ]);
  });

  it('o código HTTP e o corpo da resposta refletem o que a rota devolve', async () => {
    const doc = await document(await start(true));
    const create = doc.paths['/finance/accounts']?.['post'];
    const approve = doc.paths['/finance/entries/{id}/approve']?.['post'];
    const login = doc.paths['/auth/login']?.['post'];

    expect(Object.keys(create?.responses ?? {})).toContain('201');
    expect(create?.responses['201']?.content).toBeDefined();
    expect(Object.keys(approve?.responses ?? {})).toContain('204');
    expect(approve?.responses['204']?.content).toBeUndefined();
    expect(Object.keys(login?.responses ?? {})).toContain('200');
    expect(login?.['x-rate-limit']).toEqual({
      requests: 10,
      windowSeconds: 60,
    });
  });

  it('não tem dado nenhum de pessoa: é só a descrição da API', async () => {
    const text = JSON.stringify(await document(await start(true)));

    expect(text).not.toMatch(/Bearer ey|senha-super|admin@igreja/);
  });
});

describe('desligada (padrão)', () => {
  it('sem OPENAPI_ENABLED, o documento e a interface respondem 404 como se não existissem', async () => {
    const app = await start(false);

    for (const path of [
      '/openapi.json',
      '/docs',
      '/docs/swagger-ui-bundle.js',
      '/docs/docs-init.js',
    ]) {
      const response = await request(app.server).get(path);
      expect(response.status, path).toBe(404);
      expect(response.body.code, path).toBe('http.404');
    }
  });
});

describe('interface (Swagger UI)', () => {
  it('serve a página e só os arquivos da lista fechada', async () => {
    const app = await start(true);

    const page = await request(app.server).get('/docs');
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    expect(page.text).toContain('/docs/swagger-ui-bundle.js');
    // Nenhum script embutido: a política de segurança do helmet só aceita scripts do próprio site.
    expect(page.text).not.toMatch(/<script>[^<]/);
    expect(page.headers['content-security-policy']).toContain(
      "script-src 'self'",
    );

    for (const file of [
      'swagger-ui.css',
      'swagger-ui-bundle.js',
      'docs-init.js',
    ]) {
      expect(
        (await request(app.server).get(`/docs/${file}`)).status,
        file,
      ).toBe(200);
    }
    // Fora da lista: nada de escolher arquivo (nem tentar sair da pasta).
    for (const file of [
      'package.json',
      '..%2F..%2Fpackage.json',
      'swagger-ui-bundle.js.map',
      'index.html',
    ]) {
      expect(
        (await request(app.server).get(`/docs/${file}`)).status,
        file,
      ).toBe(404);
    }
  });
});
