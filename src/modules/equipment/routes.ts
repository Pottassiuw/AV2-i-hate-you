import {
  EstadoFisico,
  StatusRastreamento,
  type PrismaClient,
} from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { actorFrom } from "../../plugins/auth.js";
import { IdParams, NonBlank, PageFields } from "../../shared/schemas.js";
import { getEquipment, listEquipment, registerMovement } from "./service.js";

export function registerEquipmentRoutes(
  instance: FastifyInstance,
  db: PrismaClient,
) {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const baseSchema = { tags: ["Equipamentos"], security: [{ bearerAuth: [] }] };

  app.get(
    "/equipamentos",
    {
      schema: {
        ...baseSchema,
        summary: "Listar e filtrar equipamentos",
        querystring: Type.Object(
          {
            ...PageFields,
            loteId: Type.Optional(Type.String({ format: "uuid" })),
            organizacaoId: Type.Optional(Type.String({ format: "uuid" })),
            status: Type.Optional(Type.Enum(StatusRastreamento)),
            codigoBarrasInterno: Type.Optional(NonBlank(80)),
          },
          { additionalProperties: false },
        ),
      },
    },
    (request) => listEquipment(db, actorFrom(request), request.query),
  );

  app.get(
    "/equipamentos/:id",
    {
      schema: {
        ...baseSchema,
        summary: "Consultar equipamento e histórico ordenado",
        params: IdParams,
      },
    },
    (request) => getEquipment(db, actorFrom(request), request.params.id),
  );

  app.post(
    "/equipamentos/:id/movimentacoes",
    {
      schema: {
        ...baseSchema,
        summary:
          "Alterar estado/status e registrar histórico (administrador ou almoxarifado)",
        params: IdParams,
        body: Type.Object(
          {
            versao: Type.Integer({ minimum: 0 }),
            origem: NonBlank(200),
            destino: NonBlank(200),
            statusRastreamento: Type.Optional(Type.Enum(StatusRastreamento)),
            estadoFisico: Type.Optional(Type.Enum(EstadoFisico)),
            justificativa: Type.Optional(NonBlank(2000)),
            observacao: Type.Optional(NonBlank(2000)),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      const result = await registerMovement(
        db,
        actorFrom(request),
        request.params.id,
        request.body,
      );
      return reply.code(201).send(result);
    },
  );
}
