import type { RequestContext } from '../../../shared/application/request-context.js';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { PermissionDeniedError } from '../domain/errors.js';
import { UserId } from '../domain/ids.js';
import type { UserRepository } from '../domain/user.repository.js';

export const MAX_DIRECTORY_IDS = 50;

/**
 * Quem pode resolver ids de usuário em nomes, JÁ decidido pela apresentação a partir da política de acesso (ADR 0020):
 * quem enxerga, em outra tela, ids de quem fez ou pediu algo (financeiro, aprovações, trilha) ou administra usuários.
 */
export interface UserDirectoryAccess {
  canResolve(): boolean;
}

/** O mínimo para a tela mostrar "quem": o id, o e-mail (o identificador de login) e se a conta está ativa. */
export interface UserDirectoryEntryView {
  id: string;
  email: string;
  active: boolean;
}

/**
 * Diretório MÍNIMO de usuários (ADR 0020): troca ids por e-mails, só dos ids pedidos e só da igreja de quem pede. As telas
 * do financeiro e da trilha recebem ids ("pedido por 0199…") e precisam mostrar nomes, mas quem lê o financeiro não tem
 * `access:manage-users`, que é quem lista usuários. Aqui não há lista: ninguém "varre" os usuários da igreja, só pergunta
 * por quem já viu num lançamento. Sem papéis, sem senha, sem dado de bloqueio. Id desconhecido ou de outra igreja some
 * da resposta, igual a inexistente.
 */
export class ResolveUserDirectoryUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(
    context: RequestContext,
    access: UserDirectoryAccess,
    query: { ids: readonly string[] },
  ): Promise<UserDirectoryEntryView[]> {
    if (!access.canResolve()) throw new PermissionDeniedError();

    const unique = [...new Set(query.ids)];
    if (unique.length === 0 || unique.length > MAX_DIRECTORY_IDS) {
      throw new ValidationError(
        'ids',
        `Informe de 1 a ${MAX_DIRECTORY_IDS} identificadores.`,
      );
    }

    const found = await this.users.findManyByIds(
      context.organizationId,
      unique.map((id) => UserId.of(id)),
    );
    return found
      .map((user) => ({
        id: user.id,
        email: user.email.value,
        active: user.status === 'ACTIVE',
      }))
      .sort((a, b) => a.email.localeCompare(b.email));
  }
}
