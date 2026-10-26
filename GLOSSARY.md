# Greencode — logística reversa de eletrônicos

O greencode acompanha equipamentos descartados por organizações geradoras, desde o recebimento até a destinação final.

## Linguagem

**Organização**:
Pessoa jurídica geradora de resíduos eletrônicos atendida pelo greencode.
_Evitar_: usuário, fornecedor, comprador.

**Contrato**:
Acordo de coleta de uma organização, com vigência, cláusulas e valor mensal.
_Evitar_: lote, pedido de coleta.

**Lote**:
Conjunto de equipamentos recebidos de uma mesma organização em uma entrada, identificado por nota fiscal e transportadora.
_Evitar_: estoque, organização.

**Equipamento**:
Item físico de informática ou telecomunicações rastreado individualmente por um código de barras interno.
_Evitar_: lote, peça reaproveitada.

**Movimentação**:
Registro histórico de um evento do equipamento, com origem, destino, responsável e momento da ocorrência.
_Evitar_: edição do histórico, movimentação de lote.

**Status de rastreamento**:
Etapa operacional do equipamento, da espera pela triagem à baixa definitiva.
_Evitar_: estado físico, status do lote.

**Estado físico**:
Classificação da conservação do equipamento, ordenada de novo a inservível.
_Evitar_: status de rastreamento.

**Triagem**:
Avaliação e classificação do equipamento que precede sua liberação para desmonte.
_Evitar_: desmonte, recebimento.

**Status do lote**:
Etapa de processamento do conjunto recebido; não se confunde com a etapa de cada equipamento.
_Evitar_: status de rastreamento.

**Administrador**:
Responsável pela gestão de acessos e parâmetros globais, com privilégios elevados de operação.
_Evitar_: organização, cliente.

**Operador de cadastro**:
Responsável pelo cadastro das organizações e de seus contratos.
_Evitar_: gestor de almoxarifado.

**Gestor de almoxarifado**:
Responsável pelo recebimento de lotes, triagem e movimentações dos equipamentos.
_Evitar_: operador de cadastro.

**Auditor**:
Responsável por consultar históricos e relatórios sem alterar os registros operacionais.
_Evitar_: administrador.

**Auditoria de operações**:
Histórico de quem criou ou alterou os registros de negócio, com o conteúdo anterior e posterior permitido para consulta.
_Evitar_: movimentação de equipamento, log de acesso.

**Valor estimado de recuperação**:
Estimativa econômica do equipamento considerando seu peso, uma referência de valor e seu tempo de uso.
_Evitar_: preço de venda, receita realizada, lucro.

**Depreciação anual**:
Redução proporcional do valor de referência a cada ano de idade do equipamento.
_Evitar_: imposto, estado físico.

**Receita mensal contratada**:
Soma das mensalidades dos contratos vigentes em uma data de referência, sem indicar recebimento efetivo.
_Evitar_: faturamento recebido, valor do estoque.
