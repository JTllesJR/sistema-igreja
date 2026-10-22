import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Public, RequirePermission } from '../http/access-control.js';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';
import { ApiDoc } from './api-doc.decorator.js';
import { buildOpenApiDocument } from './build-openapi-document.js';

const info = { title: 'Teste', version: '1', description: 'x' };
const body = z.object({
  name: z.string().min(2),
  age: z.coerce.number().int().min(0),
});
const query = z.object({
  limit: z.coerce.number().int().min(1).optional(),
  tag: z.string(),
});
const out = z.object({ id: z.string() });

@Controller('things')
class Things {
  @RequirePermission('things:write', { organizationWide: true })
  @ApiDoc({ summary: 'Cria uma coisa.', response: out })
  @Post()
  create(@Body(new ZodValidationPipe(body)) _body: unknown) {
    return _body;
  }

  @ApiDoc({ summary: 'Lista as coisas.', response: z.array(out) })
  @Get()
  list(@Query(new ZodValidationPipe(query)) _query: unknown) {
    return _query;
  }

  @ApiDoc({ summary: 'Remove uma coisa.', response: null })
  @HttpCode(204)
  @Post(':id/remove')
  remove() {}

  helper() {
    return 'não é rota';
  }
}

@Public()
@Controller('open')
class Open {
  @ApiDoc({ summary: 'Aberto para todos.', response: out })
  @Get()
  get() {}
}

describe('buildOpenApiDocument', () => {
  const doc = buildOpenApiDocument([Things, Open], info) as {
    paths: Record<string, Record<string, Record<string, unknown>>>;
    tags: { name: string }[];
  };

  it('descobre só os métodos que são rotas, com caminho {param} e verbo certos', () => {
    expect(Object.keys(doc.paths)).toEqual([
      '/open',
      '/things',
      '/things/{id}/remove',
    ]);
    expect(Object.keys(doc.paths['/things'] ?? {}).sort()).toEqual([
      'get',
      'post',
    ]);
    expect(doc.tags.map((t) => t.name)).toEqual(['open', 'things']);
  });

  it('corpo e consulta saem dos schemas dos pipes; o que o cliente manda como texto aparece como entrada', () => {
    const create = doc.paths['/things']?.['post'] as {
      requestBody: {
        content: { 'application/json': { schema: { required: string[] } } };
      };
    };
    const list = doc.paths['/things']?.['get'] as {
      parameters: { name: string; required: boolean }[];
    };

    expect(
      create.requestBody.content['application/json'].schema.required,
    ).toEqual(['name', 'age']);
    expect(list.parameters).toMatchObject([
      { name: 'limit', in: 'query', required: false },
      { name: 'tag', in: 'query', required: true },
    ]);
  });

  it('a permissão do método vira descrição e extensão; o marcador da CLASSE vale como o do guard', () => {
    const create = doc.paths['/things']?.['post'] as Record<string, unknown>;
    const open = doc.paths['/open']?.['get'] as Record<string, unknown>;
    const list = doc.paths['/things']?.['get'] as Record<string, unknown>;

    expect(create['x-required-permission']).toBe('things:write');
    expect(String(create['description'])).toContain('para a igreja toda');
    expect(create['security']).toEqual([{ bearerAuth: [] }]);
    expect(open['security']).toEqual([]);
    expect(list['security']).toEqual([{ bearerAuth: [] }]);
  });

  it('204 não tem corpo; POST sem @HttpCode é 201 e GET é 200', () => {
    const remove = doc.paths['/things/{id}/remove']?.['post'] as {
      responses: Record<string, { content?: unknown }>;
      parameters: unknown[];
    };

    expect(Object.keys(remove.responses)).toContain('204');
    expect(remove.responses['204']?.content).toBeUndefined();
    expect(remove.parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ]);
    const statusesOf = (method: string) => {
      const operation = doc.paths['/things']![method] as { responses: object };
      return Object.keys(operation.responses);
    };
    expect(statusesOf('post')).toContain('201');
    expect(statusesOf('get')).toContain('200');
  });

  it('uma rota SEM @ApiDoc é erro (documentação faltando nunca passa em silêncio)', () => {
    @Controller('sem-doc')
    class Undocumented {
      @Get()
      get() {}
    }

    expect(() => buildOpenApiDocument([Undocumented], info)).toThrow(
      /Undocumented\.get: rota sem @ApiDoc/,
    );
  });

  it('duas rotas com o mesmo verbo e caminho são erro (o documento esconderia uma delas)', () => {
    @Controller('things')
    class Duplicate {
      @ApiDoc({ summary: 'Outra lista de coisas.', response: z.array(out) })
      @Get()
      list() {}
    }

    expect(() => buildOpenApiDocument([Things, Duplicate], info)).toThrow(
      /Duplicate\.list: rota duplicada/,
    );
  });

  it('resposta sem corpo só é válida com HTTP 204', () => {
    @Controller('errada')
    class Wrong {
      @ApiDoc({ summary: 'Resposta vazia com 200.', response: null })
      @Get()
      get() {}
    }

    expect(() => buildOpenApiDocument([Wrong], info)).toThrow(
      /só é válida com HTTP 204/,
    );
  });
});
