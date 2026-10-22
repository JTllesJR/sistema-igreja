-- Cargo do membro (lista informada pela igreja em 2026-10-22). DADO SENSÍVEL, como a situação (ADR 0006).
-- Todo membro existente passa a ser "MEMBER" (sem cargo), o padrão.

-- CreateEnum
CREATE TYPE "member_position" AS ENUM ('MEMBER', 'AUXILIARY', 'DEACON', 'DEACONESS', 'PRESBYTER', 'EVANGELIST', 'PASTOR');

-- AlterTable
ALTER TABLE "member" ADD COLUMN     "position" "member_position" NOT NULL DEFAULT 'MEMBER';
