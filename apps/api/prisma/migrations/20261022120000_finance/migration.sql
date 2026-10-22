-- CreateEnum
CREATE TYPE "account_kind" AS ENUM ('CASH', 'BANK');

-- CreateEnum
CREATE TYPE "archive_status" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "entry_direction" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "entry_kind" AS ENUM ('ORDINARY', 'OPENING_BALANCE', 'TRANSFER', 'REVERSAL');

-- CreateEnum
CREATE TYPE "entry_status" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "financial_account" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "congregation_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "account_kind" NOT NULL,
    "status" "archive_status" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "financial_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_category" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "direction" "entry_direction" NOT NULL,
    "status" "archive_status" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "finance_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_entry" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "congregation_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "kind" "entry_kind" NOT NULL,
    "direction" "entry_direction" NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "occurred_on" DATE NOT NULL,
    "description" TEXT,
    "category_id" UUID,
    "member_id" UUID,
    "transfer_id" UUID,
    "reverses_entry_id" UUID,
    "status" "entry_status" NOT NULL,
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_account_organization_id_congregation_id_idx" ON "financial_account"("organization_id", "congregation_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_account_organization_id_id_key" ON "financial_account"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_account_organization_id_id_congregation_id_key" ON "financial_account"("organization_id", "id", "congregation_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_category_organization_id_id_key" ON "finance_category"("organization_id", "id");

-- CreateIndex
CREATE INDEX "financial_entry_organization_id_congregation_id_occurred_on_idx" ON "financial_entry"("organization_id", "congregation_id", "occurred_on");

-- CreateIndex
CREATE INDEX "financial_entry_organization_id_account_id_idx" ON "financial_entry"("organization_id", "account_id");

-- CreateIndex
CREATE INDEX "financial_entry_organization_id_member_id_occurred_on_idx" ON "financial_entry"("organization_id", "member_id", "occurred_on");

-- CreateIndex
CREATE INDEX "financial_entry_organization_id_status_idx" ON "financial_entry"("organization_id", "status");

-- CreateIndex
CREATE INDEX "financial_entry_organization_id_transfer_id_idx" ON "financial_entry"("organization_id", "transfer_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_entry_organization_id_id_key" ON "financial_entry"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "financial_account" ADD CONSTRAINT "financial_account_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_account" ADD CONSTRAINT "financial_account_organization_id_congregation_id_fkey" FOREIGN KEY ("organization_id", "congregation_id") REFERENCES "congregation"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_category" ADD CONSTRAINT "finance_category_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entry" ADD CONSTRAINT "financial_entry_organization_id_account_id_congregation_id_fkey" FOREIGN KEY ("organization_id", "account_id", "congregation_id") REFERENCES "financial_account"("organization_id", "id", "congregation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entry" ADD CONSTRAINT "financial_entry_organization_id_category_id_fkey" FOREIGN KEY ("organization_id", "category_id") REFERENCES "finance_category"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entry" ADD CONSTRAINT "financial_entry_organization_id_member_id_fkey" FOREIGN KEY ("organization_id", "member_id") REFERENCES "member"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_entry" ADD CONSTRAINT "financial_entry_organization_id_reverses_entry_id_fkey" FOREIGN KEY ("organization_id", "reverses_entry_id") REFERENCES "financial_entry"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------------------------
-- SQL MANUAL (o Prisma não expressa). Preserve ao alterar estas tabelas (ver comentário no schema.prisma e o ADR 0015).
-- ---------------------------------------------------------------------------------------------------------------

-- Nomes únicos sem diferenciar caixa nem espaços nas pontas: uma conta por nome em cada congregação; uma categoria por
-- nome e sentido em cada igreja.
CREATE UNIQUE INDEX "financial_account_name_unique"
  ON "financial_account" ("organization_id", "congregation_id", lower(btrim("name")));
CREATE UNIQUE INDEX "finance_category_name_unique"
  ON "finance_category" ("organization_id", "direction", lower(btrim("name")));

ALTER TABLE "financial_account" ADD CONSTRAINT "financial_account_name_length"
  CHECK (char_length(btrim("name")) BETWEEN 1 AND 80);
ALTER TABLE "finance_category" ADD CONSTRAINT "finance_category_name_length"
  CHECK (char_length(btrim("name")) BETWEEN 1 AND 80);

-- Dinheiro: centavos inteiros, positivos, com teto (R$ 100 milhões por lançamento).
ALTER TABLE "financial_entry" ADD CONSTRAINT "financial_entry_amount_range"
  CHECK ("amount_cents" BETWEEN 1 AND 10000000000);

ALTER TABLE "financial_entry" ADD CONSTRAINT "financial_entry_text_length"
  CHECK (("description" IS NULL OR char_length("description") <= 200)
     AND ("decision_note" IS NULL OR char_length("decision_note") <= 300));

-- Cada tipo de lançamento tem o seu formato: comum tem categoria; saldo inicial é sempre entrada e sem categoria nem
-- membro; perna de repasse tem o transfer_id; estorno aponta o lançamento estornado.
ALTER TABLE "financial_entry" ADD CONSTRAINT "financial_entry_kind_shape" CHECK (
  ("kind" = 'ORDINARY' AND "category_id" IS NOT NULL AND "transfer_id" IS NULL AND "reverses_entry_id" IS NULL)
  OR ("kind" = 'OPENING_BALANCE' AND "direction" = 'IN' AND "category_id" IS NULL AND "member_id" IS NULL
      AND "transfer_id" IS NULL AND "reverses_entry_id" IS NULL)
  OR ("kind" = 'TRANSFER' AND "transfer_id" IS NOT NULL AND "category_id" IS NULL AND "member_id" IS NULL
      AND "reverses_entry_id" IS NULL)
  OR ("kind" = 'REVERSAL' AND "reverses_entry_id" IS NOT NULL AND "transfer_id" IS NULL)
);

-- Quem contribuiu só existe em entrada comum (ou no estorno dela).
ALTER TABLE "financial_entry" ADD CONSTRAINT "financial_entry_member_only_on_income" CHECK (
  "member_id" IS NULL OR ("kind" = 'ORDINARY' AND "direction" = 'IN') OR "kind" = 'REVERSAL'
);

-- SEPARAÇÃO DE FUNÇÕES: quem pede nunca decide o próprio pedido (nem por erro do aplicativo).
ALTER TABLE "financial_entry" ADD CONSTRAINT "financial_entry_maker_is_not_checker"
  CHECK ("decided_by" IS NULL OR "decided_by" <> "requested_by");

-- Pendente ainda não foi decidido; recusado sempre tem decisor e motivo; e SÓ a entrada comum nasce confirmada sem
-- decisor: qualquer outro lançamento (saída, repasse, estorno, saldo inicial) só está confirmado se alguém o aprovou.
ALTER TABLE "financial_entry" ADD CONSTRAINT "financial_entry_decision_shape" CHECK (
  ("status" <> 'PENDING' OR ("decided_by" IS NULL AND "decided_at" IS NULL))
  AND ("status" <> 'REJECTED' OR ("decided_by" IS NOT NULL AND "decision_note" IS NOT NULL))
  AND ("status" <> 'CONFIRMED' OR "decided_by" IS NOT NULL OR ("kind" = 'ORDINARY' AND "direction" = 'IN'))
);

-- Um estorno por lançamento (o estorno recusado ou cancelado libera a vaga).
CREATE UNIQUE INDEX "financial_entry_one_reversal"
  ON "financial_entry" ("organization_id", "reverses_entry_id")
  WHERE "reverses_entry_id" IS NOT NULL AND "status" IN ('PENDING', 'CONFIRMED');

-- IMUTABILIDADE (ADR 0005 e 0015): nunca se apaga um lançamento; depois de decidido, nada muda; num pendente só mudam os
-- campos da decisão.
CREATE FUNCTION "financial_entry_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'financial_entry é imutável: DELETE não é permitido'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF OLD."status" <> 'PENDING' THEN
    RAISE EXCEPTION 'financial_entry é imutável: o lançamento % já foi decidido', OLD."id"
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW."id" <> OLD."id"
     OR NEW."organization_id" <> OLD."organization_id"
     OR NEW."congregation_id" <> OLD."congregation_id"
     OR NEW."account_id" <> OLD."account_id"
     OR NEW."kind" <> OLD."kind"
     OR NEW."direction" <> OLD."direction"
     OR NEW."amount_cents" <> OLD."amount_cents"
     OR NEW."occurred_on" <> OLD."occurred_on"
     OR NEW."requested_by" <> OLD."requested_by"
     OR NEW."requested_at" <> OLD."requested_at"
     OR NEW."description" IS DISTINCT FROM OLD."description"
     OR NEW."category_id" IS DISTINCT FROM OLD."category_id"
     OR NEW."member_id" IS DISTINCT FROM OLD."member_id"
     OR NEW."transfer_id" IS DISTINCT FROM OLD."transfer_id"
     OR NEW."reverses_entry_id" IS DISTINCT FROM OLD."reverses_entry_id" THEN
    RAISE EXCEPTION 'financial_entry é imutável: só os campos da decisão mudam em um lançamento pendente'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "financial_entry_immutable"
  BEFORE UPDATE OR DELETE ON "financial_entry"
  FOR EACH ROW EXECUTE FUNCTION "financial_entry_guard"();
