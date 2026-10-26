import { PapelUsuario, type PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { actorFrom } from "../../plugins/auth.js";
import {
  Email,
  IdParams,
  Password,
  PageQuery,
  Version,
} from "../../shared/schemas.js";
import { createUser, listUsers, updateUser } from "./service.js";

export function registerUserRoutes(
  instance: FastifyInstance,
  db: PrismaClient,
) {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const base = { tags: ["Usuários"], security: [{ bearerAuth: [] }] };
  const fields = {
    email: Email,
    senha: Password,
    papel: Type.Enum(PapelUsuario),
    ativo: Type.Optional(Type.Boolean()),
  };
  app.get(
    "/usuarios",
    {
      schema: {
        ...base,
        summary: "Listar contas (administrador)",
        querystring: PageQuery,
      },
    },
    (request) => listUsers(db, actorFrom(request), request.query),
  );
  app.post(
    "/usuarios",
    {
      schema: {
        ...base,
        summary: "Criar conta (administrador)",
        body: Type.Object(fields, { additionalProperties: false }),
      },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(await createUser(db, actorFrom(request), request.body)),
  );
  app.patch(
    "/usuarios/:id",
    {
      schema: {
        ...base,
        summary: "Alterar conta e revogar tokens (administrador)",
        params: IdParams,
        body: Type.Object(
          { ...Type.Partial(Type.Object(fields)).properties, versao: Version },
          { additionalProperties: false, minProperties: 2 },
        ),
      },
    },
    (request) =>
      updateUser(db, actorFrom(request), request.params.id, request.body),
  );
}
