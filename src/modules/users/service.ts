import { Prisma, type PapelUsuario, type PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { BusinessError } from "../../shared/errors.js";
import { authorize, type Actor } from "../../shared/permissions.js";
import { recordAudit } from "../../shared/audit.js";
import { pagination, type Page } from "../../shared/pagination.js";
import { validatePassword } from "../../shared/passwords.js";

const publicFields = {
  id: true,
  email: true,
  papel: true,
  ativo: true,
  dataCadastro: true,
  versao: true,
} satisfies Prisma.UsuarioSelect;
type UserInput = {
  email: string;
  senha: string;
  papel: PapelUsuario;
  ativo?: boolean;
};

export async function listUsers(db: PrismaClient, actor: Actor, query: Page) {
  authorize(actor, "administrar");
  return db.usuario.findMany({
    select: publicFields,
    ...pagination(query),
    orderBy: { email: "asc" },
  });
}

export async function createUser(
  db: PrismaClient,
  actor: Actor,
  input: UserInput,
) {
  authorize(actor, "administrar");
  validatePassword(input.senha);
  const hashSenha = await hash(input.senha, 12);
  return db.$transaction(async (tx) => {
    const result = await tx.usuario.create({
      data: {
        email: input.email.trim().toLowerCase(),
        papel: input.papel,
        ativo: input.ativo,
        hashSenha,
      },
      select: publicFields,
    });
    await recordAudit(tx, actor, {
      entidade: "Usuario",
      entidadeId: result.id,
      acao: "CRIAR",
      depois: result,
    });
    return result;
  });
}

export async function updateUser(
  db: PrismaClient,
  actor: Actor,
  id: string,
  input: Partial<UserInput> & { versao: number },
) {
  authorize(actor, "administrar");
  if (input.senha) validatePassword(input.senha);
  const hashSenha = input.senha ? await hash(input.senha, 12) : undefined;
  return db.$transaction(
    async (tx) => {
      const before = await tx.usuario.findUnique({
        where: { id },
        select: publicFields,
      });
      if (!before)
        throw new BusinessError(
          404,
          "NAO_ENCONTRADO",
          "Usuário não encontrado.",
        );
      if (before.versao !== input.versao)
        throw new BusinessError(
          409,
          "VERSAO_DESATUALIZADA",
          "Recarregue o usuário.",
        );
      if (
        before.ativo &&
        before.papel === "ADMINISTRADOR" &&
        (input.ativo === false ||
          (input.papel && input.papel !== "ADMINISTRADOR")) &&
        (await tx.usuario.count({
          where: { ativo: true, papel: "ADMINISTRADOR" },
        })) === 1
      ) {
        throw new BusinessError(
          422,
          "ULTIMO_ADMINISTRADOR",
          "Mantenha pelo menos um administrador ativo.",
        );
      }
      const result = await tx.usuario.updateMany({
        where: { id, versao: input.versao },
        data: {
          email: input.email?.trim().toLowerCase(),
          papel: input.papel,
          ativo: input.ativo,
          hashSenha,
          versao: { increment: 1 },
          tokenVersao: { increment: 1 },
        },
      });
      if (result.count !== 1)
        throw new BusinessError(
          409,
          "VERSAO_DESATUALIZADA",
          "Outra operação alterou o usuário.",
        );
      const after = await tx.usuario.findUniqueOrThrow({
        where: { id },
        select: publicFields,
      });
      await recordAudit(tx, actor, {
        entidade: "Usuario",
        entidadeId: id,
        acao: "ALTERAR",
        antes: before,
        depois: { ...after, credenciaisAlteradas: Boolean(hashSenha) },
      });
      return after;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
