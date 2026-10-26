import type { Prisma } from "@prisma/client";
import type { Actor } from "./permissions.js";

// O chamador passa apenas campos permitidos. Credenciais nunca entram aqui.
export async function recordAudit(
  tx: Prisma.TransactionClient,
  actor: Actor,
  entry: {
    entidade: string;
    entidadeId: string;
    acao: string;
    antes?: unknown;
    depois?: unknown;
  },
) {
  return tx.registroAuditoria.create({
    data: {
      responsavelId: actor.id,
      entidade: entry.entidade,
      entidadeId: entry.entidadeId,
      acao: entry.acao,
      antes:
        entry.antes === undefined
          ? undefined
          : JSON.parse(JSON.stringify(entry.antes)),
      depois:
        entry.depois === undefined
          ? undefined
          : JSON.parse(JSON.stringify(entry.depois)),
    },
  });
}
