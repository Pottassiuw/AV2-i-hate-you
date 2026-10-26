import type { PrismaClient } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { recordAudit } from "../../shared/audit.js";
import { validatePassword } from "../../shared/passwords.js";
import type { Actor } from "../../shared/permissions.js";
import { BusinessError } from "../../shared/errors.js";

export async function login(db: PrismaClient, email: string, senha: string) {
  const user = await db.usuario.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (
    !user?.ativo ||
    Buffer.byteLength(senha, "utf8") > 72 ||
    !(await compare(senha, user.hashSenha))
  ) {
    throw new BusinessError(
      401,
      "CREDENCIAIS_INVALIDAS",
      "E-mail ou senha inválidos.",
    );
  }
  return {
    id: user.id,
    email: user.email,
    papel: user.papel,
    versao: user.versao,
    tokenVersao: user.tokenVersao,
  };
}

export async function currentUser(db: PrismaClient, actor: Actor) {
  return db.usuario.findUniqueOrThrow({
    where: { id: actor.id },
    select: { id: true, email: true, papel: true, ativo: true, versao: true },
  });
}

export async function changePassword(
  db: PrismaClient,
  actor: Actor,
  input: { versao: number; senhaAtual: string; novaSenha: string },
) {
  validatePassword(input.novaSenha);
  const user = await db.usuario.findUniqueOrThrow({ where: { id: actor.id } });
  if (
    Buffer.byteLength(input.senhaAtual, "utf8") > 72 ||
    !(await compare(input.senhaAtual, user.hashSenha))
  ) {
    throw new BusinessError(
      401,
      "CREDENCIAIS_INVALIDAS",
      "Senha atual incorreta.",
    );
  }
  const hashSenha = await hash(input.novaSenha, 12);
  await db.$transaction(async (tx) => {
    const changed = await tx.usuario.updateMany({
      where: { id: actor.id, versao: input.versao },
      data: {
        hashSenha,
        versao: { increment: 1 },
        tokenVersao: { increment: 1 },
      },
    });
    if (changed.count !== 1)
      throw new BusinessError(
        409,
        "VERSAO_DESATUALIZADA",
        "Recarregue seu cadastro.",
      );
    await recordAudit(tx, actor, {
      entidade: "Usuario",
      entidadeId: actor.id,
      acao: "TROCAR_SENHA",
      depois: { credenciaisAlteradas: true },
    });
  });
}

export async function logout(db: PrismaClient, actor: Actor) {
  await db.$transaction(async (tx) => {
    await tx.usuario.update({
      where: { id: actor.id },
      data: { tokenVersao: { increment: 1 } },
    });
    await recordAudit(tx, actor, {
      entidade: "Usuario",
      entidadeId: actor.id,
      acao: "SAIR",
    });
  });
}
