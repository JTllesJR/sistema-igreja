import type { PrismaService } from '../../src/platform/database/prisma.service.js';

/**
 * Esvazia as tabelas de negócio entre os testes (filhas antes das mães, por causa das chaves estrangeiras).
 * Só é seguro porque o vitest.config.integration.ts exige que o banco de testes termine em "_test".
 */
export async function cleanDatabase(prisma: PrismaService): Promise<void> {
  // `audit_log` é somente-anexação (gatilho recusa DELETE); só TRUNCATE a esvazia, e só um banco de testes permite isto.
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "audit_log"');
  await prisma.memberHistoryEvent.deleteMany();
  await prisma.member.deleteMany();
  await prisma.session.deleteMany();
  await prisma.userRoleAssignment.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.userAccount.deleteMany();
  await prisma.congregation.deleteMany();
  await prisma.organization.deleteMany();
}
