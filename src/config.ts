export function getConfig(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT deve ser um inteiro entre 1 e 65535.");
  }

  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32 || jwtSecret.startsWith("troque-")) {
    throw new Error(
      "Defina JWT_SECRET aleatório com pelo menos 32 caracteres.",
    );
  }

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl || !/^postgres(ql)?:\/\//.test(databaseUrl)) {
    throw new Error("DATABASE_URL deve apontar para um PostgreSQL.");
  }

  return { port, host: env.HOST ?? "127.0.0.1", jwtSecret, databaseUrl };
}
