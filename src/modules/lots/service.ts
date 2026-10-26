import type {
  EstadoFisico,
  PrismaClient,
  TipoEquipamento,
  Prisma,
} from "@prisma/client";
import { BusinessError } from "../../shared/errors.js";
import { recordAudit } from "../../shared/audit.js";
import { pagination, type Page } from "../../shared/pagination.js";
import { period } from "../../shared/dates.js";
import { authorize, type Actor } from "../../shared/permissions.js";

type EquipmentInput = {
  codigoBarrasInterno: string;
  tipo: TipoEquipamento;
  marca: string;
  modelo: string;
  anoFabricacao: number;
  estadoFisico: EstadoFisico;
  pesoQuilogramas: number;
};

type LotInput = {
  organizacaoId: string;
  dataEntrada: string;
  notaFiscal: string;
  transportadora: string;
  observacoes?: string;
  equipamentos: EquipmentInput[];
};

function entryDate(value: string) {
  const date = new Date(value + "T00:00:00.000Z");
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new BusinessError(
      422,
      "DATA_INVALIDA",
      "Data de entrada inexistente.",
    );
  }
  const today = new Date(
    new Date().toISOString().slice(0, 10) + "T00:00:00.000Z",
  );
  const oldest = today.getTime() - 90 * 24 * 60 * 60 * 1000;
  if (date > today || date.getTime() < oldest) {
    throw new BusinessError(
      422,
      "DATA_FORA_DO_INTERVALO",
      "A entrada deve estar entre hoje e 90 dias atrás.",
    );
  }
  return date;
}

export async function createLot(
  db: PrismaClient,
  actor: Actor,
  input: LotInput,
) {
  authorize(actor, "operarAlmoxarifado");
  const dataEntrada = entryDate(input.dataEntrada);
  if (input.equipamentos.length === 0 || input.equipamentos.length > 100) {
    throw new BusinessError(
      422,
      "QUANTIDADE_INVALIDA",
      "O lote deve conter de 1 a 100 equipamentos.",
    );
  }
  if (
    input.equipamentos.some(
      (item) => item.anoFabricacao > new Date().getUTCFullYear(),
    )
  ) {
    throw new BusinessError(
      422,
      "ANO_INVALIDO",
      "O ano de fabricação não pode ser futuro.",
    );
  }

  return db.$transaction(async (tx) => {
    const organization = await tx.organizacao.findUnique({
      where: { id: input.organizacaoId },
    });
    if (!organization)
      throw new BusinessError(
        404,
        "NAO_ENCONTRADO",
        "Organização não encontrada.",
      );
    if (!organization.ativo)
      throw new BusinessError(
        422,
        "ORGANIZACAO_INATIVA",
        "A organização está inativa.",
      );

    const result = await tx.lote.create({
      data: {
        organizacaoId: input.organizacaoId,
        dataEntrada,
        notaFiscal: input.notaFiscal.trim(),
        transportadora: input.transportadora.trim(),
        observacoes: input.observacoes?.trim(),
        equipamentos: {
          create: input.equipamentos.map((item, index) =>
            equipmentData(item, index + 1, actor),
          ),
        },
      },
      include: { equipamentos: { orderBy: { posicaoNoLote: "asc" } } },
    });
    await recordAudit(tx, actor, {
      entidade: "Lote",
      entidadeId: result.id,
      acao: "RECEBER",
      depois: result,
    });
    return result;
  });
}

function equipmentData(
  item: EquipmentInput,
  posicaoNoLote: number,
  actor: Actor,
): Prisma.EquipamentoCreateWithoutLoteInput {
  return {
    ...item,
    codigoBarrasInterno: item.codigoBarrasInterno.trim(),
    posicaoNoLote,
    movimentacoes: {
      create: {
        origem: "ORGANIZACAO",
        destino: "ALMOXARIFADO",
        responsavelId: actor.id,
        statusNovo: "AGUARDANDO_TRIAGEM",
        estadoFisicoNovo: item.estadoFisico,
        versaoEquipamento: 0,
        observacao: "Recebimento do equipamento no lote.",
      },
    },
  };
}

export async function listLots(
  db: PrismaClient,
  actor: Actor,
  query: Page & { organizacaoId?: string; inicio?: string; fim?: string } = {},
) {
  authorize(actor, "consultar");
  const { inicio, fim } = period(query);
  return db.lote.findMany({
    where: {
      organizacaoId: query.organizacaoId,
      dataEntrada: { gte: inicio, lte: fim },
    },
    ...pagination(query),
    orderBy: [{ dataEntrada: "desc" }, { id: "asc" }],
  });
}

export async function getLot(db: PrismaClient, actor: Actor, id: string) {
  authorize(actor, "consultar");
  const lot = await db.lote.findUnique({
    where: { id },
    include: { equipamentos: { orderBy: { posicaoNoLote: "asc" } } },
  });
  if (!lot)
    throw new BusinessError(404, "NAO_ENCONTRADO", "Lote não encontrado.");
  return lot;
}

export async function addEquipment(
  db: PrismaClient,
  actor: Actor,
  id: string,
  input: { versao: number; equipamentos: EquipmentInput[] },
) {
  authorize(actor, "operarAlmoxarifado");
  if (
    input.equipamentos.some(
      (item) => item.anoFabricacao > new Date().getUTCFullYear(),
    )
  ) {
    throw new BusinessError(
      422,
      "ANO_INVALIDO",
      "O ano de fabricação não pode ser futuro.",
    );
  }
  return db.$transaction(async (tx) => {
    const exists = await tx.lote.findUnique({ where: { id } });
    if (!exists)
      throw new BusinessError(404, "NAO_ENCONTRADO", "Lote não encontrado.");
    const changed = await tx.lote.updateMany({
      where: { id, versao: input.versao },
      data: { versao: { increment: 1 } },
    });
    if (changed.count !== 1)
      throw new BusinessError(
        409,
        "VERSAO_DESATUALIZADA",
        "Recarregue o lote.",
      );
    const lot = await tx.lote.findUniqueOrThrow({
      where: { id },
      include: { organizacao: true, equipamentos: true },
    });
    if (lot.statusProcessamento !== "RECEBIDO" || !lot.organizacao.ativo) {
      throw new BusinessError(
        422,
        "LOTE_FECHADO_PARA_RECEBIMENTO",
        "Só é possível incluir itens antes de iniciar a triagem, para organização ativa.",
      );
    }
    if (lot.equipamentos.length + input.equipamentos.length > 100)
      throw new BusinessError(
        422,
        "QUANTIDADE_INVALIDA",
        "Máximo de 100 equipamentos por lote.",
      );
    await tx.lote.update({
      where: { id },
      data: {
        equipamentos: {
          create: input.equipamentos.map((item, index) =>
            equipmentData(item, lot.equipamentos.length + index + 1, actor),
          ),
        },
      },
    });
    const result = await tx.lote.findUniqueOrThrow({
      where: { id },
      include: { equipamentos: { orderBy: { posicaoNoLote: "asc" } } },
    });
    await recordAudit(tx, actor, {
      entidade: "Lote",
      entidadeId: id,
      acao: "INCLUIR_EQUIPAMENTOS",
      depois: result,
    });
    return result;
  });
}

export async function updateLot(
  db: PrismaClient,
  actor: Actor,
  id: string,
  input: {
    versao: number;
    dataEntrada?: string;
    notaFiscal?: string;
    transportadora?: string;
    observacoes?: string;
  },
) {
  authorize(actor, "operarAlmoxarifado");
  const dataEntrada = input.dataEntrada
    ? entryDate(input.dataEntrada)
    : undefined;
  return db.$transaction(async (tx) => {
    const before = await tx.lote.findUnique({ where: { id } });
    if (!before)
      throw new BusinessError(404, "NAO_ENCONTRADO", "Lote não encontrado.");
    if (before.statusProcessamento === "FINALIZADO")
      throw new BusinessError(
        422,
        "LOTE_FINALIZADO",
        "Lote finalizado não pode ser alterado.",
      );
    const { versao, ...changes } = input;
    const changed = await tx.lote.updateMany({
      where: { id, versao },
      data: { ...changes, dataEntrada, versao: { increment: 1 } },
    });
    if (changed.count !== 1)
      throw new BusinessError(
        409,
        "VERSAO_DESATUALIZADA",
        "Recarregue o lote.",
      );
    const after = await tx.lote.findUniqueOrThrow({ where: { id } });
    await recordAudit(tx, actor, {
      entidade: "Lote",
      entidadeId: id,
      acao: "ALTERAR",
      antes: before,
      depois: after,
    });
    return after;
  });
}
