/**
 * API pública do módulo `finance` (ADR 0001): a única porta de entrada para fora do módulo. Entidades e repositórios
 * não são exportados.
 *
 * - `FinanceModule`: ligação no `AppModule`.
 * - `FINANCE_READ`, `FINANCE_WRITE`, `FINANCE_APPROVE`, `FINANCE_READ_INDIVIDUAL`: as permissões do módulo (ADR 0004).
 *
 * Quem contribuiu é dado SENSÍVEL (ADR 0006): nenhum outro módulo lê os lançamentos diretamente.
 */
export { FinanceModule } from './finance.module.js';
export {
  FINANCE_APPROVE,
  FINANCE_PERMISSIONS,
  FINANCE_READ,
  FINANCE_READ_INDIVIDUAL,
  FINANCE_WRITE,
} from './finance.permissions.js';
