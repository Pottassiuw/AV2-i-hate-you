import { Type } from "@sinclair/typebox";

export const IdParams = Type.Object(
  { id: Type.String({ format: "uuid" }) },
  { additionalProperties: false },
);
export const Email = Type.String({ format: "email", maxLength: 254 });
export const NonBlank = (maxLength: number) =>
  Type.String({ minLength: 1, maxLength, pattern: "\\S" });
export const DateOnly = Type.String({ format: "date" });
export const Version = Type.Integer({ minimum: 0, maximum: 2147483646 });
export const PageFields = {
  pagina: Type.Optional(Type.String({ pattern: "^[1-9][0-9]{0,5}$" })),
  limite: Type.Optional(Type.String({ pattern: "^([1-9]|[1-9][0-9]|100)$" })),
};
export const PageQuery = Type.Object(PageFields, {
  additionalProperties: false,
});
export const Money = Type.Number({
  minimum: 0,
  maximum: 9999999999.99,
  multipleOf: 0.01,
});
export const Password = Type.String({ minLength: 12, maxLength: 72 });
export const PeriodFields = {
  inicio: Type.Optional(DateOnly),
  fim: Type.Optional(DateOnly),
  organizacaoId: Type.Optional(Type.String({ format: "uuid" })),
};
