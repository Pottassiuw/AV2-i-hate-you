-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PapelUsuario" AS ENUM ('ADMINISTRADOR', 'OPERADOR_CADASTRO', 'OPERADOR_ALMOXARIFADO', 'AUDITOR');

-- CreateEnum
CREATE TYPE "TipoEquipamento" AS ENUM ('COMPUTADOR_MESA', 'NOTEBOOK', 'MONITOR', 'IMPRESSORA', 'SERVIDOR', 'ROTEADOR', 'CABO_ESTRUTURADO', 'FONTE_ALIMENTACAO');

-- CreateEnum
CREATE TYPE "EstadoFisico" AS ENUM ('NOVO', 'BOM_ESTADO', 'USADO_LEVE', 'USADO_MODERADO', 'DANIFICADO_LEVE', 'DANIFICADO_GRAVE', 'INSERVIVEL');

-- CreateEnum
CREATE TYPE "StatusRastreamento" AS ENUM ('AGUARDANDO_TRIAGEM', 'EM_TRIAGEM', 'AGUARDANDO_DESMONTE', 'EM_DESMONTE', 'PECAS_REAPROVEITADAS', 'MATERIAL_RECICLAVEL', 'DESCARTE_SEGURO', 'BAIXA_DEFINITIVA');

-- CreateEnum
CREATE TYPE "StatusLote" AS ENUM ('RECEBIDO', 'EM_TRIAGEM', 'TRIAGEM_CONCLUIDA', 'ENCAMINHADO', 'FINALIZADO');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "hashSenha" TEXT NOT NULL,
    "papel" "PapelUsuario" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "dataCadastro" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "versao" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organizacao" (
    "id" UUID NOT NULL,
    "razaoSocial" VARCHAR(200) NOT NULL,
    "cnpj" VARCHAR(14) NOT NULL,
    "inscricaoEstadual" VARCHAR(30),
    "enderecoCompleto" VARCHAR(500) NOT NULL,
    "telefone" VARCHAR(30) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "dataCadastro" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "versao" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Organizacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contrato" (
    "id" UUID NOT NULL,
    "organizacaoId" UUID NOT NULL,
    "dataAssinatura" DATE NOT NULL,
    "dataVencimento" DATE NOT NULL,
    "clausulas" JSONB NOT NULL DEFAULT '[]',
    "valorMensal" DECIMAL(12,2) NOT NULL,
    "renovacaoAutomatica" BOOLEAN NOT NULL DEFAULT false,
    "versao" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lote" (
    "id" UUID NOT NULL,
    "dataEntrada" DATE NOT NULL,
    "organizacaoId" UUID NOT NULL,
    "notaFiscal" VARCHAR(60) NOT NULL,
    "transportadora" VARCHAR(200) NOT NULL,
    "statusProcessamento" "StatusLote" NOT NULL DEFAULT 'RECEBIDO',
    "observacoes" VARCHAR(2000),
    "versao" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Lote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipamento" (
    "id" UUID NOT NULL,
    "codigoBarrasInterno" VARCHAR(80) NOT NULL,
    "tipo" "TipoEquipamento" NOT NULL,
    "marca" VARCHAR(100) NOT NULL,
    "modelo" VARCHAR(100) NOT NULL,
    "anoFabricacao" INTEGER NOT NULL,
    "estadoFisico" "EstadoFisico" NOT NULL,
    "pesoQuilogramas" DECIMAL(10,3) NOT NULL,
    "loteId" UUID NOT NULL,
    "posicaoNoLote" INTEGER NOT NULL,
    "statusRastreamento" "StatusRastreamento" NOT NULL DEFAULT 'AGUARDANDO_TRIAGEM',
    "triagemConcluidaEm" TIMESTAMPTZ(3),
    "versao" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Equipamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Movimentacao" (
    "id" UUID NOT NULL,
    "equipamentoId" UUID NOT NULL,
    "dataHora" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origem" VARCHAR(200) NOT NULL,
    "destino" VARCHAR(200) NOT NULL,
    "responsavelId" UUID NOT NULL,
    "observacao" VARCHAR(2000),
    "justificativa" VARCHAR(2000),
    "statusAnterior" "StatusRastreamento",
    "statusNovo" "StatusRastreamento" NOT NULL,
    "estadoFisicoAnterior" "EstadoFisico",
    "estadoFisicoNovo" "EstadoFisico" NOT NULL,
    "versaoEquipamento" INTEGER NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Movimentacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Organizacao_cnpj_key" ON "Organizacao"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Contrato_organizacaoId_key" ON "Contrato"("organizacaoId");

-- CreateIndex
CREATE INDEX "Lote_organizacaoId_dataEntrada_idx" ON "Lote"("organizacaoId", "dataEntrada");

-- CreateIndex
CREATE UNIQUE INDEX "Equipamento_codigoBarrasInterno_key" ON "Equipamento"("codigoBarrasInterno");

-- CreateIndex
CREATE UNIQUE INDEX "Equipamento_loteId_posicaoNoLote_key" ON "Equipamento"("loteId", "posicaoNoLote");

-- CreateIndex
CREATE UNIQUE INDEX "Movimentacao_equipamentoId_versaoEquipamento_key" ON "Movimentacao"("equipamentoId", "versaoEquipamento");

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lote" ADD CONSTRAINT "Lote_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "Organizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipamento" ADD CONSTRAINT "Equipamento_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "Lote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movimentacao" ADD CONSTRAINT "Movimentacao_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movimentacao" ADD CONSTRAINT "Movimentacao_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariantes simples também protegidas no banco; checks não são expressos pelo schema Prisma.
ALTER TABLE "Organizacao" ADD CONSTRAINT "Organizacao_cnpj_formato_check"
    CHECK ("cnpj" ~ '^[0-9]{14}$');
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_valores_check"
    CHECK ("dataVencimento" >= "dataAssinatura" AND "valorMensal" >= 0);
ALTER TABLE "Equipamento" ADD CONSTRAINT "Equipamento_medidas_check"
    CHECK ("pesoQuilogramas" > 0 AND "anoFabricacao" >= 1900 AND "posicaoNoLote" > 0);
ALTER TABLE "Equipamento" ADD CONSTRAINT "Equipamento_triagem_check"
    CHECK ("statusRastreamento" IN ('AGUARDANDO_TRIAGEM', 'EM_TRIAGEM') OR "triagemConcluidaEm" IS NOT NULL);
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_versao_check" CHECK ("versao" >= 0);
ALTER TABLE "Organizacao" ADD CONSTRAINT "Organizacao_versao_check" CHECK ("versao" >= 0);
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_versao_check" CHECK ("versao" >= 0);
ALTER TABLE "Lote" ADD CONSTRAINT "Lote_versao_check" CHECK ("versao" >= 0);
ALTER TABLE "Equipamento" ADD CONSTRAINT "Equipamento_versao_check" CHECK ("versao" >= 0);
ALTER TABLE "Movimentacao" ADD CONSTRAINT "Movimentacao_versao_check"
    CHECK ("versao" >= 0 AND "versaoEquipamento" >= 0);
