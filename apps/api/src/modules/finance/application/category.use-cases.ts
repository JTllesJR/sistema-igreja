import type { AuditLog } from '../../../shared/application/audit-log.js';
import type { IdGenerator } from '../../../shared/application/id-generator.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { comparisonKey } from '../../../shared/domain/text.js';
import {
  CategoryNameTakenError,
  CategoryNotFoundError,
  FinanceAccessDeniedError,
} from '../domain/errors.js';
import {
  DEFAULT_CATEGORIES,
  FinanceCategory,
  isEntryDirection,
} from '../domain/finance-category.js';
import type { CategoryRepository } from '../domain/finance.repositories.js';
import { CategoryId } from '../domain/ids.js';
import type { FinanceAccess } from './finance-access.js';
import { type CategoryView, toCategoryView } from './views.js';

function assertCanManage(access: FinanceAccess): void {
  if (!access.canManageCategories()) throw new FinanceAccessDeniedError();
}

export interface CreateCategoryCommand {
  name: string;
  direction: string;
}

/** UC-11: cria uma categoria de entrada ou de saída. As categorias são da igreja toda. */
export class CreateCategoryUseCase {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly ids: IdGenerator,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: FinanceAccess,
    command: CreateCategoryCommand,
  ): Promise<{ id: string }> {
    assertCanManage(access);
    if (!isEntryDirection(command.direction)) {
      throw new ValidationError('direction', 'O sentido deve ser IN ou OUT.');
    }
    const category = FinanceCategory.register({
      id: CategoryId.of(this.ids.next()),
      organizationId: context.organizationId,
      name: command.name,
      direction: command.direction,
    });

    await this.categories.add(category);
    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'finance.category_created',
      entity: 'finance_category',
      entityId: category.id,
      metadata: { direction: category.direction },
    });
    return { id: category.id };
  }
}

export interface UpdateCategoryCommand {
  categoryId: string;
  name?: string;
  archived?: boolean;
}

/** UC-11: renomeia, arquiva ou reativa uma categoria (nunca se apaga: os lançamentos antigos a referenciam). */
export class UpdateCategoryUseCase {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: FinanceAccess,
    command: UpdateCategoryCommand,
  ): Promise<void> {
    assertCanManage(access);
    const category = await this.categories.findById(
      context.organizationId,
      CategoryId.of(command.categoryId),
    );
    if (!category) throw new CategoryNotFoundError();

    if (command.name !== undefined) category.rename(command.name);
    if (command.archived === true) category.archive();
    if (command.archived === false) category.unarchive();

    await this.categories.save(category);
    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'finance.category_updated',
      entity: 'finance_category',
      entityId: category.id,
      metadata: {
        renamed: command.name !== undefined,
        archived: command.archived ?? null,
      },
    });
  }
}

/** Lista as categorias da igreja (entradas antes de saídas). Não é dado sensível: qualquer leitor do financeiro vê. */
export class ListCategoriesUseCase {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(
    context: RequestContext,
    query: { includeArchived?: boolean },
  ): Promise<CategoryView[]> {
    const list = await this.categories.list(context.organizationId, {
      includeArchived: query.includeArchived ?? false,
    });
    return list.map(toCategoryView);
  }
}

/**
 * Cria as categorias padrão que ainda não existem (dízimo, oferta, aluguel...). IDEMPOTENTE: pode ser chamada de novo sem
 * duplicar, e nunca mexe nas que a igreja já tem (nem desarquiva as que ela arquivou).
 */
export class EnsureDefaultCategoriesUseCase {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly ids: IdGenerator,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: FinanceAccess,
  ): Promise<{ created: number }> {
    assertCanManage(access);
    const existing = await this.categories.list(context.organizationId, {
      includeArchived: true,
    });
    const taken = new Set(
      existing.map((c) => `${c.direction}|${comparisonKey(c.name)}`),
    );

    let created = 0;
    for (const standard of DEFAULT_CATEGORIES) {
      if (taken.has(`${standard.direction}|${comparisonKey(standard.name)}`)) {
        continue;
      }
      try {
        await this.categories.add(
          FinanceCategory.register({
            id: CategoryId.of(this.ids.next()),
            organizationId: context.organizationId,
            name: standard.name,
            direction: standard.direction,
          }),
        );
        created += 1;
      } catch (error) {
        // Outra requisição criou a mesma agora: o resultado desejado já existe.
        if (!(error instanceof CategoryNameTakenError)) throw error;
      }
    }

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'finance.default_categories_ensured',
      entity: 'finance_category',
      entityId: null,
      metadata: { created },
    });
    return { created };
  }
}
