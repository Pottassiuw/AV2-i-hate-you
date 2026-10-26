import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { buildApp } from "../src/app.js";
import { createDatabase } from "../src/database.js";

const password = "senha-exclusiva-do-teste";
const jwtSecret = "segredo-de-teste-nao-utilizar-em-producao";
const schema = "gc_test_" + randomUUID().replaceAll("-", "");
let app: Awaited<ReturnType<typeof buildApp>> | undefined;
let db: ReturnType<typeof createDatabase> | undefined;

function server() {
  assert.ok(app, "O servidor de teste deve ter sido inicializado.");
  return app;
}

before(
  async () => {
    assert.ok(
      process.env.DATABASE_URL,
      "Defina DATABASE_URL (veja .env.example).",
    );
    // Schema aleatório e descartável: não toca nos dados de desenvolvimento.
    const url = new URL(process.env.DATABASE_URL);
    url.searchParams.set("schema", schema);
    const env = { ...process.env, DATABASE_URL: url.toString() };
    execFileSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      { env, stdio: "pipe" },
    );
    db = createDatabase(url.toString());
    // Injeção de falha só no banco descartável; a verificação continua sendo feita por HTTP.
    await db.$executeRawUnsafe(`CREATE FUNCTION "${schema}"."falha_de_movimentacao"() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.observacao = 'FORCAR_FALHA_TESTE' THEN RAISE EXCEPTION 'Falha simulada de persistência'; END IF;
        RETURN NEW;
      END; $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER "falha_de_movimentacao" BEFORE INSERT ON "${schema}"."Movimentacao"
      FOR EACH ROW EXECUTE FUNCTION "${schema}"."falha_de_movimentacao"()`);
    execFileSync(process.execPath, ["--import", "tsx", "prisma/seed.ts"], {
      env: {
        ...env,
        ADMIN_EMAIL: "admin@greencode.local",
        ADMIN_PASSWORD: password,
        SEED_DEMO_PASSWORD: password,
      },
      stdio: "pipe",
    });
    app = await buildApp({ db, jwtSecret });
    await app.ready();
  },
  { timeout: 90_000 },
);

after(async () => {
  try {
    // Nome gerado pelo próprio teste; nunca vem de entrada do usuário.
    if (db)
      await db.$executeRawUnsafe(
        'DROP SCHEMA IF EXISTS "' + schema + '" CASCADE',
      );
  } finally {
    if (app) await app.close();
    else if (db) await db.$disconnect();
  }
});

test("administrador provisionado consegue entrar sem expor credenciais", async () => {
  const response = await server().inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "admin@greencode.local", senha: password },
  });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json<{
    token: string;
    expiraEmSegundos: number;
    usuario: { papel: string };
  }>();
  assert.equal(body.usuario.papel, "ADMINISTRADOR");
  assert.equal(body.expiraEmSegundos, 1800);
  assert.equal(body.token.split(".").length, 3);
  assert.ok(!response.body.includes("hashSenha"));
  assert.ok(!response.body.includes(password));
});

type Role = "admin" | "cadastro" | "almoxarifado" | "auditor";
const tokens = new Map<Role, string>();

async function tokenFor(role: Role) {
  const cached = tokens.get(role);
  if (cached) return cached;
  const response = await server().inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: `${role}@greencode.local`, senha: password },
  });
  assert.equal(response.statusCode, 200, response.body);
  const token = response.json<{ token: string }>().token;
  tokens.set(role, token);
  return token;
}

async function get(url: string, role: Role = "admin") {
  return server().inject({
    method: "GET",
    url,
    headers: { authorization: `Bearer ${await tokenFor(role)}` },
  });
}

async function post(url: string, payload: object, role: Role = "admin") {
  return server().inject({
    method: "POST",
    url,
    payload,
    headers: { authorization: `Bearer ${await tokenFor(role)}` },
  });
}

async function lotBody() {
  const organizations = (await get("/organizacoes")).json<
    { id: string; cnpj: string }[]
  >();
  const demo = organizations.find((item) => item.cnpj === "11222333000181");
  assert.ok(demo);
  return {
    organizacaoId: demo.id,
    dataEntrada: new Date().toISOString().slice(0, 10),
    notaFiscal: "TEST-" + randomUUID(),
    transportadora: "Transportadora de teste",
    equipamentos: [
      {
        codigoBarrasInterno: "TEST-" + randomUUID(),
        tipo: "NOTEBOOK",
        marca: "Teste",
        modelo: "Modelo de teste",
        anoFabricacao: 2020,
        estadoFisico: "BOM_ESTADO",
        pesoQuilogramas: 2.5,
      },
    ],
  };
}

type Lot = { id: string; equipamentos: { id: string; versao: number }[] };
async function newEquipment() {
  const response = await post("/lotes", await lotBody());
  assert.equal(response.statusCode, 201, response.body);
  const equipment = response.json<Lot>().equipamentos[0];
  assert.ok(equipment);
  return equipment;
}

function movement(versao: number, statusRastreamento: string) {
  return {
    versao,
    origem: "ALMOXARIFADO",
    destino: "BANCADA",
    statusRastreamento,
  };
}

test("organização → lote com dois equipamentos → triagem → desmonte mantém rastreabilidade", async () => {
  const organization = await post("/organizacoes", {
    razaoSocial: "Organização da jornada",
    cnpj: "04.252.011/0001-10",
    enderecoCompleto: "Rua da Jornada, 1",
    telefone: "11999990000",
    email: "jornada@example.com",
  });
  assert.equal(organization.statusCode, 201, organization.body);
  assert.equal(organization.json<{ cnpj: string }>().cnpj, "04252011000110");
  const input = await lotBody();
  const original = input.equipamentos[0];
  assert.ok(original);
  const lotResponse = await post("/lotes", {
    ...input,
    organizacaoId: organization.json<{ id: string }>().id,
    equipamentos: [
      { ...original, pesoQuilogramas: 1.001 },
      {
        ...original,
        codigoBarrasInterno: "TEST-" + randomUUID(),
        tipo: "MONITOR",
      },
    ],
  });
  assert.equal(lotResponse.statusCode, 201, lotResponse.body);
  const lot = lotResponse.json<Lot>();
  assert.equal(lot.equipamentos.length, 2);
  const equipment = lot.equipamentos[0];
  assert.ok(equipment);
  const path = `/equipamentos/${equipment.id}`;
  for (const [versao, status] of [
    "EM_TRIAGEM",
    "AGUARDANDO_DESMONTE",
    "EM_DESMONTE",
  ].entries()) {
    const response = await post(
      path + "/movimentacoes",
      movement(versao, status),
    );
    assert.equal(response.statusCode, 201, response.body);
  }
  const history = (await get(path)).json<{
    statusRastreamento: string;
    triagemConcluidaEm: string;
    versao: number;
    movimentacoes: {
      statusNovo: string;
      versaoEquipamento: number;
      responsavel: { email: string };
    }[];
  }>();
  assert.equal(history.statusRastreamento, "EM_DESMONTE");
  assert.equal(history.versao, 3);
  assert.ok(history.triagemConcluidaEm);
  assert.deepEqual(
    history.movimentacoes.map((item) => item.statusNovo),
    ["AGUARDANDO_TRIAGEM", "EM_TRIAGEM", "AGUARDANDO_DESMONTE", "EM_DESMONTE"],
  );
  assert.deepEqual(
    history.movimentacoes.map((item) => item.versaoEquipamento),
    [0, 1, 2, 3],
  );
  assert.ok(
    history.movimentacoes.every(
      (item) => item.responsavel.email === "admin@greencode.local",
    ),
  );
});

test("credenciais incorretas, ausência de token e token adulterado não autorizam acesso", async () => {
  const wrongPassword = await server().inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "admin@greencode.local", senha: "senha-incorreta" },
  });
  assert.equal(wrongPassword.statusCode, 401);
  const anonymous = await server().inject({
    method: "GET",
    url: "/organizacoes",
  });
  assert.equal(anonymous.statusCode, 401);
  const invalidToken = await server().inject({
    method: "GET",
    url: "/organizacoes",
    headers: { authorization: "Bearer token-invalido" },
  });
  assert.equal(invalidToken.statusCode, 401);
});

test("papéis separam consulta de auditor, cadastro e operação de almoxarifado", async () => {
  const input = await lotBody();
  assert.equal((await get("/organizacoes", "auditor")).statusCode, 200);
  assert.equal((await post("/lotes", input, "auditor")).statusCode, 403);
  assert.equal((await post("/lotes", input, "cadastro")).statusCode, 403);
  const organizationInput = {
    razaoSocial: "Cadastro permitido",
    cnpj: "11.444.777/0001-61",
    enderecoCompleto: "Rua Exemplo, 2",
    telefone: "11999990000",
    email: "cadastro@example.com",
  };
  assert.equal(
    (await post("/organizacoes", organizationInput, "almoxarifado")).statusCode,
    403,
  );
  const createdOrganization = await post(
    "/organizacoes",
    organizationInput,
    "cadastro",
  );
  assert.equal(createdOrganization.statusCode, 201, createdOrganization.body);
  const createdLot = await post("/lotes", input, "almoxarifado");
  assert.equal(createdLot.statusCode, 201, createdLot.body);
  const equipment = createdLot.json<Lot>().equipamentos[0];
  assert.ok(equipment);
  assert.equal(
    (await get("/equipamentos/" + equipment.id, "auditor")).statusCode,
    200,
  );
  const denied = await post(
    "/equipamentos/" + equipment.id + "/movimentacoes",
    movement(0, "EM_TRIAGEM"),
    "auditor",
  );
  assert.equal(denied.statusCode, 403);
});

test("CNPJ inválido é recusado e a máscara não permite duplicar uma organização", async () => {
  const input = {
    razaoSocial: "CNPJ de teste",
    cnpj: "11.222.333/0001-80",
    enderecoCompleto: "Rua Exemplo, 3",
    telefone: "11999990000",
    email: "cnpj@example.com",
  };
  const invalid = await post("/organizacoes", input);
  assert.equal(invalid.statusCode, 422);
  assert.equal(invalid.json<{ erro: string }>().erro, "CNPJ_INVALIDO");
  const duplicate = await post("/organizacoes", {
    ...input,
    cnpj: "11222333000181",
  });
  assert.equal(duplicate.statusCode, 409);
  const organizations = (await get("/organizacoes")).json<{ cnpj: string }[]>();
  assert.equal(
    organizations.filter((item) => item.cnpj === "11222333000181").length,
    1,
  );
});

test("entrada aceita o limite de 90 dias e recusa futuro, data antiga e calendário impossível", async () => {
  const input = await lotBody();
  const day = (offset: number) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  const accepted = await post("/lotes", { ...input, dataEntrada: day(-90) });
  assert.equal(accepted.statusCode, 201, accepted.body);
  assert.equal(
    (await post("/lotes", { ...input, dataEntrada: day(1) })).statusCode,
    422,
  );
  assert.equal(
    (await post("/lotes", { ...input, dataEntrada: day(-91) })).statusCode,
    422,
  );
  assert.equal(
    (await post("/lotes", { ...input, dataEntrada: "2026-02-30" })).statusCode,
    400,
  );
});

test("código duplicado desfaz lote inteiro, sem reservar o código do equipamento válido", async () => {
  const beforeLots = (await get("/lotes")).json<{ id: string }[]>();
  const input = await lotBody();
  const equipment = input.equipamentos[0];
  assert.ok(equipment);
  const failed = await post("/lotes", {
    ...input,
    equipamentos: [
      equipment,
      { ...equipment, codigoBarrasInterno: "DEMO-NOTEBOOK-001" },
    ],
  });
  assert.equal(failed.statusCode, 409, failed.body);
  const afterLots = (await get("/lotes")).json<{ id: string }[]>();
  assert.deepEqual(afterLots, beforeLots);
  // Se o primeiro equipamento tivesse persistido, reutilizar seu código falharia.
  const retry = await post("/lotes", input);
  assert.equal(retry.statusCode, 201, retry.body);
});

test("desmonte sem triagem e rebaixamento sem justificativa não alteram equipamento nem histórico", async () => {
  const equipment = await newEquipment();
  const path = "/equipamentos/" + equipment.id;
  const premature = await post(
    path + "/movimentacoes",
    movement(0, "EM_DESMONTE"),
  );
  assert.equal(premature.statusCode, 422);
  const noReason = await post(path + "/movimentacoes", {
    ...movement(0, "EM_TRIAGEM"),
    estadoFisico: "USADO_MODERADO",
  });
  assert.equal(noReason.statusCode, 422);
  assert.equal(
    noReason.json<{ erro: string }>().erro,
    "JUSTIFICATIVA_OBRIGATORIA",
  );
  const before = (await get(path)).json<{
    versao: number;
    estadoFisico: string;
    movimentacoes: unknown[];
  }>();
  assert.equal(before.versao, 0);
  assert.equal(before.estadoFisico, "BOM_ESTADO");
  assert.equal(before.movimentacoes.length, 1);
  const reason = "Danos internos encontrados na avaliação.";
  const accepted = await post(path + "/movimentacoes", {
    ...movement(0, "EM_TRIAGEM"),
    estadoFisico: "USADO_MODERADO",
    justificativa: reason,
  });
  assert.equal(accepted.statusCode, 201, accepted.body);
  const after = (await get(path)).json<{
    versao: number;
    estadoFisico: string;
    movimentacoes: {
      estadoFisicoAnterior: string;
      estadoFisicoNovo: string;
      justificativa: string;
    }[];
  }>();
  assert.equal(after.versao, 1);
  assert.equal(after.estadoFisico, "USADO_MODERADO");
  assert.equal(after.movimentacoes.length, 2);
  assert.equal(after.movimentacoes[1]?.estadoFisicoAnterior, "BOM_ESTADO");
  assert.equal(after.movimentacoes[1]?.estadoFisicoNovo, "USADO_MODERADO");
  assert.equal(after.movimentacoes[1]?.justificativa, reason);
});

test("duas requisições concorrentes com a mesma versão geram só uma movimentação", async () => {
  const equipment = await newEquipment();
  const path = "/equipamentos/" + equipment.id;
  const responses = await Promise.all([
    post(path + "/movimentacoes", movement(0, "EM_TRIAGEM")),
    post(path + "/movimentacoes", movement(0, "EM_TRIAGEM")),
  ]);
  assert.deepEqual(
    responses.map((response) => response.statusCode).sort(),
    [201, 409],
  );
  const state = (await get(path)).json<{
    versao: number;
    statusRastreamento: string;
    movimentacoes: unknown[];
  }>();
  assert.equal(state.versao, 1);
  assert.equal(state.statusRastreamento, "EM_TRIAGEM");
  assert.equal(state.movimentacoes.length, 2);
});

test("JWT assinado corretamente mas expirado não autoriza consulta", async () => {
  const [header, encoded] = (await tokenFor("admin")).split(".");
  assert.ok(header);
  assert.ok(encoded);
  const payload = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  );
  const expired = Buffer.from(JSON.stringify({ ...payload, exp: 1 })).toString(
    "base64url",
  );
  const content = header + "." + expired;
  const signature = createHmac("sha256", jwtSecret)
    .update(content)
    .digest("base64url");
  const response = await server().inject({
    method: "GET",
    url: "/organizacoes",
    headers: { authorization: "Bearer " + content + "." + signature },
  });
  assert.equal(response.statusCode, 401);
});

test("baixa definitiva encerra alterações no equipamento", async () => {
  const equipment = await newEquipment();
  const path = "/equipamentos/" + equipment.id;
  const statuses = [
    "EM_TRIAGEM",
    "AGUARDANDO_DESMONTE",
    "EM_DESMONTE",
    "MATERIAL_RECICLAVEL",
    "BAIXA_DEFINITIVA",
  ];
  for (const [versao, status] of statuses.entries()) {
    const response = await post(
      path + "/movimentacoes",
      movement(versao, status),
    );
    assert.equal(response.statusCode, 201, response.body);
  }
  const rejected = await post(path + "/movimentacoes", {
    versao: 5,
    origem: "RECICLAGEM",
    destino: "ARQUIVO",
    estadoFisico: "USADO_LEVE",
  });
  assert.equal(rejected.statusCode, 422);
  assert.equal(
    rejected.json<{ erro: string }>().erro,
    "EQUIPAMENTO_FINALIZADO",
  );
  const state = (await get(path)).json<{
    versao: number;
    movimentacoes: unknown[];
  }>();
  assert.equal(state.versao, 5);
  assert.equal(state.movimentacoes.length, 6);
});

test("tipo de conteúdo não suportado conserva o erro HTTP 415 em vez de virar erro interno", async () => {
  const response = await server().inject({
    method: "POST",
    url: "/organizacoes",
    payload: "<organizacao/>",
    headers: {
      authorization: "Bearer " + (await tokenFor("admin")),
      "content-type": "application/xml",
    },
  });
  assert.equal(response.statusCode, 415);
});

async function patch(url: string, payload: object, role: Role = "admin") {
  return server().inject({
    method: "PATCH",
    url,
    payload,
    headers: { authorization: "Bearer " + (await tokenFor(role)) },
  });
}

test("cadastro cria, consulta e renova o contrato único da organização, com versão e auditoria", async () => {
  const organization = (await get("/organizacoes"))
    .json<{ id: string; cnpj: string }[]>()
    .find((item) => item.cnpj === "04252011000110");
  assert.ok(organization);
  const input = {
    organizacaoId: organization.id,
    dataAssinatura: "2025-01-01",
    dataVencimento: "2026-12-31",
    valorMensal: 1234.56,
    clausulas: ["Coleta mensal."],
  };
  const created = await post("/contratos", input, "cadastro");
  assert.equal(created.statusCode, 201, created.body);
  const contract = created.json<{
    id: string;
    versao: number;
    valorMensal: string;
  }>();
  assert.equal(contract.valorMensal, "1234.56");
  assert.equal((await post("/contratos", input, "cadastro")).statusCode, 409);
  assert.equal(
    (await get("/contratos/" + contract.id, "auditor")).statusCode,
    200,
  );
  assert.equal(
    (
      await post(
        "/contratos/" + contract.id + "/renovacao",
        { versao: 0, dataVencimento: "2025-01-01" },
        "cadastro",
      )
    ).statusCode,
    422,
  );
  const renewed = await post(
    "/contratos/" + contract.id + "/renovacao",
    { versao: 0, dataVencimento: "2027-12-31" },
    "cadastro",
  );
  assert.equal(renewed.statusCode, 200, renewed.body);
  assert.equal(renewed.json<{ versao: number }>().versao, 1);
  assert.equal(
    (
      await post(
        "/contratos/" + contract.id + "/renovacao",
        { versao: 0, dataVencimento: "2028-12-31" },
        "cadastro",
      )
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await patch(
        "/contratos/" + contract.id,
        { versao: 1, valorMensal: 1300 },
        "auditor",
      )
    ).statusCode,
    403,
  );
});

test("administrador gerencia usuários sem expor hash, revoga tokens e não remove o último administrador", async () => {
  const list = await get("/usuarios");
  assert.equal(list.statusCode, 200, list.body);
  const admin = list
    .json<{ id: string; email: string; versao: number }[]>()
    .find((item) => item.email === "admin@greencode.local");
  assert.ok(admin);
  assert.equal(
    (
      await patch("/usuarios/" + admin.id, {
        versao: admin.versao,
        ativo: false,
      })
    ).statusCode,
    422,
  );
  assert.equal((await get("/usuarios", "auditor")).statusCode, 403);
  const email = "novo-" + randomUUID() + "@example.com";
  const input = { email, senha: password, papel: "AUDITOR" };
  assert.equal((await post("/usuarios", input, "cadastro")).statusCode, 403);
  const created = await post("/usuarios", input);
  assert.equal(created.statusCode, 201, created.body);
  assert.ok(!created.body.includes("hashSenha"));
  assert.ok(!created.body.includes(password));
  const user = created.json<{ id: string; versao: number }>();
  const logged = await server().inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, senha: password },
  });
  const token = logged.json<{ token: string }>().token;
  const changed = await patch("/usuarios/" + user.id, {
    versao: 0,
    papel: "OPERADOR_CADASTRO",
  });
  assert.equal(changed.statusCode, 200, changed.body);
  const revoked = await server().inject({
    method: "GET",
    url: "/organizacoes",
    headers: { authorization: "Bearer " + token },
  });
  assert.equal(revoked.statusCode, 401);
  assert.equal(
    (await patch("/usuarios/" + user.id, { versao: 0, ativo: false }))
      .statusCode,
    409,
  );
  assert.equal(
    (await patch("/usuarios/" + user.id, { versao: 1, ativo: false }))
      .statusCode,
    200,
  );
  assert.equal(
    (
      await server().inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, senha: password },
      })
    ).statusCode,
    401,
  );
});

test("usuário troca a própria senha e sai revogando os tokens anteriores", async () => {
  const email = "senha-" + randomUUID() + "@example.com";
  await post("/usuarios", { email, senha: password, papel: "AUDITOR" });
  const enter = async (senha: string) =>
    server().inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, senha },
    });
  const first = (await enter(password)).json<{ token: string }>();
  const headers = { authorization: "Bearer " + first.token };
  const me = await server().inject({ method: "GET", url: "/auth/me", headers });
  assert.equal(me.statusCode, 200, me.body);
  assert.ok(!me.body.includes("hashSenha"));
  const changed = await server().inject({
    method: "POST",
    url: "/auth/senha",
    headers,
    payload: {
      versao: 0,
      senhaAtual: password,
      novaSenha: "nova-senha-segura-123",
    },
  });
  assert.equal(changed.statusCode, 204, changed.body);
  assert.equal(
    (await server().inject({ method: "GET", url: "/auth/me", headers }))
      .statusCode,
    401,
  );
  assert.equal((await enter(password)).statusCode, 401);
  const next = await enter("nova-senha-segura-123");
  assert.equal(next.statusCode, 200, next.body);
  const nextHeaders = {
    authorization: "Bearer " + next.json<{ token: string }>().token,
  };
  assert.equal(
    (
      await server().inject({
        method: "POST",
        url: "/auth/logout",
        headers: nextHeaders,
      })
    ).statusCode,
    204,
  );
  assert.equal(
    (
      await server().inject({
        method: "GET",
        url: "/auth/me",
        headers: nextHeaders,
      })
    ).statusCode,
    401,
  );
});

test("cadastro atualiza e desativa organização com versão; listagens são paginadas", async () => {
  const page = await get("/organizacoes?limite=1&pagina=1");
  assert.equal(page.statusCode, 200, page.body);
  assert.equal(page.json<unknown[]>().length, 1);
  assert.equal((await get("/organizacoes?limite=101")).statusCode, 400);
  const org = (await get("/organizacoes"))
    .json<{ id: string; cnpj: string; versao: number }[]>()
    .find((item) => item.cnpj === "11444777000161");
  assert.ok(org);
  assert.equal(
    (
      await patch(
        "/organizacoes/" + org.id,
        { versao: 0, ativo: false },
        "auditor",
      )
    ).statusCode,
    403,
  );
  const disabled = await patch(
    "/organizacoes/" + org.id,
    { versao: 0, ativo: false, enderecoCompleto: "Novo endereço" },
    "cadastro",
  );
  assert.equal(disabled.statusCode, 200, disabled.body);
  assert.equal(disabled.json<{ versao: number }>().versao, 1);
  assert.equal(
    (
      await patch(
        "/organizacoes/" + org.id,
        { versao: 0, ativo: true },
        "cadastro",
      )
    ).statusCode,
    409,
  );
  const input = await lotBody();
  assert.equal(
    (await post("/lotes", { ...input, organizacaoId: org.id })).statusCode,
    422,
  );
  assert.equal(
    (
      await patch(
        "/organizacoes/" + org.id,
        { versao: 1, ativo: true },
        "cadastro",
      )
    ).statusCode,
    200,
  );
});

test("status do lote acompanha todos os equipamentos, inclusive baixas simultâneas", async () => {
  const input = await lotBody();
  const original = input.equipamentos[0];
  assert.ok(original);
  const created = await post("/lotes", {
    ...input,
    equipamentos: [
      original,
      { ...original, codigoBarrasInterno: "TEST-" + randomUUID() },
    ],
  });
  const lot = created.json<Lot>();
  const status = async () =>
    (await get("/lotes/" + lot.id)).json<{
      statusProcessamento: string;
      versao: number;
    }>();
  assert.equal((await status()).statusProcessamento, "RECEBIDO");
  const items = (
    await get("/equipamentos?loteId=" + lot.id + "&limite=1")
  ).json<unknown[]>();
  assert.equal(items.length, 1);
  for (const [versao, next] of [
    "EM_TRIAGEM",
    "AGUARDANDO_DESMONTE",
    "EM_DESMONTE",
    "MATERIAL_RECICLAVEL",
    "BAIXA_DEFINITIVA",
  ].entries()) {
    const responses = await Promise.all(
      lot.equipamentos.map((item) =>
        post(
          "/equipamentos/" + item.id + "/movimentacoes",
          movement(versao, next),
        ),
      ),
    );
    assert.ok(
      responses.every((response) => response.statusCode === 201),
      responses.map((r) => r.body).join("\n"),
    );
    const expected = [
      "EM_TRIAGEM",
      "TRIAGEM_CONCLUIDA",
      "ENCAMINHADO",
      "ENCAMINHADO",
      "FINALIZADO",
    ][versao];
    assert.equal((await status()).statusProcessamento, expected);
  }
});

test("almoxarifado completa lote antes da triagem e atualiza metadados sem perder versões", async () => {
  const created = await post("/lotes", await lotBody());
  const lot = created.json<Lot>();
  const extra = (await lotBody()).equipamentos[0];
  assert.ok(extra);
  const added = await post(
    "/lotes/" + lot.id + "/equipamentos",
    { versao: 0, equipamentos: [extra] },
    "almoxarifado",
  );
  assert.equal(added.statusCode, 201, added.body);
  assert.equal(added.json<Lot>().equipamentos.length, 2);
  assert.equal(
    (
      await post("/lotes/" + lot.id + "/equipamentos", {
        versao: 0,
        equipamentos: [extra],
      })
    ).statusCode,
    409,
  );
  const edited = await patch(
    "/lotes/" + lot.id,
    { versao: 1, transportadora: "Transportadora corrigida" },
    "almoxarifado",
  );
  assert.equal(edited.statusCode, 200, edited.body);
  const first = lot.equipamentos[0];
  assert.ok(first);
  assert.equal(
    (
      await post(
        "/equipamentos/" + first.id + "/movimentacoes",
        movement(0, "EM_TRIAGEM"),
      )
    ).statusCode,
    201,
  );
  const current = (await get("/lotes/" + lot.id)).json<{ versao: number }>();
  const next = (await lotBody()).equipamentos[0];
  assert.ok(next);
  assert.equal(
    (
      await post("/lotes/" + lot.id + "/equipamentos", {
        versao: current.versao,
        equipamentos: [next],
      })
    ).statusCode,
    422,
  );
});

test("parâmetros financeiros são configuráveis somente pelo administrador e têm versão", async () => {
  const response = await get("/parametros", "auditor");
  assert.equal(response.statusCode, 200, response.body);
  const params = response.json<{ versao: number }>();
  const input = {
    versao: params.versao,
    aliquotaImposto: 0.25,
    depreciacaoAnual: 0.1,
    valorBaseQuilograma: 100,
  };
  assert.equal((await patch("/parametros", input, "auditor")).statusCode, 403);
  const updated = await patch("/parametros", input);
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal(
    updated.json<{ aliquotaImposto: string }>().aliquotaImposto,
    "0.25",
  );
  assert.equal((await patch("/parametros", input)).statusCode, 409);
  assert.equal(
    (await patch("/parametros", { ...input, versao: 1, aliquotaImposto: 1.1 }))
      .statusCode,
    400,
  );
});

test("relatórios por organização, status e financeiro aplicam política explícita com valores exatos", async () => {
  const org = (await get("/organizacoes"))
    .json<{ id: string; cnpj: string }[]>()
    .find((item) => item.cnpj === "11444777000161");
  assert.ok(org);
  const year = new Date().getUTCFullYear();
  const input = await lotBody();
  const item = input.equipamentos[0];
  assert.ok(item);
  assert.equal(
    (
      await post("/lotes", {
        ...input,
        organizacaoId: org.id,
        equipamentos: [
          { ...item, pesoQuilogramas: 10, anoFabricacao: year - 2 },
        ],
      })
    ).statusCode,
    201,
  );
  assert.equal(
    (
      await post("/contratos", {
        organizacaoId: org.id,
        dataAssinatura: year + "-01-01",
        dataVencimento: year + "-12-31",
        valorMensal: 250,
        clausulas: ["Contrato do relatório."],
      })
    ).statusCode,
    201,
  );
  const query =
    "?inicio=" + year + "-01-01&fim=" + new Date().toISOString().slice(0, 10);
  const summary = await get(
    "/relatorios/organizacoes/" + org.id + query,
    "auditor",
  );
  assert.equal(summary.statusCode, 200, summary.body);
  const summaryBody = summary.json<{
    lotes: number;
    equipamentos: number;
    pesoQuilogramas: string;
  }>();
  assert.equal(summaryBody.lotes, 1);
  assert.equal(summaryBody.equipamentos, 1);
  assert.equal(summaryBody.pesoQuilogramas, "10.000");
  const status = await get(
    "/relatorios/status" + query + "&organizacaoId=" + org.id,
    "auditor",
  );
  assert.equal(status.statusCode, 200, status.body);
  const buckets = status.json<{
    porStatus: { status: string; quantidade: number }[];
  }>();
  assert.equal(
    buckets.porStatus.find((s) => s.status === "AGUARDANDO_TRIAGEM")
      ?.quantidade,
    1,
  );
  const financial = await get(
    "/relatorios/financeiro" + query + "&organizacaoId=" + org.id,
    "auditor",
  );
  assert.equal(financial.statusCode, 200, financial.body);
  const body = financial.json<{
    valorEstimadoBruto: string;
    impostoEstimado: string;
    valorEstimadoLiquido: string;
    receitaMensalContratada: string;
  }>();
  assert.equal(body.valorEstimadoBruto, "800.00"); // 10 kg × R$100 × (1 - 10% × 2 anos).
  assert.equal(body.impostoEstimado, "200.00");
  assert.equal(body.valorEstimadoLiquido, "600.00");
  assert.equal(body.receitaMensalContratada, "250.00"); // Não somar patrimônio a receita.
  assert.equal(
    (await get("/relatorios/status?inicio=2026-12-31&fim=2026-01-01"))
      .statusCode,
    422,
  );
});

test("auditor consulta alterações de contrato e usuários sem acesso a senhas ou tokens", async () => {
  assert.equal((await get("/auditoria", "cadastro")).statusCode, 403);
  const contracts = (await get("/contratos")).json<
    { id: string; valorMensal: string }[]
  >();
  const contract = contracts.find((item) => item.valorMensal === "1234.56");
  assert.ok(contract);
  const response = await get(
    "/auditoria?entidade=Contrato&entidadeId=" + contract.id,
    "auditor",
  );
  assert.equal(response.statusCode, 200, response.body);
  const entries = response.json<
    {
      acao: string;
      antes: { dataVencimento: string };
      depois: { dataVencimento: string };
    }[]
  >();
  assert.equal(entries.length, 2);
  const renewal = entries.find((item) => item.acao === "RENOVAR");
  assert.ok(renewal);
  assert.ok(renewal.antes.dataVencimento.startsWith("2026-12-31"));
  assert.ok(renewal.depois.dataVencimento.startsWith("2027-12-31"));
  const users = await get("/auditoria?entidade=Usuario", "auditor");
  assert.equal(users.statusCode, 200);
  assert.ok(!users.body.includes("hashSenha"));
  assert.ok(!users.body.includes(password));
  assert.ok(!users.body.includes("tokenVersao"));
});

test("falha ao gravar movimentação reverte equipamento, lote e auditoria na mesma transação", async () => {
  const equipment = await newEquipment();
  const path = "/equipamentos/" + equipment.id;
  const before = await get(path);
  const failed = await post(path + "/movimentacoes", {
    ...movement(0, "EM_TRIAGEM"),
    observacao: "FORCAR_FALHA_TESTE",
  });
  assert.equal(failed.statusCode, 500, failed.body);
  assert.ok(!failed.body.includes("Falha simulada"));
  const after = await get(path);
  assert.deepEqual(after.json(), before.json());
  const entries = await get(
    "/auditoria?entidade=Equipamento&entidadeId=" + equipment.id,
    "auditor",
  );
  assert.deepEqual(entries.json(), []);
});

test("login limita tentativas por IP e devolve 429 sem expor detalhes internos", async () => {
  let response;
  for (let count = 0; count < 31; count++) {
    response = await server().inject({
      method: "POST",
      url: "/auth/login",
      remoteAddress: "192.0.2.77",
      payload: {},
    });
  }
  assert.ok(response);
  assert.equal(response.statusCode, 429, response.body);
  assert.ok(response.headers["retry-after"]);
});

test("CNPJ alfanumérico mantém validação de dígitos, normalização e unicidade", async () => {
  const input = {
    razaoSocial: "Organização alfanumérica",
    cnpj: "12.ABC.345/01DE-35",
    enderecoCompleto: "Rua Exemplo, 1",
    telefone: "11999990000",
    email: "alpha@example.com",
  };
  const created = await post("/organizacoes", input, "cadastro");
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(created.json<{ cnpj: string }>().cnpj, "12ABC34501DE35");
  assert.equal(
    (
      await post(
        "/organizacoes",
        { ...input, cnpj: "12abc34501de35" },
        "cadastro",
      )
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await post(
        "/organizacoes",
        { ...input, cnpj: "12.ABC.345/01DE-34" },
        "cadastro",
      )
    ).statusCode,
    422,
  );
});

test("health confirma processo e banco sem exigir token", async () => {
  const response = await server().inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json(), { status: "ok" });
});

test("toda rota com :id devolve 404 para registro inexistente e 400 para id inválido", async () => {
  const missing = randomUUID();
  const cases: [string, string, object?][] = [
    ["GET", "/organizacoes/" + missing],
    [
      "PATCH",
      "/organizacoes/" + missing,
      { versao: 0, telefone: "11999990000" },
    ],
    ["GET", "/contratos/" + missing],
    ["PATCH", "/contratos/" + missing, { versao: 0, valorMensal: 10 }],
    [
      "POST",
      "/contratos/" + missing + "/renovacao",
      { versao: 0, dataVencimento: "2030-01-01" },
    ],
    ["GET", "/lotes/" + missing],
    ["PATCH", "/lotes/" + missing, { versao: 0, transportadora: "Outra" }],
    [
      "POST",
      "/lotes/" + missing + "/equipamentos",
      { versao: 0, equipamentos: (await lotBody()).equipamentos },
    ],
    ["GET", "/equipamentos/" + missing],
    [
      "POST",
      "/equipamentos/" + missing + "/movimentacoes",
      movement(0, "EM_TRIAGEM"),
    ],
    ["PATCH", "/usuarios/" + missing, { versao: 0, ativo: false }],
    ["GET", "/relatorios/organizacoes/" + missing],
  ];
  const authorization = `Bearer ${await tokenFor("admin")}`;
  for (const [method, url, payload] of cases) {
    const response = await server().inject({
      method: method as "GET",
      url,
      payload,
      headers: { authorization },
    });
    assert.equal(
      response.statusCode,
      404,
      `${method} ${url}: ${response.body}`,
    );
    assert.equal(response.json<{ erro: string }>().erro, "NAO_ENCONTRADO");
    const invalid = await server().inject({
      method: method as "GET",
      url: url.replace(missing, "nao-e-uuid"),
      payload,
      headers: { authorization },
    });
    assert.equal(invalid.statusCode, 400, `${method} ${url} com id inválido`);
  }
});

test("cadastro altera contrato com versão e o vencimento não pode anteceder a assinatura", async () => {
  const organization = await post(
    "/organizacoes",
    {
      razaoSocial: "Organização do contrato alterado",
      cnpj: "98.765.432/0001-98",
      enderecoCompleto: "Rua do Contrato, 2",
      telefone: "11999990000",
      email: "contrato@example.com",
    },
    "cadastro",
  );
  assert.equal(organization.statusCode, 201, organization.body);
  const created = await post(
    "/contratos",
    {
      organizacaoId: organization.json<{ id: string }>().id,
      dataAssinatura: "2025-01-01",
      dataVencimento: "2025-12-31",
      valorMensal: 500,
      clausulas: ["Coleta trimestral."],
    },
    "cadastro",
  );
  assert.equal(created.statusCode, 201, created.body);
  const id = created.json<{ id: string }>().id;
  const changed = await patch(
    "/contratos/" + id,
    {
      versao: 0,
      valorMensal: 650.5,
      clausulas: ["Coleta mensal."],
      renovacaoAutomatica: true,
    },
    "cadastro",
  );
  assert.equal(changed.statusCode, 200, changed.body);
  const body = changed.json<{
    versao: number;
    valorMensal: string;
    clausulas: string[];
    renovacaoAutomatica: boolean;
  }>();
  assert.equal(body.versao, 1);
  assert.equal(body.valorMensal, "650.5");
  assert.deepEqual(body.clausulas, ["Coleta mensal."]);
  assert.equal(body.renovacaoAutomatica, true);
  assert.equal(
    (await patch("/contratos/" + id, { versao: 0, valorMensal: 1 }, "cadastro"))
      .statusCode,
    409,
  );
  assert.equal(
    (
      await patch(
        "/contratos/" + id,
        { versao: 1, dataVencimento: "2024-01-01" },
        "cadastro",
      )
    ).statusCode,
    422,
  );
  const list = (
    await get(
      "/contratos?organizacaoId=" + organization.json<{ id: string }>().id,
    )
  ).json<{ id: string }[]>();
  assert.deepEqual(
    list.map((item) => item.id),
    [id],
  );
});

test("listagem de equipamentos filtra por status e código interno", async () => {
  const equipment = await newEquipment();
  const detail = (await get("/equipamentos/" + equipment.id)).json<{
    codigoBarrasInterno: string;
  }>();
  const byCode = await get(
    "/equipamentos?codigoBarrasInterno=" +
      encodeURIComponent(detail.codigoBarrasInterno),
  );
  assert.equal(byCode.statusCode, 200, byCode.body);
  assert.deepEqual(
    byCode.json<{ id: string }[]>().map((item) => item.id),
    [equipment.id],
  );
  const moved = await post(
    "/equipamentos/" + equipment.id + "/movimentacoes",
    movement(0, "EM_TRIAGEM"),
  );
  assert.equal(moved.statusCode, 201, moved.body);
  const byStatus = (
    await get("/equipamentos?status=EM_TRIAGEM&limite=100")
  ).json<{ id: string; statusRastreamento: string }[]>();
  assert.ok(byStatus.some((item) => item.id === equipment.id));
  assert.ok(byStatus.every((item) => item.statusRastreamento === "EM_TRIAGEM"));
  assert.equal((await get("/equipamentos?status=INEXISTENTE")).statusCode, 400);
});
