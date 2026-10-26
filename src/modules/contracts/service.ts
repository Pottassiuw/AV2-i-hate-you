import type { PrismaClient } from "@prisma/client";
import { BusinessError } from "../../shared/errors.js";
import { authorize, type Actor } from "../../shared/permissions.js";
import { recordAudit } from "../../shared/audit.js";
import { dateOnly } from "../../shared/dates.js";
import { pagination, type Page } from "../../shared/pagination.js";

type ContractInput = {
  organizacaoId: string;
  dataAssinatura: string;
  dataVencimento: string;
  clausulas: string[];
  valorMensal: number;
  renovacaoAutomatica?: boolean;
};

export async function createContract(
  db: PrismaClient,
  actor: Actor,
  input: ContractInput,
) {
  authorize(actor, "cadastrarOrganizacao");
  const dataAssinatura = dateOnly(input.dataAssinatura);
  const dataVencimento = dateOnly(input.dataVencimento);
  if (dataVencimento < dataAssinatura)
    throw new BusinessError(
      422,
      "VIGENCIA_INVALIDA",
      "O vencimento não pode anteceder a assinatura.",
    );
  return db.$transaction(async (tx) => {
    const org = await tx.organizacao.findUnique({
      where: { id: input.organizacaoId },
    });
    if (!org)
      throw new BusinessError(
        404,
        "NAO_ENCONTRADO",
        "Organização não encontrada.",
      );
    if (!org.ativo)
      throw new BusinessError(
        422,
        "ORGANIZACAO_INATIVA",
        "Organização inativa.",
      );
    const result = await tx.contrato.create({
      data: { ...input, dataAssinatura, dataVencimento },
    });
    await recordAudit(tx, actor, {
      entidade: "Contrato",
      entidadeId: result.id,
      acao: "CRIAR",
      depois: result,
    });
    return result;
  });
}

export async function getContract(db: PrismaClient, actor: Actor, id: string) {
  authorize(actor, "consultar");
  const result = await db.contrato.findUnique({ where: { id } });
  if (!result)
    throw new BusinessError(404, "NAO_ENCONTRADO", "Contrato não encontrado.");
  return result;
}

export async function listContracts(
  db: PrismaClient,
  actor: Actor,
  query: Page & { organizacaoId?: string },
) {
  authorize(actor, "consultar");
  return db.contrato.findMany({
    where: { organizacaoId: query.organizacaoId },
    ...pagination(query),
    orderBy: { id: "asc" },
  });
}

export async function updateContract(
  db: PrismaClient,
  actor: Actor,
  id: string,
  input: Partial<Omit<ContractInput, "organizacaoId">> & { versao: number },
  renew = false,
) {
  authorize(actor, "cadastrarOrganizacao");
  return db.$transaction(async (tx) => {
    const before = await tx.contrato.findUnique({ where: { id } });
    if (!before)
      throw new BusinessError(
        404,
        "NAO_ENCONTRADO",
        "Contrato não encontrado.",
      );
    if (before.versao !== input.versao)
      throw new BusinessError(
        409,
        "VERSAO_DESATUALIZADA",
        "Recarregue o contrato.",
      );
    const dataAssinatura = input.dataAssinatura
      ? dateOnly(input.dataAssinatura)
      : before.dataAssinatura;
    const dataVencimento = input.dataVencimento
      ? dateOnly(input.dataVencimento)
      : before.dataVencimento;
    if (
      dataVencimento < dataAssinatura ||
      (renew && dataVencimento <= before.dataVencimento)
    ) {
      throw new BusinessError(
        422,
        "VIGENCIA_INVALIDA",
        "A renovação deve estender a vigência; vencimento não pode anteceder a assinatura.",
      );
    }
    const { versao, ...changes } = input;
    const result = await tx.contrato.updateMany({
      where: { id, versao },
      data: {
        ...changes,
        dataAssinatura,
        dataVencimento,
        versao: { increment: 1 },
      },
    });
    if (result.count !== 1)
      throw new BusinessError(
        409,
        "VERSAO_DESATUALIZADA",
        "Outra operação alterou o contrato.",
      );
    const after = await tx.contrato.findUniqueOrThrow({ where: { id } });
    await recordAudit(tx, actor, {
      entidade: "Contrato",
      entidadeId: id,
      acao: renew ? "RENOVAR" : "ALTERAR",
      antes: before,
      depois: after,
    });
    return after;
  });
}
