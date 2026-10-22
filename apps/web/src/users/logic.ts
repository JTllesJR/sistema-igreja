import type {
  CreateUserRequest,
  Role,
  RoleAssignmentRequest,
  UserSummary,
} from '@igreja/contracts';
import type { FieldErrors } from '../congregations/form';

/**
 * Lógica das telas de usuários e de troca de senha, sem React (testável sem tela). SENHAS: nada daqui guarda senha;
 * as funções só validam e convertem o que a tela já tem em mãos.
 */

/** Papel que vale para a igreja toda e nunca para uma congregação só (ADR 0014): o que tem o curinga `*`. */
export const isWholeChurchOnly = (role: Pick<Role, 'permissions'>): boolean =>
  role.permissions.includes('*');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CreateUserForm {
  email: string;
  roleId: string;
  /** Vazio = a igreja toda. */
  congregationId: string;
}

export const emptyCreateUserForm = (): CreateUserForm => ({
  email: '',
  roleId: '',
  congregationId: '',
});

/** Validação rápida, só para dar retorno antes de enviar. A API repete as regras (e confere o escopo do papel). */
export function validateCreateUser(
  form: CreateUserForm,
  roles: readonly Role[],
): FieldErrors {
  const errors: FieldErrors = {};
  if (!EMAIL.test(form.email.trim()))
    errors['email'] = 'Informe um e-mail válido.';
  const role = roles.find((r) => r.id === form.roleId);
  if (!role) {
    errors['roleId'] = 'Escolha o papel.';
  } else if (!isWholeChurchOnly(role) && form.congregationId === '') {
    errors['congregationId'] = 'Escolha a congregação deste papel.';
  }
  return errors;
}

/** O escopo a enviar: papel de igreja toda ignora a congregação escolhida (um valor velho do formulário não pode ir junto). */
function scopeOf(
  roleId: string,
  congregationId: string,
  roles: readonly Role[],
): string | null {
  const role = roles.find((r) => r.id === roleId);
  return !role || isWholeChurchOnly(role) || congregationId === ''
    ? null
    : congregationId;
}

export function toCreateRequest(
  form: CreateUserForm,
  roles: readonly Role[],
): CreateUserRequest {
  return {
    email: form.email.trim(),
    roleId: form.roleId,
    congregationId: scopeOf(form.roleId, form.congregationId, roles),
  };
}

export interface AssignForm {
  roleId: string;
  congregationId: string;
}

export function toAssignmentRequest(
  form: AssignForm,
  roles: readonly Role[],
): RoleAssignmentRequest {
  return {
    roleId: form.roleId,
    congregationId: scopeOf(form.roleId, form.congregationId, roles),
  };
}

/** "Secretário · Sede" ou "Administrador · Igreja toda". */
export function describeAssignment(
  role: UserSummary['roles'][number],
  congregationName: (id: string) => string,
): string {
  return `${role.roleName} · ${
    role.congregationId === null
      ? 'Igreja toda'
      : congregationName(role.congregationId)
  }`;
}

export const STATUS_LABELS: Readonly<Record<UserSummary['status'], string>> = {
  ACTIVE: 'Ativo',
  DISABLED: 'Desativado',
};

/** "21/10/2026 14:30" no horário de Brasília, ou "Nunca entrou". Fuso fixo: o resultado não depende da máquina. */
export function formatLastLogin(iso: string | null): string {
  if (iso === null) return 'Nunca entrou';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(iso))
    .replace(',', '');
}

const MIN_PASSWORD = 10;
const MAX_PASSWORD = 128;

export interface PasswordChangeForm {
  currentPassword: string;
  newPassword: string;
  confirmation: string;
}

export const emptyPasswordChangeForm = (): PasswordChangeForm => ({
  currentPassword: '',
  newPassword: '',
  confirmation: '',
});

/**
 * Política de senha (NIST, ADR 0010): 10 a 128 caracteres, sem regras de composição. A nova tem de ser DIFERENTE da
 * atual (senão a troca obrigatória não trocaria nada) e igual à confirmação (digitar às cegas erra fácil).
 */
export function validatePasswordChange(form: PasswordChangeForm): FieldErrors {
  const errors: FieldErrors = {};
  if (form.currentPassword === '')
    errors['currentPassword'] = 'Informe a senha atual.';
  if (
    form.newPassword.length < MIN_PASSWORD ||
    form.newPassword.length > MAX_PASSWORD
  ) {
    errors['newPassword'] =
      `A nova senha deve ter entre ${MIN_PASSWORD} e ${MAX_PASSWORD} caracteres.`;
  } else if (form.newPassword === form.currentPassword) {
    errors['newPassword'] = 'A nova senha precisa ser diferente da atual.';
  }
  if (form.confirmation !== form.newPassword) {
    errors['confirmation'] = 'A confirmação não é igual à nova senha.';
  }
  return errors;
}
