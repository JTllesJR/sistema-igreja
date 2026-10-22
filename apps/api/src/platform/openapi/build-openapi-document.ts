import 'reflect-metadata';
import type { Type } from '@nestjs/common';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants.js';
import { problemDetailsSchema } from '@igreja/contracts';
import { z, type ZodType } from 'zod';
import {
  ALLOW_PASSWORD_CHANGE_PENDING_KEY,
  IS_PUBLIC_KEY,
  type PermissionRequirement,
  REQUIRED_PERMISSION_KEY,
} from '../http/access-control.js';
import { ZodValidationPipe } from '../http/zod-validation.pipe.js';
import { API_DOC_KEY, type ApiDocOptions } from './api-doc.decorator.js';

type Json = Record<string, unknown>;

/** Tipos de parâmetro do Nest (`RouteParamtypes`): números estáveis da API pública de decorators. */
const BODY = 3;
const QUERY = 4;
const PARAM = 5;

/** Valores de `RequestMethod` do Nest para os verbos que a API usa. */
const METHODS: Readonly<Record<number, string>> = {
  0: 'get',
  1: 'post',
  2: 'put',
  3: 'delete',
  4: 'patch',
};

/** Chaves do `@nestjs/throttler` para o limite por rota (`@Throttle({ default: ... })`). */
const THROTTLE_LIMIT = 'THROTTLER:LIMITdefault';
const THROTTLE_TTL = 'THROTTLER:TTLdefault';

const TAG_DESCRIPTIONS: Readonly<Record<string, string>> = {
  auth: 'Entrar, sair, renovar a sessão e trocar a própria senha.',
  health: 'Saúde da API e do banco (aberto, para monitoramento).',
  organization: 'A igreja (organização).',
  congregations: 'Congregações: cadastro, desativação e sede.',
  users: 'Usuários, papéis atribuídos e senha temporária.',
  roles: 'Papéis padrão da igreja e suas permissões.',
  members: 'Membros (DADO SENSÍVEL): leituras são auditadas.',
  finance:
    'Financeiro: contas, lançamentos imutáveis, aprovação da sede, repasse, estorno e painéis.',
};

export interface OpenApiInfo {
  title: string;
  version: string;
  description: string;
}

/**
 * Monta o documento OpenAPI 3.1 a partir dos controllers REAIS (ADR 0016): caminho, verbo, permissão, rota pública,
 * código HTTP e schemas de entrada (lidos dos `ZodValidationPipe`) saem dos metadados do Nest, então não existe uma
 * descrição paralela que possa ficar desatualizada. Só o resumo e o schema da resposta vêm de `@ApiDoc`.
 *
 * Falha alto (lança) se uma rota estiver sem `@ApiDoc`: documentação faltando é erro, não lacuna silenciosa.
 */
export function buildOpenApiDocument(
  controllers: readonly Type<unknown>[],
  info: OpenApiInfo,
): Json {
  const paths: Record<string, Record<string, Json>> = {};
  const tags = new Set<string>();

  for (const controller of controllers) {
    const prefix = pathOf(Reflect.getMetadata(PATH_METADATA, controller));
    const proto = controller.prototype as Record<string, unknown>;

    for (const name of Object.getOwnPropertyNames(proto)) {
      const handler = proto[name];
      if (typeof handler !== 'function') continue;
      const verb = Reflect.getMetadata(METHOD_METADATA, handler) as
        number | undefined;
      if (verb === undefined) continue; // método comum, não é rota

      const label = `${controller.name}.${name}`;
      const method = METHODS[verb];
      if (!method) throw new Error(`${label}: verbo HTTP sem suporte.`);

      const route = `/${[
        prefix,
        pathOf(Reflect.getMetadata(PATH_METADATA, handler)),
      ]
        .filter((part) => part !== '')
        .join('/')}`.replace(/:(\w+)/g, '{$1}');
      const tag = prefix.split('/')[0] ?? 'api';
      tags.add(tag);

      const operation = buildOperation(
        controller,
        name,
        handler,
        method,
        route,
        {
          tag,
          label,
        },
      );
      const atPath = (paths[route] ??= {});
      if (atPath[method]) throw new Error(`${label}: rota duplicada.`);
      atPath[method] = operation;
    }
  }

  return {
    openapi: '3.1.0',
    info,
    servers: [{ url: '/' }],
    tags: [...tags].sort().map((name) => ({
      name,
      ...(TAG_DESCRIPTIONS[name]
        ? { description: TAG_DESCRIPTIONS[name] }
        : {}),
    })),
    paths: Object.fromEntries(
      Object.entries(paths).sort(([a], [b]) => a.localeCompare(b)),
    ),
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Token de acesso devolvido por `POST /auth/login` (vale poucos minutos; renove com `POST /auth/refresh`).',
        },
      },
      schemas: { ProblemDetails: jsonSchema(problemDetailsSchema, 'output') },
    },
  };
}

function buildOperation(
  controller: Type<unknown>,
  name: string,
  handler: unknown,
  method: string,
  route: string,
  { tag, label }: { tag: string; label: string },
): Json {
  const doc = Reflect.getMetadata(API_DOC_KEY, handler as object) as
    ApiDocOptions | undefined;
  if (!doc) {
    throw new Error(
      `${label}: rota sem @ApiDoc. Toda rota precisa de resumo e do schema da resposta (ADR 0016).`,
    );
  }

  // Como o guard global: o marcador do MÉTODO vale; na falta dele, o da CLASSE (ex.: `@Public()` no controller inteiro).
  const marker = <T>(key: string): T | undefined =>
    (Reflect.getMetadata(key, handler as object) as T | undefined) ??
    (Reflect.getMetadata(key, controller) as T | undefined);
  const isPublic = marker<boolean>(IS_PUBLIC_KEY) === true;
  const permission = marker<PermissionRequirement>(REQUIRED_PERMISSION_KEY);
  const allowsPendingPassword =
    marker<boolean>(ALLOW_PASSWORD_CHANGE_PENDING_KEY) === true;
  const status =
    (Reflect.getMetadata(HTTP_CODE_METADATA, handler as object) as
      number | undefined) ?? (method === 'post' ? 201 : 200);

  // Entrada: lida dos MESMOS pipes que validam a requisição.
  const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, name) ??
    {}) as Record<string, { data?: unknown; pipes?: unknown[] }>;
  const parameters: Json[] = [];
  let requestBody: Json | undefined;
  const seenPathParams = new Set<string>();

  for (const [key, arg] of Object.entries(args)) {
    const type = Number(key.split(':')[0]);
    const schema = arg.pipes
      ?.filter(
        (pipe): pipe is ZodValidationPipe<unknown> =>
          pipe instanceof ZodValidationPipe,
      )
      .at(0)?.schema;

    if (type === BODY && schema) {
      requestBody = {
        required: true,
        content: {
          'application/json': { schema: jsonSchema(schema, 'input') },
        },
      };
    } else if (type === QUERY && schema) {
      const object = jsonSchema(schema, 'input');
      const required = new Set(
        (object['required'] as string[] | undefined) ?? [],
      );
      for (const [param, value] of Object.entries(
        (object['properties'] as Record<string, Json> | undefined) ?? {},
      )) {
        parameters.push({
          name: param,
          in: 'query',
          required: required.has(param),
          schema: value,
        });
      }
    } else if (type === PARAM && typeof arg.data === 'string') {
      seenPathParams.add(arg.data);
      parameters.push({
        name: arg.data,
        in: 'path',
        required: true,
        schema: schema ? jsonSchema(schema, 'input') : { type: 'string' },
      });
    }
  }
  for (const match of route.matchAll(/\{(\w+)\}/g)) {
    const param = match[1] as string;
    if (!seenPathParams.has(param)) {
      parameters.push({
        name: param,
        in: 'path',
        required: true,
        schema: { type: 'string' },
      });
    }
  }

  if (doc.response === null && status !== 204) {
    throw new Error(`${label}: resposta sem corpo só é válida com HTTP 204.`);
  }
  const responses: Record<string, Json> = {
    [status]:
      doc.response === null
        ? { description: 'Sem conteúdo.' }
        : {
            description: 'Sucesso.',
            content: {
              'application/json': {
                schema: jsonSchema(doc.response, 'output'),
              },
            },
          },
  };
  const hasInput = requestBody !== undefined || parameters.length > 0;
  const errors: [number, string][] = [
    ...(hasInput ? ([[400, 'Entrada inválida.']] as [number, string][]) : []),
    ...(isPublic
      ? []
      : ([[401, 'Sem login ou token inválido.']] as [number, string][])),
    ...(permission || !isPublic
      ? ([[403, 'Sem permissão para esta ação.']] as [number, string][])
      : []),
    ...(route.includes('{')
      ? ([[404, 'Não encontrado (ou fora do seu escopo).']] as [
          number,
          string,
        ][])
      : []),
    ...(method === 'get'
      ? []
      : ([
          [409, 'Conflito com o estado atual.'],
          [422, 'Regra do sistema recusou o pedido.'],
        ] as [number, string][])),
    [429, 'Limite de requisições excedido.'],
  ];
  for (const [code, description] of errors) {
    responses[code] = {
      description,
      content: {
        'application/problem+json': {
          schema: { $ref: '#/components/schemas/ProblemDetails' },
        },
      },
    };
  }

  const notes = [
    doc.description,
    permission
      ? `Exige a permissão \`${permission.permission}\`${permission.organizationWide ? ' para a igreja toda' : ' (o escopo de congregações do usuário limita o resultado)'}.`
      : undefined,
    allowsPendingPassword
      ? 'Disponível mesmo quando a troca de senha ainda está pendente.'
      : undefined,
  ].filter((part): part is string => part !== undefined);

  const limit = Reflect.getMetadata(THROTTLE_LIMIT, handler as object) as
    number | undefined;
  const ttl = Reflect.getMetadata(THROTTLE_TTL, handler as object) as
    number | undefined;

  return {
    operationId: `${controller.name}_${name}`,
    tags: [tag],
    summary: doc.summary,
    ...(notes.length > 0 ? { description: notes.join('\n\n') } : {}),
    ...(isPublic ? { security: [] } : { security: [{ bearerAuth: [] }] }),
    ...(permission ? { 'x-required-permission': permission.permission } : {}),
    ...(limit !== undefined && ttl !== undefined
      ? { 'x-rate-limit': { requests: limit, windowSeconds: ttl / 1000 } }
      : {}),
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(requestBody ? { requestBody } : {}),
    responses,
  };
}

/** `'auth'`, `'/'` ou `undefined` -> segmento sem barras nas pontas. */
function pathOf(raw: unknown): string {
  const value = Array.isArray(raw)
    ? (raw[0] as string)
    : (raw as string | undefined);
  return (value ?? '').replace(/^\/+|\/+$/g, '');
}

/**
 * Schema Zod -> JSON Schema (draft 2020-12, o dialeto do OpenAPI 3.1). `input` para o que o cliente ENVIA (a conversão
 * de texto da URL em número aparece como o texto que o cliente manda); `output` para o que a API devolve. O que o JSON
 * Schema não representa vira "qualquer valor" em vez de quebrar.
 */
function jsonSchema(schema: ZodType, io: 'input' | 'output'): Json {
  const result = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io,
    unrepresentable: 'any',
  }) as Json;
  delete result['$schema'];
  return tidy(result) as Json;
}

/** O `pattern` de UUID do Zod é enorme e repete o que `format: uuid` já diz: sai, para a documentação ficar legível. */
function tidy(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(tidy);
  if (node === null || typeof node !== 'object') return node;
  const copy: Json = {};
  for (const [key, value] of Object.entries(node as Json)) {
    copy[key] = tidy(value);
  }
  if (copy['format'] === 'uuid') delete copy['pattern'];
  return copy;
}
