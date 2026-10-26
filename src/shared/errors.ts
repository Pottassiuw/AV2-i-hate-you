import { Prisma } from "@prisma/client";
import type { FastifyError, FastifyInstance } from "fastify";

export class BusinessError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error instanceof BusinessError) {
      return reply
        .code(error.statusCode)
        .send({ erro: error.code, mensagem: error.message });
    }

    if (error.validation || error.statusCode === 400) {
      return reply.code(400).send({
        erro: "ENTRADA_INVALIDA",
        mensagem: "Confira os campos e formatos exigidos pela rota.",
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2034") {
        return reply.code(409).send({
          erro: "CONFLITO_CONCORRENTE",
          mensagem:
            "Outra operação alterou os dados. Recarregue e tente novamente.",
        });
      }
      if (error.code === "P2002") {
        return reply.code(409).send({
          erro: "REGISTRO_DUPLICADO",
          mensagem: "CNPJ, código interno ou posição no lote já cadastrado.",
        });
      }
      if (error.code === "P2003" || error.code === "P2025") {
        return reply.code(404).send({
          erro: "NAO_ENCONTRADO",
          mensagem: "Registro relacionado não encontrado.",
        });
      }
    }

    if (error.statusCode === 401) {
      return reply.code(401).send({
        erro: "NAO_AUTENTICADO",
        mensagem: "Token ausente, inválido ou expirado.",
      });
    }

    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({
        erro: "REQUISICAO_INVALIDA",
        mensagem:
          "Requisição não aceita. Confira o tamanho e o tipo de conteúdo.",
      });
    }

    // Não registrar a exceção inteira: erros do ORM podem incluir valores da consulta.
    request.log.error(
      { requestId: request.id, errorName: error.name },
      "Erro inesperado.",
    );
    return reply.code(500).send({
      erro: "ERRO_INTERNO",
      mensagem: "Não foi possível concluir a operação.",
    });
  });
}
