import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { actorFrom } from "../../plugins/auth.js";
import { DateOnly, NonBlank, PageFields } from "../../shared/schemas.js";
import { listAudit } from "./service.js";

export function registerAuditRoutes(
  instance: FastifyInstance,
  db: PrismaClient,
) {
  instance.withTypeProvider<TypeBoxTypeProvider>().get(
    "/auditoria",
    {
      schema: {
        tags: ["Auditoria"],
        security: [{ bearerAuth: [] }],
        summary: "Consultar alterações (auditor ou administrador)",
        querystring: Type.Object(
          {
            ...PageFields,
            entidade: Type.Optional(NonBlank(40)),
            entidadeId: Type.Optional(NonBlank(100)),
            inicio: Type.Optional(DateOnly),
            fim: Type.Optional(DateOnly),
          },
          { additionalProperties: false },
        ),
      },
    },
    (request) => listAudit(db, actorFrom(request), request.query),
  );
}
