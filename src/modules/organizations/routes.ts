import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { actorFrom } from "../../plugins/auth.js";
import {
  Email,
  IdParams,
  NonBlank,
  PageQuery,
  Version,
} from "../../shared/schemas.js";
import {
  createOrganization,
  getOrganization,
  listOrganizations,
  updateOrganization,
} from "./service.js";

export function registerOrganizationRoutes(
  instance: FastifyInstance,
  db: PrismaClient,
) {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const baseSchema = { tags: ["Organizações"], security: [{ bearerAuth: [] }] };

  app.post(
    "/organizacoes",
    {
      schema: {
        ...baseSchema,
        summary: "Cadastrar organização (administrador ou cadastro)",
        body: Type.Object(
          {
            razaoSocial: NonBlank(200),
            cnpj: Type.String({ minLength: 14, maxLength: 18 }),
            inscricaoEstadual: Type.Optional(NonBlank(30)),
            enderecoCompleto: NonBlank(500),
            telefone: NonBlank(30),
            email: Email,
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      const result = await createOrganization(
        db,
        actorFrom(request),
        request.body,
      );
      return reply.code(201).send(result);
    },
  );

  app.get(
    "/organizacoes",
    {
      schema: {
        ...baseSchema,
        summary: "Listar organizações com paginação",
        querystring: PageQuery,
      },
    },
    (request) => listOrganizations(db, actorFrom(request), request.query),
  );

  app.get(
    "/organizacoes/:id",
    {
      schema: {
        ...baseSchema,
        summary: "Consultar organização e contrato",
        params: IdParams,
      },
    },
    (request) => getOrganization(db, actorFrom(request), request.params.id),
  );
  app.patch(
    "/organizacoes/:id",
    {
      schema: {
        ...baseSchema,
        summary: "Alterar ou desativar organização com versão",
        params: IdParams,
        body: Type.Object(
          {
            versao: Version,
            razaoSocial: Type.Optional(NonBlank(200)),
            cnpj: Type.Optional(Type.String({ minLength: 14, maxLength: 18 })),
            inscricaoEstadual: Type.Optional(NonBlank(30)),
            enderecoCompleto: Type.Optional(NonBlank(500)),
            telefone: Type.Optional(NonBlank(30)),
            email: Type.Optional(Email),
            ativo: Type.Optional(Type.Boolean()),
          },
          { additionalProperties: false, minProperties: 2 },
        ),
      },
    },
    (request) =>
      updateOrganization(
        db,
        actorFrom(request),
        request.params.id,
        request.body,
      ),
  );
}
