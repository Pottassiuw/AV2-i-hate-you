import type { PrismaClient } from "@prisma/client";
import { authorize, type Actor } from "../../shared/permissions.js";
import { pagination, type Page } from "../../shared/pagination.js";
import { period } from "../../shared/dates.js";

export async function listAudit(
  db: PrismaClient,
  actor: Actor,
  query: Page & {
    entidade?: string;
    entidadeId?: string;
    inicio?: string;
    fim?: string;
  },
) {
  authorize(actor, "auditar");
  const { inicio, fim } = period(query);
  const endExclusive = new Date(fim);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return db.registroAuditoria.findMany({
    where: {
      entidade: query.entidade,
      entidadeId: query.entidadeId,
      dataHora: { gte: inicio, lt: endExclusive },
    },
    ...pagination(query),
    orderBy: [{ dataHora: "desc" }, { id: "desc" }],
    include: { responsavel: { select: { id: true, email: true } } },
  });
}
