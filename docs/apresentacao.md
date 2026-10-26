# Roteiro de apresentação e estudo

## Demonstração em 10 minutos

Prepare o ambiente como no README (`docker compose up -d --wait`, `npm run setup`, `npm run dev`) e abra o Swagger em <http://127.0.0.1:3000/docs>. Também dá para seguir os passos com [jornada.http](jornada.http).

1. `POST /auth/login` com admin@greencode.local / GreencodeDemo123!; use o token no botão **Authorize**.
2. `POST /organizacoes` com CNPJ válido, por exemplo 04.252.011/0001-10. O seed usa outro CNPJ.
3. `POST /contratos` para essa organização; depois `POST /contratos/:id/renovacao` para uma data posterior.
4. `POST /lotes` com dois equipamentos. O peso aceita três casas decimais.
5. `POST /equipamentos/:id/movimentacoes` percorrendo EM_TRIAGEM → AGUARDANDO_DESMONTE → EM_DESMONTE; `GET /equipamentos/:id` mostra histórico e responsável.
6. Tente passar diretamente de AGUARDANDO_TRIAGEM para EM_DESMONTE em outro item: o servidor recusa (422).
7. Tente rebaixar BOM_ESTADO para USADO_MODERADO sem justificativa; depois repita com justificativa.
8. Mostre `GET /lotes/:id` (status agregado), `/relatorios/*` e `/auditoria`.
9. Entre como auditor@greencode.local (mesma senha) e mostre que alterações retornam 403.
10. Rode `npm test`: a suíte usa um schema próprio e descartável.

## Caminho para aprender o código

1. **schema.prisma:** entenda as chaves e cardinalidades.
2. **organizations/routes.ts → service.ts:** formato HTTP, autorização, CNPJ e gravação.
3. **lots/service.ts:** recebimento de vários itens e por que é uma transação.
4. **equipment/service.ts:** status, justificativa, versão e histórico.
5. **lots/status.ts:** por que o lock do lote vem antes da releitura dos equipamentos.
6. **plugins/auth.ts e users/service.ts:** JWT não dispensa autorização nem checagem da conta.
7. **reports/service.ts:** faça o cálculo à mão com o exemplo abaixo.
8. **test/http.test.ts:** acompanhe as jornadas por HTTP; não é necessário decorar o funcionamento interno do Prisma.

Exemplo financeiro: 10 kg × R$100/kg = R$1.000. Dois anos com depreciação de 10%/ano dão R$800. Imposto estimado de 25% dá R$200, restando R$600 estimados. Mensalidades contratuais ficam separadas.

## Perguntas que você deve conseguir responder

**Por que um monólito?** Um processo, um banco e implantação/depuração simples para o tamanho da atividade.

**Onde está o Repository?** O Prisma Client cumpre o acesso a dados concreto. Não adicionamos uma classe por tabela para repassar a mesma chamada.

**Por que transação?** Para não deixar equipamento alterado sem movimento ou metade do lote criada.

**Por que versão?** Para não sobrescrever silenciosamente a edição de outra requisição.

**Por que não há herança artificial?** Os conceitos do UML são preservados no modelo e nas regras; não criamos classes-base sem comportamento compartilhado só para aumentar camadas.

**A fórmula financeira está no PDF?** Não. É uma política didática explícita e configurável, não uma regra atribuída ao professor nem uma cotação real de mercado.

**Qual o critério de triagem completa?** Campos classificados no recebimento e confirmação do operador ao passar para AGUARDANDO_DESMONTE. O enunciado não dá um checklist adicional.

**O auditor pode trocar a própria senha?** Sim. Ele não altera registros operacionais, mas pode cuidar da própria credencial.

## Evidências obtidas nesta sessão

- Suíte HTTP real com PostgreSQL, incluindo falha forçada, rollback e concorrência.
- Geração Prisma, migrações, tipagem e compilação.
- Chromium real: login, organização, contrato/renovação, recebimento, triagem/desmonte, relatórios, usuário, parâmetros, auditoria e acesso de auditor.
- Servidor compilado por socket HTTP, dados preservados entre reinicializações e encerramento Linux por SIGINT/SIGTERM aguardando uma requisição ativa, com saída 0.
- Demonstração sem Docker e seed reexecutável.

O navegador foi usado como smoke de execução, não como dependência permanente nem parte da contagem de testes HTTP. GitHub Actions está preparado para Windows e Ubuntu, mas os jobs não foram executados nesta sessão. Não apresente configuração de CI como certificação de Windows 10 ou de uma edição específica do Ubuntu.
