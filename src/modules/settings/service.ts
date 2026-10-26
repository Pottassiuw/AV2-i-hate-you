import type { PrismaClient } from "@prisma/client";
import { authorize, type Actor } from "../../shared/permissions.js";
import { recordAudit } from "../../shared/audit.js";
import { BusinessError } from "../../shared/errors.js";

export async function getSettings(db: PrismaClient, actor: Actor) {
  authorize(actor, "consultar");
  return db.parametrosSistema.findUniqueOrThrow({ where: { id: 1 } });
}

export async function updateSettings(
  db: PrismaClient,
  actor: Actor,
  input: {
    versao: number;
    aliquotaImposto?: number;
    depreciacaoAnual?: number;
    valorBaseQuilograma?: number;
  },
) {
  authorize(actor, "administrar");
  return db.$transaction(async (tx) => {
    const before = await tx.parametrosSistema.findUniqueOrThrow({
      where: { id: 1 },
    });
    const { versao, ...changes } = input;
    const result = await tx.parametrosSistema.updateMany({
      where: { id: 1, versao },
      data: { ...changes, versao: { increment: 1 } },
    });
    if (result.count !== 1)
      throw new BusinessError(
        409,
        "VERSAO_DESATUALIZADA",
        "Recarregue os parâmetros.",
      );
    const after = await tx.parametrosSistema.findUniqueOrThrow({
      where: { id: 1 },
    });
    await recordAudit(tx, actor, {
      entidade: "ParametrosSistema",
      entidadeId: "1",
      acao: "ALTERAR",
      antes: before,
      depois: after,
    });
    return after;
  });
}
