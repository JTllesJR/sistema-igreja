-- CreateEnum
CREATE TYPE "congregation_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "congregation" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_headquarters" BOOLEAN NOT NULL DEFAULT false,
    "status" "congregation_status" NOT NULL DEFAULT 'ACTIVE',
    "address" JSONB,
    "service_times" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "congregation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "congregation_organization_id_id_key" ON "congregation"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "congregation" ADD CONSTRAINT "congregation_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Regras SQL MANUAIS (o Prisma não as expressa no schema; preserve-as ao alterar esta tabela).
-- Rede de segurança do domínio: o agregado Organization já garante estas regras, mas o banco
-- protege contra concorrência e contra qualquer caminho que não passe pelo domínio (ADR 0009, seção 6).
-- ---------------------------------------------------------------------------------------------

-- Uma única sede por organização.
CREATE UNIQUE INDEX "congregation_one_headquarters_per_org"
  ON "congregation"("organization_id") WHERE "is_headquarters";

-- Nome de congregação único por organização, sem diferenciar maiúsculas/minúsculas.
-- (lower() não ignora acentos; o domínio normaliza acentos e rejeita antes.)
CREATE UNIQUE INDEX "congregation_org_name_ci_key"
  ON "congregation"("organization_id", lower("name"));
