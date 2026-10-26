import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { Email, Password, Version } from "../../shared/schemas.js";
import { actorFrom } from "../../plugins/auth.js";
import { changePassword, currentUser, login, logout } from "./service.js";

export function registerAuthRoutes(app: FastifyInstance, db: PrismaClient) {
  app.withTypeProvider<TypeBoxTypeProvider>().post(
    "/auth/login",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        tags: ["Autenticação"],
        summary: "Entrar e obter um token válido por 30 minutos",
        body: Type.Object(
          {
            email: Email,
            senha: Type.String({ minLength: 1, maxLength: 128 }),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request) => {
      const { tokenVersao, ...usuario } = await login(
        db,
        request.body.email,
        request.body.senha,
      );
      const token = app.jwt.sign({
        sub: usuario.id,
        papel: usuario.papel,
        tokenVersao,
      });
      return { token, tipo: "Bearer", expiraEmSegundos: 1800, usuario };
    },
  );
}

export function registerPrivateAuthRoutes(
  instance: FastifyInstance,
  db: PrismaClient,
) {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const base = { tags: ["Autenticação"], security: [{ bearerAuth: [] }] };
  app.get(
    "/auth/me",
    { schema: { ...base, summary: "Consultar o próprio cadastro" } },
    (request) => currentUser(db, actorFrom(request)),
  );
  app.post(
    "/auth/senha",
    {
      schema: {
        ...base,
        summary: "Trocar a própria senha e revogar tokens",
        body: Type.Object(
          {
            versao: Version,
            senhaAtual: Type.String({ minLength: 1, maxLength: 128 }),
            novaSenha: Password,
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      await changePassword(db, actorFrom(request), request.body);
      return reply.code(204).send();
    },
  );
  app.post(
    "/auth/logout",
    {
      schema: { ...base, summary: "Revogar todos os tokens da própria conta" },
    },
    async (request, reply) => {
      await logout(db, actorFrom(request));
      return reply.code(204).send();
    },
  );
}
