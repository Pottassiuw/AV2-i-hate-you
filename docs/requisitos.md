# Requisitos e critérios de aceitação

Fontes: **AV1.pdf** (p. 3–4, com o UML) e **AV2.pdf** (p. 3–5).

## Matriz de aceitação

As evidências automatizadas estão em `test/http.test.ts`; os testes passam pela interface HTTP com PostgreSQL real.

| ID  | Origem                 | Critério / evidência                                                                                                                                                                   |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01 | AV2 p. 3–4             | Monólito Node.js/TypeScript/Fastify/Prisma/PostgreSQL, com rota separada da regra. Implementado e compilado.                                                                           |
| R02 | AV2 p. 4               | Porta por ambiente e encerramento de HTTP/banco por sinais. Implementado em server.ts, verificado em Linux com SIGINT/SIGTERM, requisição ativa e saída 0.                             |
| R03 | AV2 p. 4; UML AV1 p. 3 | Organização com contrato opcional e vários lotes; lote com equipamentos; equipamento com movimentações. Schema, FKs, índices e migrações.                                              |
| R04 | AV1 p. 3; AV2 p. 4     | Login devolve JWT; senha incorreta, token inválido/expirado ou revogado e usuário inativo recebem 401. Testes de login, senha e logout.                                                |
| R05 | AV1 p. 3               | Quatro papéis: cadastro altera organizações/contratos; almoxarifado altera lotes/equipamentos; auditor consulta; admin administra. Testes positivos e negativos.                       |
| R06 | AV1 p. 4; AV2 p. 5     | CNPJ validado e único após normalização, inclusive alfanumérico; verificadores incorretos recebem 422 e duplicidade 409.                                                               |
| R07 | AV1 p. 4               | Entrada aceita hoje e 90 dias atrás; recusa amanhã, 91 dias atrás e datas inexistentes. Limites testados.                                                                              |
| R08 | AV2 p. 5               | Lote com vários equipamentos é atômico. Duplicidade no segundo equipamento não deixa lote parcial nem reserva o primeiro código.                                                       |
| R09 | AV1 p. 4               | Desmonte exige triagem; transição inválida recebe 422 sem alterar versão/histórico. Testes e CHECK de triagem no banco.                                                                |
| R10 | AV1 p. 4               | Rebaixamento de duas ou mais categorias exige justificativa. Recusa e sucesso com justificativa registrados nos testes.                                                                |
| R11 | AV2 p. 5               | Equipamento, movimento, lote e auditoria são atômicos. Teste concorrente 201/409 e teste de falha forçada no INSERT confirmam ausência de estado parcial.                              |
| R12 | AV1 p. 4; AV2 p. 5     | Histórico apresenta responsável, origem/destino, estados e sequência. Sem endpoint de edição/exclusão; triggers protegem UPDATE/DELETE.                                                |
| R13 | AV2 p. 5               | Seed com organização, contrato, lote e estados distintos. Reexecutável sem apagar registros ou redefinir usuários.                                                                     |
| R14 | AV2 p. 5               | Rotas documentadas em Swagger/OpenAPI; README, arquitetura, segurança e roteiro de apresentação entregues.                                                                             |
| R15 | AV1 p. 3 e UML         | Gestão de contas e parâmetros, proteção do último administrador, relatórios por organização/status e financeiro estimativo. Implementados com testes; política financeira documentada. |
| R16 | AV2 p. 4–5; UML        | Contratos com renovação/versão; organizações editáveis/desativáveis; lote complementável antes da triagem e status agregado consistente. Implementados e testados.                     |
| R17 | AV2 p. 5               | Scripts Node multiplataforma, PostgreSQL nativo ou Compose e CI Windows/Ubuntu. Executado no Linux desta sessão; execução real nos sistemas exatos exigidos não é alegada.             |
| R18 | AV1 p. 4               | Testes com jornada e falhas em `npm test`, num schema descartável do PostgreSQL; código de falha preservado para CI.                                            |
| R19 | Contexto AV2           | API HTTP monolítica documentada em OpenAPI/Swagger; front-end não exigido pelos PDFs.                                                                         |

Fastify, PostgreSQL, seed e versionamento aparecem com diferentes graus de recomendação no texto. Nós os adotamos por aderência; isso não transforma toda frase sugestiva em item obrigatório de uma rubrica inexistente.

## Políticas adotadas onde o PDF deixa lacunas

- Papéis/enums usam os nomes do UML, incluindo OPERADOR_ALMOXARIFADO para o “gestor” do texto.
- Um contrato por organização; a auditoria conserva o conteúdo anterior das renovações. Não há cobrança, pagamento ou múltiplos contratos concorrentes inventados.
- Campos do equipamento são obrigatórios. Passar de EM_TRIAGEM para AGUARDANDO_DESMONTE confirma a triagem completa e registra a data; não há checklist de inspeção adicional no PDF.
- O grafo de transições e o cálculo agregado do lote estão na arquitetura. Foram definidos explicitamente porque o UML não fornece todas as setas.
- “Duas categorias abaixo” significa duas ou mais categorias, conservadoramente.
- Datas são dias de calendário UTC, com o limite de 90 dias incluído.
- Lotes contêm 1–100 itens; peso positivo com três casas decimais; ano de fabricação entre 1900 e o ano corrente. Esses números adicionais são decisões do projeto.
- Origem/destino são locais textuais; não substituem status anterior/novo.
- Financeiro é uma estimativa linear por peso/idade com parâmetros configuráveis. Mensalidades vigentes são separadas; não se afirma receita recebida nem lucro real.
- O campo de previsão de renovação automática é conservado; estender a vigência exige comando explícito auditado, não um agendador implícito.
- Não há herança/fábricas artificiais só para reproduzir cada classe de infraestrutura do CLI. As entidades do negócio e as regras continuam reconhecíveis.

## Limites de comprovação, não funcionalidades adiadas

Não há garantia de nota e não há rubrica fornecida. Não alegamos que Windows 10/Ubuntu 24.04.03 foram executados quando só temos a sessão Linux disponível. CI está preparado, mas depende da execução pelo provedor.

Também não se declara infraestrutura de produção pronta: TLS, backups, criptografia de disco e controle administrativo do banco precisam de implantação adequada. Não se implementam certificados ambientais, cotações externas ou outros negócios futuros mencionados apenas como possibilidades na narrativa.
