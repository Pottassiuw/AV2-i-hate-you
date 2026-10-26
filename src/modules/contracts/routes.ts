import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { actorFrom } from "../../plugins/auth.js";
import {
  DateOnly,
  IdParams,
  Money,
  NonBlank,
  PageFields,
  Version,
} from "../../shared/schemas.js";
import {
  createContract,
  getContract,
  listContracts,
  updateContract,
} from "./service.js";

export function registerContractRoutes(
  instance: FastifyInstance,
  db: PrismaClient,
) {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const base = { tags: ["Contratos"], security: [{ bearerAuth: [] }] };
  const fields = {
    dataAssinatura: DateOnly,
    dataVencimento: DateOnly,
    valorMensal: Money,
    clausulas: Type.Array(NonBlank(1000), { maxItems: 50 }),
    renovacaoAutomatica: Type.Optional(Type.Boolean()),
  };
  app.post(
    "/contratos",
    {
      schema: {
        ...base,
        summary: "Cadastrar contrato único da organização",
        body: Type.Object(
          { organizacaoId: Type.String({ format: "uuid" }), ...fields },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(await createContract(db, actorFrom(request), request.body)),
  );
  app.get(
    "/contratos",
    {
      schema: {
        ...base,
        summary: "Listar contratos",
        querystring: Type.Object(
          {
            ...PageFields,
            organizacaoId: Type.Optional(Type.String({ format: "uuid" })),
          },
          { additionalProperties: false },
        ),
      },
    },
    (request) => listContracts(db, actorFrom(request), request.query),
  );
  app.get(
    "/contratos/:id",
    { schema: { ...base, summary: "Consultar contrato", params: IdParams } },
    (request) => getContract(db, actorFrom(request), request.params.id),
  );
  app.patch(
    "/contratos/:id",
    {
      schema: {
        ...base,
        summary: "Alterar contrato com versão",
        params: IdParams,
        body: Type.Object(
          { ...Type.Partial(Type.Object(fields)).properties, versao: Version },
          { additionalProperties: false, minProperties: 2 },
        ),
      },
    },
    (request) =>
      updateContract(db, actorFrom(request), request.params.id, request.body),
  );
  app.post(
    "/contratos/:id/renovacao",
    {
      schema: {
        ...base,
        summary: "Renovar estendendo a vigência",
        params: IdParams,
        body: Type.Object(
          { versao: Version, dataVencimento: DateOnly },
          { additionalProperties: false },
        ),
      },
    },
    (request) =>
      updateContract(
        db,
        actorFrom(request),
        request.params.id,
        request.body,
        true,
      ),
  );
}
