-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "user_account" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "user_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "role_id" UUID NOT NULL,
    "permission" TEXT NOT NULL,
    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role_id","permission")
);

-- CreateTable
CREATE TABLE "user_role_assignment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "congregation_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_role_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "family_started_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "rotated_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_account_email_key" ON "user_account"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_account_organization_id_id_key" ON "user_account"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "role_organization_id_id_key" ON "role"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_hash_key" ON "session"("token_hash");

-- CreateIndex
CREATE INDEX "session_family_id_idx" ON "session"("family_id");

-- CreateIndex
CREATE INDEX "session_user_id_idx" ON "session"("user_id");

-- AddForeignKey
ALTER TABLE "user_account" ADD CONSTRAINT "user_account_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role" ADD CONSTRAINT "role_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignment" ADD CONSTRAINT "user_role_assignment_organization_id_user_id_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "user_account"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignment" ADD CONSTRAINT "user_role_assignment_organization_id_role_id_fkey" FOREIGN KEY ("organization_id", "role_id") REFERENCES "role"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignment" ADD CONSTRAINT "user_role_assignment_organization_id_congregation_id_fkey" FOREIGN KEY ("organization_id", "congregation_id") REFERENCES "congregation"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_organization_id_user_id_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "user_account"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Regras SQL MANUAIS (o Prisma não as expressa no schema; preserve-as ao alterar estas tabelas).
-- Rede de segurança do domínio, como no módulo organization (ADR 0010, seção 7).
-- ---------------------------------------------------------------------------------------------

-- O e-mail é SEMPRE gravado normalizado (minúsculas, sem espaços nas pontas). Junto da unicidade acima, isso
-- equivale a "único sem diferenciar caixa", mas permite buscar por igualdade simples usando o índice.
ALTER TABLE "user_account"
  ADD CONSTRAINT "user_account_email_normalized" CHECK ("email" = lower(btrim("email")));

ALTER TABLE "user_account"
  ADD CONSTRAINT "user_account_failed_attempts_non_negative" CHECK ("failed_login_attempts" >= 0);

-- Nome de papel único por igreja, sem diferenciar maiúsculas/minúsculas.
CREATE UNIQUE INDEX "role_org_name_ci_key" ON "role"("organization_id", lower("name"));

-- Atribuição única por (usuário, papel, escopo). Duas unicidades parciais porque NULL não se compara em UNIQUE comum:
-- uma para "igreja toda" (congregation_id nulo) e outra para cada congregação.
CREATE UNIQUE INDEX "user_role_assignment_org_wide_key"
  ON "user_role_assignment"("user_id", "role_id") WHERE "congregation_id" IS NULL;
CREATE UNIQUE INDEX "user_role_assignment_scoped_key"
  ON "user_role_assignment"("user_id", "role_id", "congregation_id") WHERE "congregation_id" IS NOT NULL;
