import { useState } from 'react';
import { Link } from 'react-router';
import type { Role, UserSummary } from '@igreja/contracts';
import { ApiError } from '../auth/http';
import { useSession } from '../auth/SessionProvider';
import { useCongregations } from '../congregations/queries';
import { ErrorAlert, Field } from '../ui/Field';
import { TemporaryPasswordNotice } from '../ui/TemporaryPasswordNotice';
import {
  cardClass,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
  smallButtonClass,
} from '../ui/styles';
import {
  STATUS_LABELS,
  describeAssignment,
  formatLastLogin,
  isWholeChurchOnly,
  toAssignmentRequest,
} from '../users/logic';
import { useRoles, useUserMutations, useUsers } from '../users/queries';

function messageOf(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Não foi possível concluir a ação. Tente novamente.';
}

export function UsuariosPage() {
  const session = useSession();
  const users = useUsers();
  const roles = useRoles();
  const congregations = useCongregations();
  const mutations = useUserMutations();
  const [error, setError] = useState<string | null>(null);
  // Senha temporária de uma redefinição: só no estado desta tela (a mutação usa gcTime 0).
  const [reset, setReset] = useState<{
    email: string;
    password: string;
  } | null>(null);

  const names = new Map((congregations.data ?? []).map((c) => [c.id, c.name]));
  const congregationName = (id: string) => names.get(id) ?? 'Congregação';
  const myId = session.status === 'authenticated' ? session.user.id : null;

  function resetPassword(user: UserSummary) {
    if (
      !window.confirm(
        `Redefinir a senha de ${user.email}? Ela será desconectada de todos os aparelhos e receberá uma senha temporária nova.`,
      )
    ) {
      return;
    }
    setError(null);
    setReset(null);
    mutations.resetPassword.mutate(user.id, {
      onSuccess: (result) =>
        setReset({
          email: result.user.email,
          password: result.temporaryPassword,
        }),
      onError: (e) => setError(messageOf(e)),
    });
  }

  function toggle(user: UserSummary) {
    const disabling = user.status === 'ACTIVE';
    if (
      disabling &&
      !window.confirm(
        `Desativar ${user.email}? A pessoa perde o acesso e é desconectada na hora.`,
      )
    ) {
      return;
    }
    setError(null);
    (disabling ? mutations.disable : mutations.enable).mutate(user.id, {
      onError: (e) => setError(messageOf(e)),
    });
  }

  function revoke(user: UserSummary, role: UserSummary['roles'][number]) {
    if (!window.confirm(`Remover o papel "${role.roleName}" de ${user.email}?`))
      return;
    setError(null);
    mutations.revokeRole.mutate(
      {
        id: user.id,
        request: { roleId: role.roleId, congregationId: role.congregationId },
      },
      { onError: (e) => setError(messageOf(e)) },
    );
  }

  const busy = Object.values(mutations).some((m) => m.isPending);

  return (
    <section aria-labelledby="usuarios" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="usuarios" className="text-lg font-semibold">
            Usuários
          </h2>
          <p className="text-sm text-slate-600">
            Quem entra no sistema e o que cada pessoa pode fazer.
          </p>
        </div>
        <Link to="/usuarios/novo" className={primaryButtonClass}>
          Novo usuário
        </Link>
      </div>

      {reset && (
        <TemporaryPasswordNotice
          email={reset.email}
          password={reset.password}
          onDone={() => setReset(null)}
        />
      )}
      {error && <ErrorAlert>{error}</ErrorAlert>}

      {users.isPending && (
        <p role="status" className="text-sm text-slate-500">
          Carregando usuários…
        </p>
      )}
      {users.isError && (
        <div className={`${cardClass} space-y-3`}>
          <ErrorAlert>{messageOf(users.error)}</ErrorAlert>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => void users.refetch()}
          >
            Tentar de novo
          </button>
        </div>
      )}

      <ul className="space-y-3">
        {users.data?.map((user) => (
          <UserItem
            key={user.id}
            user={user}
            isMe={user.id === myId}
            roles={roles.data ?? []}
            congregations={(congregations.data ?? []).filter(
              (c) => c.status === 'ACTIVE',
            )}
            congregationName={congregationName}
            busy={busy}
            onToggle={() => toggle(user)}
            onReset={() => resetPassword(user)}
            onRevoke={(role) => revoke(user, role)}
            onAssign={(form, done) => {
              setError(null);
              mutations.assignRole.mutate(
                {
                  id: user.id,
                  request: toAssignmentRequest(form, roles.data ?? []),
                },
                { onSuccess: done, onError: (e) => setError(messageOf(e)) },
              );
            }}
          />
        ))}
      </ul>
    </section>
  );
}

function UserItem({
  user,
  isMe,
  roles,
  congregations,
  congregationName,
  busy,
  onToggle,
  onReset,
  onRevoke,
  onAssign,
}: {
  user: UserSummary;
  isMe: boolean;
  roles: Role[];
  congregations: { id: string; name: string }[];
  congregationName: (id: string) => string;
  busy: boolean;
  onToggle: () => void;
  onReset: () => void;
  onRevoke: (role: UserSummary['roles'][number]) => void;
  onAssign: (
    form: { roleId: string; congregationId: string },
    done: () => void,
  ) => void;
}) {
  const [assigning, setAssigning] = useState(false);
  const [roleId, setRoleId] = useState('');
  const [congregationId, setCongregationId] = useState('');
  const disabled = user.status === 'DISABLED';
  const chosen = roles.find((r) => r.id === roleId);
  const needsCongregation = chosen !== undefined && !isWholeChurchOnly(chosen);
  const canAssign =
    roleId !== '' && (!needsCongregation || congregationId !== '');

  return (
    <li className={cardClass}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="break-all font-semibold">{user.email}</h3>
        {isMe && (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
            Você
          </span>
        )}
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            disabled
              ? 'bg-slate-100 text-slate-600'
              : 'bg-emerald-100 text-emerald-800'
          }`}
        >
          {STATUS_LABELS[user.status]}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Último acesso: {formatLastLogin(user.lastLoginAt)}
      </p>

      {user.roles.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">Nenhum papel atribuído.</p>
      ) : (
        <ul className="mt-3 space-y-2" aria-label={`Papéis de ${user.email}`}>
          {user.roles.map((role) => (
            <li
              key={`${role.roleId}:${role.congregationId ?? ''}`}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span className="font-medium">
                {describeAssignment(role, congregationName)}
              </span>
              <button
                type="button"
                className={smallButtonClass}
                disabled={busy}
                onClick={() => onRevoke(role)}
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={smallButtonClass}
          onClick={() => setAssigning(!assigning)}
        >
          {assigning ? 'Cancelar' : 'Atribuir papel'}
        </button>
        <button
          type="button"
          className={smallButtonClass}
          disabled={busy}
          onClick={onReset}
        >
          Redefinir senha
        </button>
        <button
          type="button"
          className={smallButtonClass}
          disabled={busy}
          onClick={onToggle}
        >
          {disabled ? 'Reativar' : 'Desativar'}
        </button>
      </div>

      {assigning && (
        <form
          className="mt-4 grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canAssign) return;
            onAssign({ roleId, congregationId }, () => {
              setAssigning(false);
              setRoleId('');
              setCongregationId('');
            });
          }}
        >
          <Field id={`papel-${user.id}`} label="Papel">
            {(props) => (
              <select
                {...props}
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className={fieldClass}
              >
                <option value="">Escolher</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {needsCongregation ? (
            <Field id={`cong-${user.id}`} label="Congregação">
              {(props) => (
                <select
                  {...props}
                  value={congregationId}
                  onChange={(e) => setCongregationId(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">Escolher</option>
                  {congregations.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ) : (
            <p className="text-sm text-slate-600">
              {chosen ? 'Vale para a igreja toda.' : ''}
            </p>
          )}
          <button
            type="submit"
            className={primaryButtonClass}
            disabled={busy || !canAssign}
          >
            Atribuir
          </button>
        </form>
      )}
    </li>
  );
}
