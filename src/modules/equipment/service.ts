import {
  EstadoFisico,
  StatusRastreamento,
  type PrismaClient,
} from "@prisma/client";
import { BusinessError } from "../../shared/errors.js";
import { recordAudit } from "../../shared/audit.js";
import { pagination, type Page } from "../../shared/pagination.js";
import { refreshLotStatus } from "../lots/status.js";
import { authorize, type Actor } from "../../shared/permissions.js";

const transitions: Record<StatusRastreamento, readonly StatusRastreamento[]> = {
  AGUARDANDO_TRIAGEM: ["EM_TRIAGEM"],
  EM_TRIAGEM: ["AGUARDANDO_DESMONTE"],
  AGUARDANDO_DESMONTE: ["EM_DESMONTE"],
  EM_DESMONTE: [
    "PECAS_REAPROVEITADAS",
    "MATERIAL_RECICLAVEL",
    "DESCARTE_SEGURO",
  ],
  PECAS_REAPROVEITADAS: ["BAIXA_DEFINITIVA"],
  MATERIAL_RECICLAVEL: ["BAIXA_DEFINITIVA"],
  DESCARTE_SEGURO: ["BAIXA_DEFINITIVA"],
  BAIXA_DEFINITIVA: [],
};

export async function listEquipment(
  db: PrismaClient,
  actor: Actor,
  query: Page & {
    loteId?: string;
    organizacaoId?: string;
    status?: StatusRastreamento;
    codigoBarrasInterno?: string;
  },
) {
  authorize(actor, "consultar");
  return db.equipamento.findMany({
    where: {
      loteId: query.loteId,
      lote: { organizacaoId: query.organizacaoId },
      statusRastreamento: query.status,
      codigoBarrasInterno: query.codigoBarrasInterno,
    },
    ...pagination(query),
    orderBy: [{ loteId: "asc" }, { posicaoNoLote: "asc" }],
  });
}

const physicalOrder: readonly EstadoFisico[] = [
  "NOVO",
  "BOM_ESTADO",
  "USADO_LEVE",
  "USADO_MODERADO",
  "DANIFICADO_LEVE",
  "DANIFICADO_GRAVE",
  "INSERVIVEL",
];

type MovementInput = {
  versao: number;
  origem: string;
  destino: string;
  statusRastreamento?: StatusRastreamento;
  estadoFisico?: EstadoFisico;
  justificativa?: string;
  observacao?: string;
};

export async function getEquipment(db: PrismaClient, actor: Actor, id: string) {
  authorize(actor, "consultar");
  const equipment = await db.equipamento.findUnique({
    where: { id },
    include: {
      lote: { include: { organizacao: true } },
      movimentacoes: {
        orderBy: { versaoEquipamento: "asc" },
        include: { responsavel: { select: { id: true, email: true } } },
      },
    },
  });
  if (!equipment)
    throw new BusinessError(
      404,
      "NAO_ENCONTRADO",
      "Equipamento não encontrado.",
    );
  return equipment;
}

export async function registerMovement(
  db: PrismaClient,
  actor: Actor,
  id: string,
  input: MovementInput,
) {
  authorize(actor, "operarAlmoxarifado");

  return db.$transaction(async (tx) => {
    const current = await tx.equipamento.findUnique({ where: { id } });
    if (!current)
      throw new BusinessError(
        404,
        "NAO_ENCONTRADO",
        "Equipamento não encontrado.",
      );
    if (current.versao !== input.versao) {
      throw new BusinessError(
        409,
        "VERSAO_DESATUALIZADA",
        "Recarregue o equipamento antes de alterar.",
      );
    }
    if (current.statusRastreamento === "BAIXA_DEFINITIVA") {
      throw new BusinessError(
        422,
        "EQUIPAMENTO_FINALIZADO",
        "Equipamento com baixa definitiva não pode ser alterado.",
      );
    }

    const nextStatus = input.statusRastreamento ?? current.statusRastreamento;
    const nextCondition = input.estadoFisico ?? current.estadoFisico;
    const statusChanged = nextStatus !== current.statusRastreamento;
    if (!statusChanged && nextCondition === current.estadoFisico) {
      throw new BusinessError(
        422,
        "SEM_ALTERACAO",
        "Informe uma mudança de status ou estado físico.",
      );
    }
    if (
      statusChanged &&
      !transitions[current.statusRastreamento].includes(nextStatus)
    ) {
      throw new BusinessError(
        422,
        "TRANSICAO_INVALIDA",
        "Esta transição de status não é permitida.",
      );
    }
    if (nextStatus === "EM_DESMONTE" && !current.triagemConcluidaEm) {
      throw new BusinessError(
        422,
        "TRIAGEM_INCOMPLETA",
        "Conclua a triagem antes do desmonte.",
      );
    }
    const drop =
      physicalOrder.indexOf(nextCondition) -
      physicalOrder.indexOf(current.estadoFisico);
    if (drop >= 2 && !input.justificativa?.trim()) {
      throw new BusinessError(
        422,
        "JUSTIFICATIVA_OBRIGATORIA",
        "Justifique o rebaixamento de duas ou mais categorias.",
      );
    }

    const nextVersion = current.versao + 1;
    const updated = await tx.equipamento.updateMany({
      where: { id, versao: input.versao },
      data: {
        statusRastreamento: nextStatus,
        estadoFisico: nextCondition,
        triagemConcluidaEm:
          statusChanged && nextStatus === "AGUARDANDO_DESMONTE"
            ? new Date()
            : undefined,
        versao: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new BusinessError(
        409,
        "VERSAO_DESATUALIZADA",
        "Outra operação alterou este equipamento.",
      );
    }
    await tx.movimentacao.create({
      data: {
        equipamentoId: id,
        responsavelId: actor.id,
        origem: input.origem.trim(),
        destino: input.destino.trim(),
        justificativa: input.justificativa?.trim(),
        observacao: input.observacao?.trim(),
        statusAnterior: current.statusRastreamento,
        statusNovo: nextStatus,
        estadoFisicoAnterior: current.estadoFisico,
        estadoFisicoNovo: nextCondition,
        versaoEquipamento: nextVersion,
      },
    });
    const after = await tx.equipamento.findUniqueOrThrow({ where: { id } });
    await refreshLotStatus(tx, current.loteId, actor);
    await recordAudit(tx, actor, {
      entidade: "Equipamento",
      entidadeId: id,
      acao: "MOVIMENTAR",
      antes: current,
      depois: after,
    });
    return after;
  });
}
