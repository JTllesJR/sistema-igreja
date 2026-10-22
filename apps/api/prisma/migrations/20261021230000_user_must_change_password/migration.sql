-- AlterTable
-- Senha temporária (ADR 0014): enquanto verdadeiro, a API só atende /auth/* até a pessoa escolher a própria senha.
ALTER TABLE "user_account" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;
