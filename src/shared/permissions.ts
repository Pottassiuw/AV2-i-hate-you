import { PapelUsuario } from "@prisma/client";
import { BusinessError } from "./errors.js";

export type Actor = { id: string; papel: PapelUsuario };
type Operation =
  | "consultar"
  | "cadastrarOrganizacao"
  | "operarAlmoxarifado"
  | "administrar"
  | "auditar";

export function authorize(actor: Actor, operation: Operation) {
  if (actor.papel === PapelUsuario.ADMINISTRADOR || operation === "consultar")
    return;

  const allowedRole =
    operation === "cadastrarOrganizacao"
      ? PapelUsuario.OPERADOR_CADASTRO
      : operation === "operarAlmoxarifado"
        ? PapelUsuario.OPERADOR_ALMOXARIFADO
        : operation === "auditar"
          ? PapelUsuario.AUDITOR
          : PapelUsuario.ADMINISTRADOR;

  if (actor.papel !== allowedRole) {
    throw new BusinessError(
      403,
      "SEM_PERMISSAO",
      "Seu papel não permite esta operação.",
    );
  }
}
