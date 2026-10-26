import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { actorFrom } from "../../plugins/auth.js";
import { DateOnly, IdParams, PeriodFields } from "../../shared/schemas.js";
import {
  financialReport,
  organizationReport,
  statusReport,
} from "./service.js";

export function registerReportRoutes(
  instance: FastifyInstance,
  db: PrismaClient,
) {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const base = { tags: ["Relatórios"], security: [{ bearerAuth: [] }] };
  const querystring = Type.Object(PeriodFields, {
    additionalProperties: false,
  });
  app.get(
    "/relatorios/status",
    {
      schema: {
        ...base,
        summary: "Resumo por status de equipamentos recebidos no período",
        querystring,
      },
    },
    (request) => statusReport(db, actorFrom(request), request.query),
  );
  app.get(
    "/relatorios/financeiro",
    {
      schema: {
        ...base,
        summary: "Estimativa financeira e mensalidades vigentes",
        querystring,
      },
    },
    (request) => financialReport(db, actorFrom(request), request.query),
  );
  app.get(
    "/relatorios/organizacoes/:id",
    {
      schema: {
        ...base,
        summary: "Resumo da organização no período",
        params: IdParams,
        querystring: Type.Object(
          { inicio: Type.Optional(DateOnly), fim: Type.Optional(DateOnly) },
          { additionalProperties: false },
        ),
      },
    },
    (request) =>
      organizationReport(
        db,
        actorFrom(request),
        request.params.id,
        request.query,
      ),
  );
}
