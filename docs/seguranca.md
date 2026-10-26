# Segurança e cenários de falha

## Credenciais e sessões

- Senhas são armazenadas com **bcrypt, custo 12**, usando bcryptjs para não exigir extensão nativa na instalação.
- Exigimos ao menos 12 caracteres e limitamos a 72 bytes UTF-8 para evitar truncamento do bcrypt.
- JWT HS256 contém identificador, papel e versão de tokens da conta, com expiração fixa de 30 minutos. Isso **não é** 30 minutos de inatividade.
- Cada requisição verifica assinatura, expiração, existência/ativação da conta e versão dos tokens; o papel atual vem do banco.
- Alterar conta, trocar senha ou sair invalida tokens anteriores. Logout encerra todas as sessões daquela conta, não somente uma aba.
- Login limita 30 tentativas por minuto por IP. Sem proxy confiável configurado, não aceitamos X-Forwarded-For como fonte de identidade.
- Não há cadastro público: seed provisiona o administrador e apenas administrador cria contas.
- O último administrador ativo não pode ser desativado ou rebaixado. A verificação e a alteração usam uma transação Serializable.

## Papéis

Todos os usuários ativos podem consultar organizações, contratos, lotes, equipamentos, parâmetros e relatórios.

| Operação de escrita      | Administrador | Cadastro | Almoxarifado | Auditor |
| ------------------------ | ------------- | -------- | ------------ | ------- |
| Organizações e contratos | Sim           | Sim      | Não          | Não     |
| Lotes e equipamentos     | Sim           | Não      | Sim          | Não     |
| Contas e parâmetros      | Sim           | Não      | Não          | Não     |
| Própria senha / logout   | Sim           | Sim      | Sim          | Sim     |

Auditoria geral só pode ser consultada por administrador ou auditor. “Somente leitura” do auditor se aplica aos dados operacionais: ele ainda pode trocar a própria senha e sair.

## Auditoria, integridade e retenção

Alterações operacionais são auditadas na mesma transação do negócio, com responsável, instante, ação e conteúdo anterior/posterior permitido. Não se registram senhas, hashes, segredo JWT ou tokens nesses snapshots.

Movimentacao e RegistroAuditoria não possuem endpoints de alteração/exclusão. Triggers no PostgreSQL recusam UPDATE e DELETE. Um administrador com controle do banco ainda pode remover as proteções; não alegamos inviolabilidade criptográfica.

Não há expurgo automático: os históricos são mantidos indefinidamente, cobrindo no mínimo os 180 dias da regra de retenção herdada. Rotação de um arquivo de journal em 10 MB era específica do armazenamento CLI e não é simulada no banco.

Unicidade, FKs, versão, intervalos monetários e algumas condições de triagem também são protegidos por constraints. O grafo e a justificativa continuam na regra de negócio.

## HTTP

- Entrada usa JSON Schema e recusa propriedades extras; Prisma parametriza as consultas.
- Nenhuma resposta de conta/histórico contém hash de senha.
- Logs não gravam corpo de login nem Authorization. Erros internos retornam mensagem genérica.
- Não há arquivos estáticos servidos; .env, código e package.json não são públicos.
- As listagens são paginadas. A permissão é verificada nos módulos de serviço.

## Dados em repouso

Os dados ficam no PostgreSQL, que **não** é criptografado em repouso automaticamente.

Em uma implantação real, configure TLS, disco/backup criptografado, usuário de banco com privilégios mínimos, gestão de segredos e backup/restauração. O Compose local não é uma implantação comercial pronta.

## Falhas exercitadas

Os testes HTTP com PostgreSQL real verificam:

- credenciais erradas, falta de token, assinatura inválida e expiração: 401;
- usuário inativo e tokens revogados: 401;
- tentativa fora do papel: 403;
- CNPJ inválido, duplicado e normalização numérica/alfanumérica;
- datas futuras, antigas e inexistentes;
- código duplicado no segundo equipamento: rollback integral do lote;
- desmonte prematuro e rebaixamento sem justificativa: nenhuma alteração;
- duas requisições com a mesma versão: uma vence e a outra recebe 409;
- mudanças simultâneas de equipamentos diferentes: status do lote correto;
- falha forçada no INSERT de movimentação: equipamento, lote e auditoria permanecem iguais;
- acesso indevido à administração, conflito de versão e proteção do último administrador;
- cálculos com exemplos numéricos independentes;
- limite de login: 429;
- registros inexistentes: 404; identificadores malformados: 400.

O CI executa a mesma suíte em Ubuntu com PostgreSQL de serviço.
