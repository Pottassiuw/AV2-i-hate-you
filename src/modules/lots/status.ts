import type { Prisma, StatusLote } from "@prisma/client";
import type { Actor } from "../../shared/permissions.js";
import { recordAudit } from "../../shared/audit.js";

// Serializa o recálculo por lote; não há lock global nem atualização perdida do agregado.
export async function refreshLotStatus(
  tx: Prisma.TransactionClient,
  loteId: string,
  actor: Actor,
) {
  const locked = await tx.lote.update({
    where: { id: loteId },
    data: { versao: { increment: 1 } },
  });
  const before = { ...locked, versao: locked.versao - 1 };
  const items = await tx.equipamento.findMany({
    where: { loteId },
    select: { statusRastreamento: true },
  });
  const statuses = items.map((item) => item.statusRastreamento);
  let status: StatusLote;
  if (statuses.every((s) => s === "BAIXA_DEFINITIVA")) status = "FINALIZADO";
  else if (statuses.every((s) => s === "AGUARDANDO_TRIAGEM"))
    status = "RECEBIDO";
  else if (
    statuses.some((s) => s === "AGUARDANDO_TRIAGEM" || s === "EM_TRIAGEM")
  )
    status = "EM_TRIAGEM";
  else if (statuses.some((s) => s === "AGUARDANDO_DESMONTE"))
    status = "TRIAGEM_CONCLUIDA";
  else status = "ENCAMINHADO";
  const after = await tx.lote.update({
    where: { id: loteId },
    data: { statusProcessamento: status },
  });
  await recordAudit(tx, actor, {
    entidade: "Lote",
    entidadeId: loteId,
    acao: "RECALCULAR_STATUS",
    antes: before,
    depois: after,
  });
  return after;
}
