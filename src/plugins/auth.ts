import type { PapelUsuario, PrismaClient } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Actor } from "../shared/permissions.js";
import { BusinessError } from "../shared/errors.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; papel: PapelUsuario; tokenVersao: number };
    user: { sub: string; papel: PapelUsuario; tokenVersao: number };
  }
}

export function registerAuthentication(app: FastifyInstance, db: PrismaClient) {
  app.addHook("onRequest", async (request) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new BusinessError(
        401,
        "NAO_AUTENTICADO",
        "Token ausente, inválido ou expirado.",
      );
    }

    const user = await db.usuario.findUnique({
      where: { id: request.user.sub },
      select: { papel: true, ativo: true, tokenVersao: true },
    });
    if (!user?.ativo || user.tokenVersao !== request.user.tokenVersao) {
      throw new BusinessError(
        401,
        "NAO_AUTENTICADO",
        "Usuário não está ativo.",
      );
    }
    request.user.papel = user.papel;
  });
}

export function actorFrom(request: FastifyRequest): Actor {
  return { id: request.user.sub, papel: request.user.papel };
}
