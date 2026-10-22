-- Consulta da trilha por quem fez (UC-04, ADR 0017). Só um índice: não toca nas linhas, então o gatilho de somente-anexação não é afetado.

-- CreateIndex
CREATE INDEX "audit_log_organization_id_actor_id_occurred_at_idx" ON "audit_log"("organization_id", "actor_id", "occurred_at");
