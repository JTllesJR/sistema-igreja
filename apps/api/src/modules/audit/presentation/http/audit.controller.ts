import { Controller, Get, Inject, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type AuditPage,
  auditPageSchema,
  type ListAuditQuery,
  listAuditQuerySchema,
} from '@igreja/contracts';
import {
  CurrentContext,
  RequirePermission,
} from '../../../../platform/http/access-control.js';
import { ZodValidationPipe } from '../../../../platform/http/zod-validation.pipe.js';
import { ApiDoc } from '../../../../platform/openapi/api-doc.decorator.js';
import type { RequestContext } from '../../../../shared/application/request-context.js';
// Só a API pública do módulo `identity-access` (ADR 0001).
import {
  type AccessPolicy,
  CurrentPolicy,
} from '../../../identity-access/index.js';
import { QueryAuditTrailUseCase } from '../../application/query-audit-trail.use-case.js';
import { AUDIT_READ } from '../../audit.permissions.js';
import { auditAccessFrom } from './audit-access.factory.js';

// A trilha mostra quem leu o quê: limite de leitura mais apertado, além do global (ADR 0011).
const AUDIT_READ_LIMIT = { default: { limit: 30, ttl: 60_000 } };

/**
 * Adaptador HTTP da consulta à trilha de auditoria (UC-04, ADR 0017). Só a igreja toda com `audit:read` (o guard confere
 * antes de qualquer coisa, e o caso de uso confere de novo). A igreja vem do token, nunca da requisição.
 */
@Controller('audit')
export class AuditController {
  constructor(
    @Inject(QueryAuditTrailUseCase)
    private readonly queryTrail: QueryAuditTrailUseCase,
  ) {}

  @RequirePermission(AUDIT_READ, { organizationWide: true })
  @Throttle(AUDIT_READ_LIMIT)
  @ApiDoc({
    summary: 'Consulta a trilha de auditoria (quem fez o quê, quando).',
    description:
      'Do mais recente para o mais antigo, com filtros por quem fez, dado afetado, ação, módulo e período. Página por ' +
      'cursor: repita a chamada com o `nextCursor` devolvido. A trilha nunca guarda dado pessoal, mas mostra quem leu o ' +
      'quê; por isso a PRÓPRIA consulta é registrada (só os nomes dos filtros) antes de devolver.',
    response: auditPageSchema,
  })
  @Get()
  list(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Query(new ZodValidationPipe(listAuditQuerySchema)) query: ListAuditQuery,
  ): Promise<AuditPage> {
    return this.queryTrail.execute(context, auditAccessFrom(policy), query);
  }
}
