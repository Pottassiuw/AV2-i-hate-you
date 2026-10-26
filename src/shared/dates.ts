import { BusinessError } from "./errors.js";

export function dateOnly(value: string) {
  const date = new Date(value + "T00:00:00.000Z");
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new BusinessError(422, "DATA_INVALIDA", "Data inexistente.");
  }
  return date;
}

export function period(input: { inicio?: string; fim?: string }) {
  const inicio = dateOnly(input.inicio ?? "1900-01-01");
  const fim = dateOnly(input.fim ?? new Date().toISOString().slice(0, 10));
  if (inicio > fim)
    throw new BusinessError(
      422,
      "PERIODO_INVALIDO",
      "O início deve ser anterior ou igual ao fim.",
    );
  return { inicio, fim };
}
