import { BusinessError } from "./errors.js";
export function validatePassword(password: string) {
  if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
    throw new BusinessError(
      422,
      "SENHA_INVALIDA",
      "Use pelo menos 12 caracteres e no máximo 72 bytes UTF-8.",
    );
  }
}
