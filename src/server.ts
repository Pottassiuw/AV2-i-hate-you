import { createDatabase } from "./database.js";
import { buildApp } from "./app.js";
import { getConfig } from "./config.js";

const config = getConfig();
const db = createDatabase(config.databaseUrl);
const app = await buildApp({ db, jwtSecret: config.jwtSecret, logger: true });

async function shutdown() {
  // fastify.close para novas requisições, aguarda as ativas e executa onClose.
  try {
    await app.close();
  } catch {
    process.exitCode = 1;
  }
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

try {
  await db.$connect();
  await app.listen({ port: config.port, host: config.host });
} catch {
  console.error("Falha ao iniciar. Confira a configuração, o banco e a porta.");
  process.exitCode = 1;
  await app.close();
}
