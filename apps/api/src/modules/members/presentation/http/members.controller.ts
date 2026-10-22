import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type ChangeMemberStatusRequest,
  changeMemberStatusRequestSchema,
  type ListMembersQuery,
  listMembersQuerySchema,
  type MemberCreated,
  type MemberDetail,
  type MemberListResponse,
  type RecordMemberEventRequest,
  recordMemberEventRequestSchema,
  type RegisterMemberRequest,
  registerMemberRequestSchema,
  type TransferMemberRequest,
  transferMemberRequestSchema,
  type UpdateMemberRequest,
  updateMemberRequestSchema,
  memberCreatedSchema,
  memberDetailSchema,
  memberListResponseSchema,
} from '@igreja/contracts';
import { z } from 'zod';
import {
  CurrentContext,
  RequirePermission,
} from '../../../../platform/http/access-control.js';
import { ZodValidationPipe } from '../../../../platform/http/zod-validation.pipe.js';
import type { RequestContext } from '../../../../shared/application/request-context.js';
// Só a API pública do módulo `identity-access` (ADR 0001).
import {
  type AccessPolicy,
  CurrentPolicy,
} from '../../../identity-access/index.js';
import { AnonymizeMemberUseCase } from '../../application/anonymize-member.use-case.js';
import { ChangeMemberStatusUseCase } from '../../application/change-member-status.use-case.js';
import { GetMemberUseCase } from '../../application/get-member.use-case.js';
import { ListMembersUseCase } from '../../application/list-members.use-case.js';
import { RecordMemberEventUseCase } from '../../application/record-member-event.use-case.js';
import { RegisterMemberUseCase } from '../../application/register-member.use-case.js';
import { TransferMemberUseCase } from '../../application/transfer-member.use-case.js';
import { UpdateMemberUseCase } from '../../application/update-member.use-case.js';
import type { MemberDetailView } from '../../application/views.js';
import {
  MEMBERS_ANONYMIZE,
  MEMBERS_READ,
  MEMBERS_WRITE,
} from '../../members.permissions.js';
import { memberAccessFrom } from './member-access.factory.js';
import { ApiDoc } from '../../../../platform/openapi/api-doc.decorator.js';

const idPipe = new ZodValidationPipe(z.uuid());

// Contra raspagem de dados: quem lê muito e rápido é suspeito. Limite por IP e por rota, além do global (ADR 0011).
const MINUTE_MS = 60_000;
const READ_LIMIT = { default: { limit: 60, ttl: MINUTE_MS } };

const ORGANIZATION_WIDE = { organizationWide: true };

/**
 * Adaptador HTTP dos membros (UC-06 a UC-10). DADOS SENSÍVEIS (ADR 0006, 0013). A igreja vem do token; o escopo de
 * congregações vem da política do usuário (`memberAccessFrom`) e chega até a consulta ao banco. Membro que o usuário não
 * pode ver responde 404, igual a um inexistente.
 */
@Controller('members')
export class MembersController {
  constructor(
    @Inject(ListMembersUseCase)
    private readonly listMembers: ListMembersUseCase,
    @Inject(GetMemberUseCase) private readonly getMember: GetMemberUseCase,
    @Inject(RegisterMemberUseCase)
    private readonly registerMember: RegisterMemberUseCase,
    @Inject(UpdateMemberUseCase)
    private readonly updateMember: UpdateMemberUseCase,
    @Inject(ChangeMemberStatusUseCase)
    private readonly changeStatus: ChangeMemberStatusUseCase,
    @Inject(TransferMemberUseCase)
    private readonly transferMember: TransferMemberUseCase,
    @Inject(RecordMemberEventUseCase)
    private readonly recordEvent: RecordMemberEventUseCase,
    @Inject(AnonymizeMemberUseCase)
    private readonly anonymizeMember: AnonymizeMemberUseCase,
  ) {}

  @RequirePermission(MEMBERS_READ)
  @Throttle(READ_LIMIT)
  @ApiDoc({
    summary: 'Lista e busca membros das congregações que o usuário vê.',
    description:
      'Registra a leitura na trilha de auditoria antes de devolver (sem o termo buscado).',
    response: memberListResponseSchema,
  })
  @Get()
  async list(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Query(new ZodValidationPipe(listMembersQuerySchema))
    query: ListMembersQuery,
  ): Promise<MemberListResponse> {
    return this.listMembers.execute(context, memberAccessFrom(policy), query);
  }

  @RequirePermission(MEMBERS_WRITE)
  @ApiDoc({
    summary: 'Cadastra um membro.',
    response: memberCreatedSchema,
  })
  @Post()
  create(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Body(new ZodValidationPipe(registerMemberRequestSchema))
    body: RegisterMemberRequest,
  ): Promise<MemberCreated> {
    return this.registerMember.execute(context, memberAccessFrom(policy), body);
  }

  // Ficha completa: leitura auditada, com limite mais apertado.
  @RequirePermission(MEMBERS_READ)
  @Throttle(READ_LIMIT)
  @ApiDoc({
    summary: 'Devolve a ficha completa do membro.',
    description:
      'DADO SENSÍVEL: a leitura é registrada na trilha ANTES de devolver; se o registro falhar, a ficha não sai.',
    response: memberDetailSchema,
  })
  @Get(':id')
  async detail(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Param('id', idPipe) id: string,
  ): Promise<MemberDetail> {
    const view = await this.getMember.execute(
      context,
      memberAccessFrom(policy),
      {
        memberId: id,
      },
    );
    return toDetail(view);
  }

  @RequirePermission(MEMBERS_WRITE)
  @ApiDoc({
    summary: 'Altera o cadastro do membro (nome, contato, endereço, cargo).',
    description: 'Situação e congregação têm rotas próprias.',
    response: null,
  })
  @Patch(':id')
  @HttpCode(204)
  async update(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(updateMemberRequestSchema))
    body: UpdateMemberRequest,
  ): Promise<void> {
    await this.updateMember.execute(context, memberAccessFrom(policy), {
      ...body,
      memberId: id,
    });
  }

  // Situação e transferência NÃO passam pelo PATCH: cada uma tem regra, evento de história e auditoria próprios.
  @RequirePermission(MEMBERS_WRITE)
  @ApiDoc({
    summary: 'Muda a situação do membro (ativo, afastado...).',
    description: 'Gera um evento na história do membro.',
    response: null,
  })
  @Post(':id/status')
  @HttpCode(204)
  async status(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(changeMemberStatusRequestSchema))
    body: ChangeMemberStatusRequest,
  ): Promise<void> {
    await this.changeStatus.execute(context, memberAccessFrom(policy), {
      memberId: id,
      status: body.status,
    });
  }

  @RequirePermission(MEMBERS_WRITE)
  @ApiDoc({
    summary: 'Transfere o membro para outra congregação.',
    description: 'Gera um evento na história do membro.',
    response: null,
  })
  @Post(':id/transfer')
  @HttpCode(204)
  async transfer(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(transferMemberRequestSchema))
    body: TransferMemberRequest,
  ): Promise<void> {
    await this.transferMember.execute(context, memberAccessFrom(policy), {
      memberId: id,
      congregationId: body.congregationId,
    });
  }

  @RequirePermission(MEMBERS_WRITE)
  @ApiDoc({
    summary: 'Registra um fato na história do membro (batismo, recepção).',
    response: null,
  })
  @Post(':id/history')
  @HttpCode(204)
  async history(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(recordMemberEventRequestSchema))
    body: RecordMemberEventRequest,
  ): Promise<void> {
    await this.recordEvent.execute(context, memberAccessFrom(policy), {
      ...body,
      memberId: id,
    });
  }

  // IRREVERSÍVEL: só quem tem a permissão para a igreja toda (o guard confere antes de qualquer coisa).
  @RequirePermission(MEMBERS_ANONYMIZE, ORGANIZATION_WIDE)
  @ApiDoc({
    summary: 'Anonimiza o membro (LGPD).',
    description:
      'IRREVERSÍVEL: apaga os dados pessoais e mantém a linha, a congregação, a situação e a história.',
    response: null,
  })
  @Post(':id/anonymize')
  @HttpCode(204)
  async anonymize(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Param('id', idPipe) id: string,
  ): Promise<void> {
    await this.anonymizeMember.execute(context, memberAccessFrom(policy), {
      memberId: id,
    });
  }
}

/** A visão da aplicação guarda instantes como `Date`; o contrato da API os leva como texto ISO 8601. */
function toDetail(view: MemberDetailView): MemberDetail {
  return {
    ...view,
    history: view.history.map((event) => ({
      ...event,
      recordedAt: event.recordedAt.toISOString(),
    })),
  };
}
