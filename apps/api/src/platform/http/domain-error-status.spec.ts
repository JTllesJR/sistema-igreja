import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DOMAIN_ERROR_STATUS,
  statusForDomainError,
} from './domain-error-status.js';

const SRC = join(import.meta.dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

/** Todo `code` passado ao construtor de um DomainError: super('modulo.codigo', ...). */
function declaredDomainErrorCodes(): string[] {
  const pattern = /super\(\s*'([a-z_]+\.[a-z_]+)'/g;
  const codes = new Set<string>();
  for (const file of sourceFiles(SRC)) {
    for (const match of readFileSync(file, 'utf8').matchAll(pattern)) {
      codes.add(match[1] ?? '');
    }
  }
  return [...codes].sort();
}

describe('statusForDomainError (código de domínio -> status HTTP)', () => {
  // Contrato com os clientes: mudar um status aqui quebra quem reage a ele. Por isso a tabela inteira é conferida,
  // e não só uma amostra: alterar um valor tem de ser uma decisão deliberada (e atualizar este teste).
  it('a tabela inteira (ADR 0011, seção 6)', () => {
    expect(DOMAIN_ERROR_STATUS).toEqual({
      'validation.invalid_value': 422,
      'concurrency.conflict': 409,
      'organization.not_found': 404,
      'organization.already_exists': 409,
      'organization.state_corrupted': 500,
      'organization.congregation_not_found': 404,
      'organization.congregation_name_taken': 409,
      'organization.congregation_inactive': 409,
      'organization.congregation_already_in_status': 409,
      'organization.congregation_already_headquarters': 409,
      'organization.cannot_deactivate_headquarters': 409,
      'members.not_found': 404,
      'members.access_denied': 403,
      'members.anonymized': 409,
      'members.already_in_status': 409,
      'members.already_in_congregation': 409,
      'members.congregation_unavailable': 422,
      'identity.invalid_credentials': 401,
      'identity.session_invalid': 401,
      'identity.session_reuse_detected': 401,
      'identity.permission_denied': 403,
      'identity.current_password_incorrect': 422,
      'identity.email_already_registered': 409,
      'identity.user_not_found': 404,
      'identity.unknown_organization': 404,
      'identity.role_name_taken': 409,
      'identity.role_already_assigned': 409,
      'identity.last_administrator': 409,
      'identity.assignment_not_found': 404,
      'identity.role_not_found': 404,
      'identity.administrator_scope_invalid': 422,
      'identity.congregation_unavailable': 422,
    });
  });

  it('statusForDomainError devolve o valor da tabela', () => {
    for (const [code, status] of Object.entries(DOMAIN_ERROR_STATUS)) {
      expect(statusForDomainError(code)).toBe(status);
    }
  });

  it('código desconhecido vira 500: a falha aparece, em vez de um palpite de 4xx', () => {
    expect(statusForDomainError('modulo.que_nao_existe')).toBe(500);
  });

  it('todo código declarado no código-fonte tem uma entrada na tabela', () => {
    const codes = declaredDomainErrorCodes();

    // Sanidade do próprio teste: se a varredura não achar nada, ele passaria sem proteger.
    expect(codes.length).toBeGreaterThanOrEqual(20);
    expect(codes.filter((code) => !(code in DOMAIN_ERROR_STATUS))).toEqual([]);
  });

  it('a tabela não guarda códigos que não existem mais', () => {
    const codes = new Set(declaredDomainErrorCodes());

    expect(
      Object.keys(DOMAIN_ERROR_STATUS).filter((c) => !codes.has(c)),
    ).toEqual([]);
  });
});
