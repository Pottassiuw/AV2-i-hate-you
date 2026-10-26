import type { PrismaClient } from "@prisma/client";
import { BusinessError } from "../../shared/errors.js";
import { recordAudit } from "../../shared/audit.js";
import { pagination, type Page } from "../../shared/pagination.js";
import { authorize, type Actor } from "../../shared/permissions.js";

type CreateOrganization = {
  razaoSocial: string;
  cnpj: string;
  inscricaoEstadual?: string;
  enderecoCompleto: string;
  telefone: string;
  email: string;
};

function normalizeCnpj(input: string) {
  const normalized = input.toUpperCase();
  if (
    !/^([A-Z0-9]{12}\d{2}|[A-Z0-9]{2}\.[A-Z0-9]{3}\.[A-Z0-9]{3}\/[A-Z0-9]{4}-\d{2})$/.test(
      normalized,
    )
  ) {
    throw new BusinessError(
      422,
      "CNPJ_INVALIDO",
      "Informe um CNPJ válido de 14 posições.",
    );
  }
  const cnpj = normalized.replace(/[.\/-]/g, "");
  // Caracteres do corpo: valor ASCII menos 48. Os dois verificadores continuam numéricos.
  const digits = [...cnpj].map((character) => character.charCodeAt(0) - 48);
  const digit = (base: number[], weights: number[]) => {
    const sum = base.reduce(
      (total, value, index) => total + value * weights[index]!,
      0,
    );
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  if (
    /^(\d)\1{13}$/.test(cnpj) ||
    digit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) !==
      digits[12] ||
    digit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) !==
      digits[13]
  ) {
    throw new BusinessError(
      422,
      "CNPJ_INVALIDO",
      "Os dígitos verificadores do CNPJ são inválidos.",
    );
  }
  return cnpj;
}

export async function createOrganization(
  db: PrismaClient,
  actor: Actor,
  input: CreateOrganization,
) {
  authorize(actor, "cadastrarOrganizacao");
  return db.$transaction(async (tx) => {
    const result = await tx.organizacao.create({
      data: {
        ...input,
        razaoSocial: input.razaoSocial.trim(),
        cnpj: normalizeCnpj(input.cnpj),
        email: input.email.trim().toLowerCase(),
      },
    });
    await recordAudit(tx, actor, {
      entidade: "Organizacao",
      entidadeId: result.id,
      acao: "CRIAR",
      depois: result,
    });
    return result;
  });
}

export async function listOrganizations(
  db: PrismaClient,
  actor: Actor,
  query: Page = {},
) {
  authorize(actor, "consultar");
  return db.organizacao.findMany({
    ...pagination(query),
    orderBy: [{ dataCadastro: "asc" }, { id: "asc" }],
  });
}

export async function getOrganization(
  db: PrismaClient,
  actor: Actor,
  id: string,
) {
  authorize(actor, "consultar");
  const organization = await db.organizacao.findUnique({
    where: { id },
    include: { contrato: true },
  });
  if (!organization)
    throw new BusinessError(
      404,
      "NAO_ENCONTRADO",
      "Organização não encontrada.",
    );
  return organization;
}

export async function updateOrganization(
  db: PrismaClient,
  actor: Actor,
  id: string,
  input: Partial<CreateOrganization> & { ativo?: boolean; versao: number },
) {
  authorize(actor, "cadastrarOrganizacao");
  return db.$transaction(async (tx) => {
    const before = await tx.organizacao.findUnique({ where: { id } });
    if (!before)
      throw new BusinessError(
        404,
        "NAO_ENCONTRADO",
        "Organização não encontrada.",
      );
    const { versao, ...changes } = input;
    const result = await tx.organizacao.updateMany({
      where: { id, versao },
      data: {
        ...changes,
        cnpj: input.cnpj ? normalizeCnpj(input.cnpj) : undefined,
        email: input.email?.trim().toLowerCase(),
        versao: { increment: 1 },
      },
    });
    if (result.count !== 1)
      throw new BusinessError(
        409,
        "VERSAO_DESATUALIZADA",
        "Recarregue a organização.",
      );
    const after = await tx.organizacao.findUniqueOrThrow({ where: { id } });
    await recordAudit(tx, actor, {
      entidade: "Organizacao",
      entidadeId: id,
      acao: "ALTERAR",
      antes: before,
      depois: after,
    });
    return after;
  });
}
