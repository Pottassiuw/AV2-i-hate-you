-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "tokenVersao" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ParametrosSistema" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "aliquotaImposto" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "depreciacaoAnual" DECIMAL(5,4) NOT NULL DEFAULT 0.10,
    "valorBaseQuilograma" DECIMAL(12,2) NOT NULL DEFAULT 10,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "versao" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ParametrosSistema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroAuditoria" (
    "id" UUID NOT NULL,
    "dataHora" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responsavelId" UUID NOT NULL,
    "entidade" VARCHAR(40) NOT NULL,
    "entidadeId" VARCHAR(100) NOT NULL,
    "acao" VARCHAR(40) NOT NULL,
    "antes" JSONB,
    "depois" JSONB,

    CONSTRAINT "RegistroAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistroAuditoria_entidade_entidadeId_dataHora_idx" ON "RegistroAuditoria"("entidade", "entidadeId", "dataHora");

-- AddForeignKey
ALTER TABLE "RegistroAuditoria" ADD CONSTRAINT "RegistroAuditoria_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ParametrosSistema" ADD CONSTRAINT "ParametrosSistema_valores_check"
  CHECK ("id" = 1 AND "versao" >= 0 AND "aliquotaImposto" BETWEEN 0 AND 1
    AND "depreciacaoAnual" BETWEEN 0 AND 1 AND "valorBaseQuilograma" >= 0);
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_tokenVersao_check" CHECK ("tokenVersao" >= 0);
INSERT INTO "ParametrosSistema" ("id") VALUES (1);

-- Histórico retido sem expurgo automático; alterações e exclusões não são permitidas.
CREATE FUNCTION "bloquear_mutacao_historico"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Histórico é somente de acréscimo.';
END;
$$;
CREATE TRIGGER "Movimentacao_somente_acrescimo" BEFORE UPDATE OR DELETE ON "Movimentacao"
  FOR EACH ROW EXECUTE FUNCTION "bloquear_mutacao_historico"();
CREATE TRIGGER "Auditoria_somente_acrescimo" BEFORE UPDATE OR DELETE ON "RegistroAuditoria"
  FOR EACH ROW EXECUTE FUNCTION "bloquear_mutacao_historico"();
