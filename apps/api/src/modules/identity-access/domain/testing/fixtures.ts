import {
  CongregationId,
  OrganizationId,
} from '../../../../shared/domain/identifiers.js';
import { uuidFor } from '../../../../shared/testing/uuid-for.js';
import { Email } from '../email.js';
import { RoleId, SessionFamilyId, SessionId, UserId } from '../ids.js';
import { PasswordHash } from '../password-hash.js';
import { User } from '../user.js';

export const orgId = (n = 1): OrganizationId => OrganizationId.of(uuidFor(n));
export const congId = (n: number): CongregationId =>
  CongregationId.of(uuidFor(1000 + n));
export const userId = (n = 1): UserId => UserId.of(uuidFor(2000 + n));
export const roleId = (n = 1): RoleId => RoleId.of(uuidFor(3000 + n));
export const sessionId = (n = 1): SessionId => SessionId.of(uuidFor(4000 + n));
export const familyId = (n = 1): SessionFamilyId =>
  SessionFamilyId.of(uuidFor(5000 + n));

/** Instante fixo dos testes; o domínio nunca lê o relógio, recebe `now`. */
export const NOW = new Date('2026-10-20T12:00:00.000Z');
export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;
export const after = (from: Date, ms: number): Date =>
  new Date(from.getTime() + ms);

export const anEmail = (raw = 'maria@igreja.com'): Email => Email.create(raw);

export const A_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQxMjM0NTY3OA$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g';
export const aPasswordHash = (): PasswordHash =>
  PasswordHash.of(A_PASSWORD_HASH);

export const aUser = (n = 1): User =>
  User.register({
    id: userId(n),
    organizationId: orgId(),
    email: anEmail(`usuario${n}@igreja.com`),
    passwordHash: aPasswordHash(),
  });
