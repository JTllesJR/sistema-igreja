import type { AuditEntry, AuditLog } from '../application/audit-log.js';

/** Trilha em memória para testes: guarda o que foi registrado e pode ser forçada a falhar. */
export class InMemoryAuditLog implements AuditLog {
  readonly entries: AuditEntry[] = [];
  failWith: Error | null = null;

  record(entry: AuditEntry): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.entries.push({ ...entry });
    return Promise.resolve();
  }
}
