import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { actorFrom } from "../../plugins/auth.js";
import { Money, Version } from "../../shared/schemas.js";
import { getSettings, updateSettings } from "./service.js";

export function registerSettingsRoutes(
  instance: FastifyInstance,
  db: PrismaClient,
) {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const base = { tags: ["Parâmetros"], security: [{ bearerAuth: [] }] };
  app.get(
    "/parametros",
    { schema: { ...base, summary: "Consultar parâmetros financeiros" } },
    (request) => getSettings(db, actorFrom(request)),
  );
  const rate = Type.Number({ minimum: 0, maximum: 1, multipleOf: 0.0001 });
  app.patch(
    "/parametros",
    {
      schema: {
        ...base,
        summary: "Alterar parâmetros (administrador)",
        body: Type.Object(
          {
            versao: Version,
            aliquotaImposto: Type.Optional(rate),
            depreciacaoAnual: Type.Optional(rate),
            valorBaseQuilograma: Type.Optional(Money),
          },
          { additionalProperties: false, minProperties: 2 },
        ),
      },
    },
    (request) => updateSettings(db, actorFrom(request), request.body),
  );
}
