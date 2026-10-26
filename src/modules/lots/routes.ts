import {
  EstadoFisico,
  TipoEquipamento,
  type PrismaClient,
} from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { actorFrom } from "../../plugins/auth.js";
import {
  DateOnly,
  IdParams,
  NonBlank,
  PageFields,
  PeriodFields,
  Version,
} from "../../shared/schemas.js";
import {
  addEquipment,
  createLot,
  getLot,
  listLots,
  updateLot,
} from "./service.js";

const EquipmentBody = Type.Object(
  {
    codigoBarrasInterno: NonBlank(80),
    tipo: Type.Enum(TipoEquipamento),
    marca: NonBlank(100),
    modelo: NonBlank(100),
    anoFabricacao: Type.Integer({ minimum: 1900 }),
    estadoFisico: Type.Enum(EstadoFisico),
    pesoQuilogramas: Type.Number({
      exclusiveMinimum: 0,
      maximum: 9999999.999,
      multipleOf: 0.001,
    }),
  },
  { additionalProperties: false },
);
const EquipmentList = Type.Array(EquipmentBody, { minItems: 1, maxItems: 100 });

export function registerLotRoutes(instance: FastifyInstance, db: PrismaClient) {
  const app = instance.withTypeProvider<TypeBoxTypeProvider>();
  const base = { tags: ["Lotes"], security: [{ bearerAuth: [] }] };
  app.post(
    "/lotes",
    {
      schema: {
        ...base,
        summary: "Receber lote e equipamentos atomicamente",
        body: Type.Object(
          {
            organizacaoId: Type.String({ format: "uuid" }),
            dataEntrada: DateOnly,
            notaFiscal: NonBlank(60),
            transportadora: NonBlank(200),
            observacoes: Type.Optional(NonBlank(2000)),
            equipamentos: EquipmentList,
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(await createLot(db, actorFrom(request), request.body)),
  );

  app.get(
    "/lotes",
    {
      schema: {
        ...base,
        summary: "Listar lotes por organização e período",
        querystring: Type.Object(
          { ...PageFields, ...PeriodFields },
          { additionalProperties: false },
        ),
      },
    },
    (request) => listLots(db, actorFrom(request), request.query),
  );
  app.get(
    "/lotes/:id",
    {
      schema: {
        ...base,
        summary: "Consultar lote e equipamentos",
        params: IdParams,
      },
    },
    (request) => getLot(db, actorFrom(request), request.params.id),
  );
  app.patch(
    "/lotes/:id",
    {
      schema: {
        ...base,
        summary: "Corrigir metadados do lote com versão",
        params: IdParams,
        body: Type.Object(
          {
            versao: Version,
            dataEntrada: Type.Optional(DateOnly),
            notaFiscal: Type.Optional(NonBlank(60)),
            transportadora: Type.Optional(NonBlank(200)),
            observacoes: Type.Optional(NonBlank(2000)),
          },
          { additionalProperties: false, minProperties: 2 },
        ),
      },
    },
    (request) =>
      updateLot(db, actorFrom(request), request.params.id, request.body),
  );
  app.post(
    "/lotes/:id/equipamentos",
    {
      schema: {
        ...base,
        summary: "Adicionar equipamentos antes da triagem",
        params: IdParams,
        body: Type.Object(
          { versao: Version, equipamentos: EquipmentList },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await addEquipment(
            db,
            actorFrom(request),
            request.params.id,
            request.body,
          ),
        ),
  );
}
