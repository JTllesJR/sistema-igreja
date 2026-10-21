-- CreateEnum
CREATE TYPE "member_status" AS ENUM ('ACTIVE', 'AWAY', 'TRANSFERRED_OUT', 'DECEASED');

-- CreateEnum
CREATE TYPE "member_event_type" AS ENUM ('REGISTERED', 'BAPTISM', 'RECEPTION', 'TRANSFER', 'STATUS_CHANGE', 'ANONYMIZED');

-- CreateTable
CREATE TABLE "member" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "congregation_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "birth_date" DATE,
    "phone" TEXT,
    "email" TEXT,
    "address" JSONB,
    "status" "member_status" NOT NULL DEFAULT 'ACTIVE',
    "anonymized_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_history_event" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "type" "member_event_type" NOT NULL,
    "occurred_on" DATE NOT NULL,
    "notes" TEXT,
    "from_congregation_id" UUID,
    "to_congregation_id" UUID,
    "from_status" "member_status",
    "to_status" "member_status",
    "recorded_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "member_history_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_organization_id_congregation_id_idx" ON "member"("organization_id", "congregation_id");

-- CreateIndex
CREATE INDEX "member_organization_id_name_key_idx" ON "member"("organization_id", "name_key");

-- CreateIndex
CREATE UNIQUE INDEX "member_organization_id_id_key" ON "member"("organization_id", "id");

-- CreateIndex
CREATE INDEX "member_history_event_organization_id_member_id_recorded_at_idx" ON "member_history_event"("organization_id", "member_id", "recorded_at");

-- CreateIndex
CREATE INDEX "audit_log_organization_id_occurred_at_idx" ON "audit_log"("organization_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_organization_id_entity_entity_id_idx" ON "audit_log"("organization_id", "entity", "entity_id");

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_congregation_id_fkey" FOREIGN KEY ("organization_id", "congregation_id") REFERENCES "congregation"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_history_event" ADD CONSTRAINT "member_history_event_organization_id_member_id_fkey" FOREIGN KEY ("organization_id", "member_id") REFERENCES "member"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_history_event" ADD CONSTRAINT "member_history_event_organization_id_from_congregation_id_fkey" FOREIGN KEY ("organization_id", "from_congregation_id") REFERENCES "congregation"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_history_event" ADD CONSTRAINT "member_history_event_organization_id_to_congregation_id_fkey" FOREIGN KEY ("organization_id", "to_congregation_id") REFERENCES "congregation"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------------------------
-- SQL MANUAL (o Prisma não expressa). Preserve ao alterar estas tabelas (ver comentário no schema.prisma).
-- ---------------------------------------------------------------------------------------------------------------

-- Defesa em profundidade: o domínio já valida, mas o banco recusa dado fora do formato mesmo que outro caminho grave.
ALTER TABLE "member" ADD CONSTRAINT "member_full_name_length" CHECK (char_length("full_name") BETWEEN 2 AND 150);
ALTER TABLE "member" ADD CONSTRAINT "member_phone_digits" CHECK ("phone" IS NULL OR "phone" ~ '^[0-9]{10,11}$');
ALTER TABLE "member_history_event" ADD CONSTRAINT "member_history_event_notes_length" CHECK ("notes" IS NULL OR char_length("notes") <= 500);

-- Trilha de auditoria SOMENTE-ANEXAÇÃO: nem o aplicativo, nem uma falha dele, consegue alterar ou apagar o que foi
-- registrado. (Em produção, o usuário do banco usado pela API também não deve ter o privilégio TRUNCATE nesta tabela.)
CREATE FUNCTION "audit_log_reject_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log é somente-anexação: % não é permitido', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER "audit_log_append_only"
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_reject_change"();
