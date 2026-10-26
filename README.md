# Greencode AV2

API HTTP monolítica de logística reversa de equipamentos eletrônicos (Fastify + Prisma + PostgreSQL).

## Rodar

Requisitos: Node 22 e Docker (ou um PostgreSQL local).

```sh
npm install
cp .env.example .env        # já vem com valores de desenvolvimento que funcionam
docker compose up -d --wait # PostgreSQL em localhost:5432
npm run setup               # gera o client Prisma, aplica migrações e roda o seed
npm run dev                 # http://127.0.0.1:3000 (reinicia ao salvar)
```

Explore e teste as rotas pelo **Swagger em <http://127.0.0.1:3000/docs>** ou pelo arquivo [docs/jornada.http](docs/jornada.http) (REST Client / Postman).

| Conta (senha `GreencodeDemo123!`) | Papel                   |
| --------------------------------- | ----------------------- |
| `admin@greencode.local`           | Administrador           |
| `cadastro@greencode.local`        | Operador de cadastro    |
| `almoxarifado@greencode.local`    | Gestor de almoxarifado  |
| `auditor@greencode.local`         | Auditor, sem alterações |

## Scripts

| Comando             | O que faz                                                     |
| ------------------- | ------------------------------------------------------------- |
| `npm run setup`     | `prisma generate` + migrações + seed (pode repetir)           |
| `npm run dev`       | servidor com recarga automática                               |
| `npm start`         | servidor sem recarga                                          |
| `npm test`          | testes de integração de todas as rotas, com PostgreSQL real   |
| `npm run typecheck` | checagem de tipos TypeScript                                  |
| `npm run db:studio` | Prisma Studio para ver o banco                                |

## Funcionalidades

- Organizações: cadastro, consulta, edição e desativação; CNPJ numérico e alfanumérico com verificadores e unicidade.
- Contratos: cadastro único por organização, consulta, edição e renovação de vigência.
- Lotes: recebimento atômico de vários equipamentos, complemento antes da triagem e correção de metadados.
- Equipamentos: filtros, código interno, triagem, transições, estado físico, justificativa e histórico.
- Status do lote calculado a partir de **todos** os equipamentos, inclusive sob concorrência.
- Usuários e quatro papéis; proteção contra remoção do último administrador ativo.
- Login JWT, troca de senha, logout com revogação de tokens e limite de tentativas.
- Parâmetros de imposto/depreciação e valor-base por peso.
- Relatórios por organização, por status e financeiro estimativo.
- Auditoria de alterações com responsável e dados anteriores/posteriores, sem senhas.
- OpenAPI/Swagger, migrações versionadas e seed.

## Documentação

1. [Glossário](GLOSSARY.md): significado dos termos.
2. [Requisitos](docs/requisitos.md): requisitos atendidos e decisões assumidas.
3. [Arquitetura](docs/arquitetura.md): estrutura e transações.
4. [Segurança](docs/seguranca.md): autenticação, permissões, auditoria e limites.
5. [Roteiro de apresentação](docs/apresentacao.md): como demonstrar e explicar o código.

Comece o código por `prisma/schema.prisma`, depois siga uma rota de `organizations`.

## Contrato HTTP

Consulte todos os schemas de entrada no Swagger. Rotas de negócio exigem `Authorization: Bearer <token>`.

| Área         | Rotas principais                                                                           |
| ------------ | ------------------------------------------------------------------------------------------ |
| Autenticação | `POST /auth/login`, `GET /auth/me`, `POST /auth/senha`, `POST /auth/logout`                |
| Organizações | `POST/GET /organizacoes`, `GET/PATCH /organizacoes/:id`                                    |
| Contratos    | `POST/GET /contratos`, `GET/PATCH /contratos/:id`, `POST /contratos/:id/renovacao`         |
| Lotes        | `POST/GET /lotes`, `GET/PATCH /lotes/:id`, `POST /lotes/:id/equipamentos`                  |
| Equipamentos | `GET /equipamentos`, `GET /equipamentos/:id`, `POST /equipamentos/:id/movimentacoes`       |
| Parâmetros   | `GET/PATCH /parametros`                                                                    |
| Relatórios   | `GET /relatorios/status`, `GET /relatorios/financeiro`, `GET /relatorios/organizacoes/:id` |
| Auditoria    | `GET /auditoria`                                                                           |

- Atualizações exigem a `versao` lida anteriormente; conflitos retornam **409**. Cada movimentação também incrementa a versão do lote.
- Listagens devolvem arrays e aceitam `pagina` e `limite` (1 a 100; padrão 100).
- Datas usam `AAAA-MM-DD`, com calendário **UTC**. Relatórios filtram pela data de entrada do lote, não pela data de cada movimentação.
- Valores Decimal são strings nas respostas. Taxas são frações: `0.10` significa 10%.
- Erros conhecidos usam `{ "erro": "CODIGO", "mensagem": "Descrição" }`: 400 formato, 401 autenticação, 403 permissão, 404 inexistência, 409 conflito, 422 negócio e 429 excesso de tentativas.
- Não há exclusão física pela API: organizações/usuários são desativados e o histórico é preservado.

## Testes

```sh
npm test
```

Usa o `DATABASE_URL` do `.env`, mas cria um **schema aleatório** só para a execução e o apaga no fim — seus dados de desenvolvimento não são tocados. Cobre todas as rotas pela API (sucesso, 400/401/403/404/409/422/429), jornada completa, papéis, rollback e concorrência. O CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) roda o mesmo fluxo com um PostgreSQL de serviço.

Para alterar o schema:

```sh
npx prisma migrate dev --name nome_da_alteracao
```

Mantenha as migrações: há constraints e triggers SQL não representados integralmente no schema Prisma.

## Limites

As fórmulas financeiras e o significado operacional de “triagem completa” não são detalhados integralmente pelos PDFs; as políticas adotadas estão explícitas na documentação. TLS, backups e infraestrutura de produção ficam fora do escopo.
