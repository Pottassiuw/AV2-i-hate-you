import { PapelUsuario } from "@prisma/client";
import { createDatabase } from "../src/database.js";
import { hash } from "bcryptjs";
import { createOrganization } from "../src/modules/organizations/service.js";
import { createLot } from "../src/modules/lots/service.js";
import { registerMovement } from "../src/modules/equipment/service.js";
import type { Actor } from "../src/shared/permissions.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error("Defina DATABASE_URL antes de executar o seed.");
const db = createDatabase(databaseUrl);

function validatePassword(
  password: string | undefined,
  variable: string,
): string {
  if (
    !password ||
    password.startsWith("troque-") ||
    password.length < 12 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    throw new Error(
      `${variable} deve ter ao menos 12 caracteres e no máximo 72 bytes UTF-8; substitua o placeholder.`,
    );
  }
  return password;
}

async function ensureUser(
  email: string,
  password: string,
  papel: PapelUsuario,
) {
  // Reexecutar o seed não troca senha, papel ou ativação de um usuário existente.
  return db.usuario.upsert({
    where: { email },
    update: {},
    create: { email, papel, hashSenha: await hash(password, 12) },
  });
}

async function seedDemo(actor: Actor, password: string) {
  await ensureUser("cadastro@greencode.local", password, "OPERADOR_CADASTRO");
  await ensureUser(
    "almoxarifado@greencode.local",
    password,
    "OPERADOR_ALMOXARIFADO",
  );
  await ensureUser("auditor@greencode.local", password, "AUDITOR");

  let organization = await db.organizacao.findUnique({
    where: { cnpj: "11222333000181" },
  });
  organization ??= await createOrganization(db, actor, {
    razaoSocial: "Organização de demonstração Greencode",
    cnpj: "11.222.333/0001-81",
    enderecoCompleto: "Rua de Demonstração, 100",
    telefone: "11999990000",
    email: "contato@demonstracao.local",
  });
  const today = new Date(
    new Date().toISOString().slice(0, 10) + "T00:00:00.000Z",
  );
  const expiry = new Date(today);
  expiry.setUTCFullYear(expiry.getUTCFullYear() + 1);
  await db.contrato.upsert({
    where: { organizacaoId: organization.id },
    update: {},
    create: {
      organizacaoId: organization.id,
      dataAssinatura: today,
      dataVencimento: expiry,
      valorMensal: "1500.00",
      clausulas: [
        "Contrato exclusivamente demonstrativo, sem validade comercial.",
      ],
    },
  });

  const existingDemo = await db.equipamento.findUnique({
    where: { codigoBarrasInterno: "DEMO-NOTEBOOK-001" },
  });
  if (existingDemo) return;

  const lot = await createLot(db, actor, {
    organizacaoId: organization.id,
    dataEntrada: today.toISOString().slice(0, 10),
    notaFiscal: "DEMO-001",
    transportadora: "Transportadora demonstrativa",
    equipamentos: [
      {
        codigoBarrasInterno: "DEMO-NOTEBOOK-001",
        tipo: "NOTEBOOK",
        marca: "Marca Demo",
        modelo: "Notebook Demo",
        anoFabricacao: 2020,
        estadoFisico: "BOM_ESTADO",
        pesoQuilogramas: 2.5,
      },
      {
        codigoBarrasInterno: "DEMO-MONITOR-001",
        tipo: "MONITOR",
        marca: "Marca Demo",
        modelo: "Monitor Demo",
        anoFabricacao: 2019,
        estadoFisico: "DANIFICADO_LEVE",
        pesoQuilogramas: 4.2,
      },
    ],
  });
  const notebook = lot.equipamentos.find(
    (item) => item.codigoBarrasInterno === "DEMO-NOTEBOOK-001",
  )!;
  await registerMovement(db, actor, notebook.id, {
    versao: 0,
    origem: "ALMOXARIFADO",
    destino: "BANCADA DE TRIAGEM",
    statusRastreamento: "EM_TRIAGEM",
  });
  await registerMovement(db, actor, notebook.id, {
    versao: 1,
    origem: "BANCADA DE TRIAGEM",
    destino: "FILA DE DESMONTE",
    statusRastreamento: "AGUARDANDO_DESMONTE",
  });
}

try {
  const password = validatePassword(
    process.env.ADMIN_PASSWORD,
    "ADMIN_PASSWORD",
  );
  const demoPassword = process.env.SEED_DEMO_PASSWORD;
  if (demoPassword) validatePassword(demoPassword, "SEED_DEMO_PASSWORD");
  const email = (process.env.ADMIN_EMAIL ?? "admin@greencode.local")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("ADMIN_EMAIL inválido.");
  const admin = await ensureUser(email, password, "ADMINISTRADOR");
  if (!admin.ativo || admin.papel !== "ADMINISTRADOR") {
    throw new Error(
      "O e-mail indicado já pertence a um usuário inativo ou não administrador; o seed não o promove automaticamente.",
    );
  }
  if (demoPassword)
    await seedDemo({ id: admin.id, papel: admin.papel }, demoPassword);
  console.log(
    "Seed concluído sem redefinir usuários existentes. Demo:",
    Boolean(demoPassword),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Falha no seed.");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
