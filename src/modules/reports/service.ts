import { Prisma, StatusRastreamento, type PrismaClient } from "@prisma/client";
import { authorize, type Actor } from "../../shared/permissions.js";
import { period } from "../../shared/dates.js";
import { BusinessError } from "../../shared/errors.js";

type ReportQuery = { inicio?: string; fim?: string; organizacaoId?: string };

function equipmentFilter(query: ReportQuery): Prisma.EquipamentoWhereInput {
  const { inicio, fim } = period(query);
  return {
    lote: {
      organizacaoId: query.organizacaoId,
      dataEntrada: { gte: inicio, lte: fim },
    },
  };
}

async function groupedStatus(tx: Prisma.TransactionClient, query: ReportQuery) {
  const groups = await tx.equipamento.groupBy({
    by: ["statusRastreamento"],
    where: equipmentFilter(query),
    _count: { _all: true },
    _sum: { pesoQuilogramas: true },
  });
  const porStatus = Object.values(StatusRastreamento).map((status) => {
    const group = groups.find((item) => item.statusRastreamento === status);
    return {
      status,
      quantidade: group?._count._all ?? 0,
      pesoQuilogramas: (
        group?._sum.pesoQuilogramas ?? new Prisma.Decimal(0)
      ).toFixed(3),
    };
  });
  return {
    porStatus,
    equipamentos: groups.reduce((sum, group) => sum + group._count._all, 0),
    pesoQuilogramas: groups
      .reduce(
        (sum, group) => sum.plus(group._sum.pesoQuilogramas ?? 0),
        new Prisma.Decimal(0),
      )
      .toFixed(3),
  };
}

export async function statusReport(
  db: PrismaClient,
  actor: Actor,
  query: ReportQuery,
) {
  authorize(actor, "consultar");
  const periodo = period(query);
  return db.$transaction(
    async (tx) => ({ periodo, ...(await groupedStatus(tx, query)) }),
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

export async function organizationReport(
  db: PrismaClient,
  actor: Actor,
  id: string,
  query: ReportQuery,
) {
  authorize(actor, "consultar");
  const { inicio, fim } = period(query);
  return db.$transaction(
    async (tx) => {
      const organizacao = await tx.organizacao.findUnique({
        where: { id },
        include: { contrato: true },
      });
      if (!organizacao)
        throw new BusinessError(
          404,
          "NAO_ENCONTRADO",
          "Organização não encontrada.",
        );
      const lotes = await tx.lote.count({
        where: { organizacaoId: id, dataEntrada: { gte: inicio, lte: fim } },
      });
      return {
        organizacao,
        periodo: { inicio, fim },
        lotes,
        ...(await groupedStatus(tx, { ...query, organizacaoId: id })),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

export async function financialReport(
  db: PrismaClient,
  actor: Actor,
  query: ReportQuery,
) {
  authorize(actor, "consultar");
  const { inicio, fim } = period(query);
  return db.$transaction(
    async (tx) => {
      const parametros = await tx.parametrosSistema.findUniqueOrThrow({
        where: { id: 1 },
      });
      const equipment = await tx.equipamento.findMany({
        where: {
          ...equipmentFilter(query),
          statusRastreamento: { not: "BAIXA_DEFINITIVA" },
        },
        select: {
          id: true,
          codigoBarrasInterno: true,
          anoFabricacao: true,
          pesoQuilogramas: true,
        },
        orderBy: { id: "asc" },
      });
      const itens = equipment.map((item) => {
        const idadeAnos = Math.max(
          0,
          fim.getUTCFullYear() - item.anoFabricacao,
        );
        const valorBase = item.pesoQuilogramas.mul(
          parametros.valorBaseQuilograma,
        );
        const fator = Prisma.Decimal.max(
          0,
          new Prisma.Decimal(1).minus(
            parametros.depreciacaoAnual.mul(idadeAnos),
          ),
        );
        return {
          equipamentoId: item.id,
          codigoBarrasInterno: item.codigoBarrasInterno,
          idadeAnos,
          valorBase: valorBase.toFixed(2),
          valorEstimado: valorBase.mul(fator).toFixed(2),
        };
      });
      const bruto = itens.reduce(
        (sum, item) => sum.plus(item.valorEstimado),
        new Prisma.Decimal(0),
      );
      const imposto = bruto.mul(parametros.aliquotaImposto).toDecimalPlaces(2);
      const contratos = await tx.contrato.findMany({
        where: {
          organizacaoId: query.organizacaoId,
          organizacao: { ativo: true },
          dataAssinatura: { lte: fim },
          dataVencimento: { gte: fim },
        },
        select: { valorMensal: true },
      });
      const mensalidades = contratos.reduce(
        (sum, item) => sum.plus(item.valorMensal),
        new Prisma.Decimal(0),
      );
      return {
        periodo: { inicio, fim },
        referencia: fim,
        parametros,
        itens,
        politica:
          "Estimativa linear por peso e idade; não representa venda nem receita recebida.",
        valorEstimadoBruto: bruto.toFixed(2),
        impostoEstimado: imposto.toFixed(2),
        valorEstimadoLiquido: bruto.minus(imposto).toFixed(2),
        receitaMensalContratada: mensalidades.toFixed(2),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
