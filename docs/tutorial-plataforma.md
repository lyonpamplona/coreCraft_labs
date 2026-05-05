# Tutorial da Plataforma

Este tutorial mostra como preparar o ambiente, acessar a interface e usar cada funcao disponivel no coreCraft Multi-Node.

## 1. Preparar o Ambiente

### Requisitos

- Docker instalado.
- Docker Compose instalado.
- Porta `8005` livre no host.
- Espaco em disco suficiente para os volumes dos nodes Bitcoin.

### Criar Arquivos Locais

Na primeira execucao, copie os modelos versionados:

```bash
cp .env.example .env
cp bitcoin.conf.example bitcoin.conf
```

O arquivo `.env` guarda variaveis de ambiente e senhas RPC em texto puro. O arquivo `bitcoin.conf` guarda a configuracao lida pelos containers Bitcoin Core. Os dois arquivos reais sao locais e ignorados pelo Git.

### Configurar Credenciais RPC

Para cada rede, o `bitcoin.conf` deve ter um `rpcauth` e o `.env` deve ter usuario e senha correspondentes.

Fluxo recomendado:

1. Gere um par `rpcauth` para `mainnet`, `signet` e `regtest`.
2. Coloque o valor `rpcauth=<usuario>:<salt>$<hash>` em `bitcoin.conf`.
3. Coloque o mesmo usuario em `<REDE>_RPC_USER` no `.env`.
4. Coloque a senha original em `<REDE>_RPC_PASS` no `.env`.
5. Configure `APP_AUTH_TOKEN` no `.env`; ele sera solicitado pela interface web.
6. Ajuste `RPC_TIMEOUT_SECONDS`, `RPC_CACHE_SECONDS` e `RPC_ERROR_CACHE_SECONDS` se seus nodes estiverem lentos durante sincronizacao ou pruning.

Opcionalmente, use o script local para sincronizar `rpcauth` a partir das
senhas do `.env` sem imprimir segredos no terminal:

```bash
python3 scripts/sync_rpcauth.py --env-file .env --bitcoin-conf bitcoin.conf
```

### Subir os Servicos

```bash
docker compose up --build
```

Para executar em segundo plano:

```bash
docker compose up --build -d
```

Verifique o estado dos containers:

```bash
docker compose ps
```

## 2. Acessar a Plataforma

Abra no navegador:

```text
http://localhost:8005
```

Se `REQUIRE_AUTH=True`, a plataforma exibira a tela de login solicitando o token. Informe o valor de `APP_AUTH_TOKEN` definido no `.env`.

Depois da validacao, o backend grava um cookie `HttpOnly` para a sessao do painel. O token nao fica salvo em `localStorage` e nao e enviado na URL do WebSocket. As mensagens de sucesso, erro e alerta aparecem como toasts dentro da interface, sem depender de notificacoes nativas do navegador.

## 3. Conhecer a Tela

### Shell IDE

A interface usa um layout inspirado em IDE. O cabecalho mostra o comando/contexto ativo, o estado da conexao e o operador. A selecao de rede fica no Explorer lateral e tambem nas abas superiores. O painel central alterna entre `rpc.response`, viewer de documentacao e terminal, mantendo a timeline de eventos na lateral direita.

| Item | Descricao |
| --- | --- |
| `mainnet` | Seleciona o node Bitcoin em rede principal. Use preferencialmente comandos somente leitura. |
| `signet` | Seleciona a rede publica de testes signet. Boa para experimentos sem valor real. |
| `regtest` | Seleciona a rede local de testes. Permite minerar blocos sob demanda. |
| `docs` | Abre o viewer de documentacao no painel central. |
| `ONLINE/CONECTANDO/ERRO` | Indicador de estado do WebSocket e da sessao do painel. |
| `developer@corecraft` | Identidade visual do operador exibida na interface. |

Ao trocar de rede, a plataforma:

- ativa o terminal daquela rede;
- muda a cor de destaque dos cards;
- limpa a timeline visivel;
- busca o status atual do node;
- carrega o ultimo bloco conhecido quando a rede ativa e `regtest`;
- mostra o grupo **Endereco**, **Saldo**, **Forjar 100** e **Forjar 1** somente em `REGTEST`.

O painel comeca em `regtest` apos a autenticacao. Quando a preferencia
**Mostrar mainnet** fica desligada e a rede ativa era `mainnet`, a interface
volta automaticamente para `regtest`.

### Activity Bar

A barra vertical esquerda alterna os paineis laterais:

| Icone | Painel | Funcao |
| --- | --- | --- |
| Explorer | Redes | Lista `mainnet`, `signet`, `regtest` e `docs`. |
| Docs | Documentacao | Abre o menu de guias e troca a area central para o viewer de docs. |
| Busca | Busca local | Filtra comandos e eventos exibidos no painel lateral. |
| Fluxos | Automacoes | Lista fluxos operacionais planejados, como wallet e mineracao. |
| Execucao | Macros | Permite escolher uma macro e executar no terminal da rede ativa. |
| Ajustes | Preferencias | Abre preset de tema, fonte, cores e opcoes de interface. |

Em telas estreitas, o painel lateral funciona como drawer sobre o conteudo central.

### Dashboard

O dashboard fica abaixo do cabecalho e tem tres cards agregados. Eles sao
alimentados por endpoints `/api/*`, nao por chamadas RPC diretas do navegador.

| Card | Origem | O que significa |
| --- | --- | --- |
| `Node Sync & Divergence` | `/api/blockchain/lag/` + `/api/events/state-comparison/` | Mostra blocos, lag entre headers/blocos e se o melhor bloco RPC diverge do ultimo bloco visto via ZMQ. |
| `Mempool Intelligence` | `/api/mempool/summary/` | Mostra total de transacoes, fee media em sat/vB e distribuicao Low/Medium/High. |
| `Event Activity (ZMQ)` | `/api/events/summary/` | Mostra tx/s, transacoes vistas e blocos vistos pelo listener ZMQ. |

As metricas sao atualizadas automaticamente com polling controlado de 15 segundos,
trava de concorrencia e backoff temporario quando uma rede demora para responder.
Quando a mempool passa de 1500 transacoes, o backend evita a varredura profunda
de `getrawmempool true` e marca a distribuicao como omitida.

### Toolbar e Comandos do Terminal

| Botao | Comando executado | Observacao |
| --- | --- | --- |
| `Info` | `getblockchaininfo` | Mostra status completo da blockchain da rede ativa. |
| `Peers` | `getpeerinfo` | Lista peers conectados quando o metodo estiver permitido na rede ativa. |
| `Mempool` | `getmempoolinfo` | Mostra resumo da mempool da rede ativa. |
| `Taxas (6 blk)` | `estimatesmartfee 6` | Estima a taxa para confirmacao em aproximadamente 6 blocos. |
| `Endereco` | `getnewaddress` | Gera um novo endereco na carteira regtest. O painel carrega/cria a wallet `corecraft` automaticamente. |
| `Saldo` | `getbalance` | Consulta saldo da carteira regtest. O painel carrega/cria a wallet `corecraft` automaticamente. |
| `Forjar 100` | `loadwallet/createwallet` + `getnewaddress` + `generatetoaddress 100 <endereco>` | Aparece apenas em `REGTEST`; serve para maturar recompensas coinbase anteriores rapidamente. |
| `Forjar 1` | `loadwallet/createwallet` + `getnewaddress` + `generatetoaddress 1 <endereco>` | Aparece apenas em `REGTEST`; cria um bloco de laboratorio. |
| `Ajuda` | `help` | Exibe o help real do Bitcoin Core no terminal. |
| `Limpar` | Acao local | Limpa o terminal ativo e recria o prompt. |

A faixa de comandos e agrupada por rede, mempool, wallet/mineracao e utilitarios.
O grupo de wallet/mineracao fica oculto em `MAINNET` e `SIGNET`; alem disso,
`executeMacro` bloqueia esses comandos fora de `REGTEST` mesmo se forem
disparados manualmente pelo console do navegador.

### Viewer de Docs

Clique em `docs` no Explorer, na Activity Bar ou na aba superior `docs` para trocar a area central do terminal para o viewer de documentacao. O menu de Docs permite escolher:

- Arquitetura;
- Comandos;
- Fluxos;
- Operacao.

O viewer mostra resumos operacionais rapidos dentro do painel. A documentacao completa continua no diretorio `docs/`, com arquivos como `arquitetura.md`, `comandos.md`, `fluxos.md`, `configuracao.md` e `bitcoin-cli-docker.md`.

### Ajustes de Interface

A aba **Ajustes** tem navegacao interna por secoes. Apenas uma secao fica aberta por vez para evitar quebra visual:

| Secao | Descricao |
| --- | --- |
| `Preset` | Alterna entre temas predefinidos. |
| `Fonte` | Seleciona fontes mono e Nerd Fonts quando instaladas no sistema. |
| `Cores` | Permite editar variaveis principais do tema em tempo real. |
| `Interface` | Reune toggles visuais, incluindo mostrar/ocultar rodape, e o reset das preferencias. |

Tema, fonte e preferencias visuais sao salvos no `localStorage` do navegador.
O terminal usa `xterm-addon-fit` para recalcular colunas e linhas apos resize,
troca de rede, mudanca de fonte e retorno da aba do navegador.

As preferencias de interface disponiveis hoje sao:

- `Compactar timeline`: reduz a densidade visual da timeline.
- `Fixar terminal`: aplica modo de terminal fixo no shell.
- `Mostrar rodape`: mostra ou oculta a statusbar inferior.
- `Mostrar mainnet`: esconde a mainnet da navegacao visual quando voce quer operar apenas redes de teste.
- `Restaurar tema`: remove tema, fonte e preferencias salvas, voltando ao preset `coreCraft Dark`.

### Redimensionamento dos Paineis

Em telas desktop, o painel permite arrastar divisorias:

- divisoria lateral esquerda: altera a largura do Explorer/Busca/Fluxos/Execucao/Ajustes;
- divisoria lateral direita: altera a largura da timeline;
- divisoria horizontal acima do terminal: altera a altura da area central do terminal/docs.

### Terminal RPC

Cada rede tem um terminal proprio. O terminal ativo mostra um prompt no formato:

```text
developer@regtest:~$
```

Recursos do terminal:

- `Enter`: executa o comando digitado.
- `Backspace`: apaga caracteres.
- `Seta para cima`: navega para comandos anteriores daquela rede.
- `Seta para baixo`: volta no historico.
- `Tab`: tenta autocompletar comandos conhecidos.
- `clear`: limpa o terminal ativo.
- `help`: consulta o help completo real do Bitcoin Core e exibe todas as secoes.
- `help <categoria>`: filtra uma secao completa do help real, por exemplo `help blockchain`, `help wallet`, `help network`, `help mining`, `help rawtransactions`, `help util` ou `help zmq`.
- `help <comando>`: quando o argumento nao corresponde a uma categoria, tenta mostrar a ajuda especifica do comando informado.

Categorias esperadas pelo Bitcoin Core nesta plataforma: `blockchain`,
`control`, `mining`, `network`, `rawtransactions`, `signer`, `util`, `wallet`
e `zmq`. Exemplos validos:

```text
help blockchain
help control
help mining
help network
help rawtransactions
help signer
help util
help wallet
help zmq
help getblock
```

Comandos sugeridos pelo autocomplete:

```text
getblockchaininfo
getmempoolinfo
estimatesmartfee
getnewaddress
getbalance
generatetoaddress
sendtoaddress
getblock
getblockhash
inspect_tx
help
clear
```

O comando especial `inspect_tx` e tratado pelo backend em `core.rpc`: ele aceita
um txid ou hexadecimal bruto, tenta buscar a transacao via `getrawtransaction`
quando recebe um txid e retorna um resumo estruturado de entradas, saidas,
tamanho, coinbase e valor total de saida.

### Timeline de Consenso

A timeline fica na lateral direita e exibe eventos recebidos do backend em tempo real.

Ela pode mostrar:

- novos blocos;
- transacoes recebidas;
- altura do bloco quando disponivel;
- hash do bloco quando o evento vem de `hashblock`;
- tamanho do bloco;
- quantidade de transacoes;
- valor total aproximado de saidas para `rawtx` quando a transacao pode ser desserializada;
- taxas totais quando o evento enriquecido estiver disponivel.

Os cards da timeline usam formato visual com altura, status, hash/resumo, tx, peso, taxas, origem e horario.
O feed visivel fica limitado aos 18 eventos mais recentes para preservar a
responsividade e a leitura.

Os eventos saem dos nodes Bitcoin Core por ZMQ, passam pelo `zmq-listener`, sao publicados no Redis/Channels e chegam ao navegador pelo WebSocket `/ws/btc/`.
Por padrao, `mainnet` e `signet` assinam `rawblock,hashblock`; `regtest`
tambem assina `rawtx`.

## 4. Tutorial Pratico em Regtest

`REGTEST` e a rede mais indicada para aprender a usar a plataforma, porque tudo acontece localmente e voce pode minerar blocos quando quiser.

### Selecionar Regtest

Clique em:

```text
REGTEST
```

O terminal deve mostrar:

```text
developer@regtest:~$
```

### Criar ou Carregar uma Carteira

No terminal, execute:

```text
createwallet miner
```

O painel tambem consegue carregar ou criar automaticamente a carteira padrao `corecraft` quando voce usa **Endereco**, **Saldo**, **Forjar 100** ou **Forjar 1**. O comando manual acima continua util quando voce quer criar uma carteira com outro nome.

Para conferir a wallet padrao usada pela interface:

```text
listwallets
loadwallet corecraft
```

### Gerar um Endereco

Use o botao **Endereco** ou digite:

```text
getnewaddress
```

Guarde o endereco retornado para minerar blocos manualmente.

### Minerar Blocos Manualmente

Para minerar um bloco:

```text
generatetoaddress 1 <endereco>
```

Para minerar 101 blocos e amadurecer recompensas coinbase:

```text
generatetoaddress 101 <endereco>
```

Depois consulte o saldo:

```text
getbalance
```

Para conferir os detalhes da rede apos minerar:

```text
getblockcount
getblockchaininfo
```

### Minerar Pelos Botoes

Para criar um bloco de laboratorio, clique em:

```text
Forjar 1
```

A plataforma executa internamente:

```text
listwallets
loadwallet corecraft
getnewaddress
generatetoaddress 1 <endereco-gerado>
```

Se a carteira `corecraft` ainda nao existir, a plataforma tenta executar `createwallet corecraft` antes de gerar o endereco.

Para amadurecer recompensas coinbase rapidamente, clique em:

```text
Forjar 100
```

Esse atalho executa o mesmo preparo de wallet/endereco e chama
`generatetoaddress 100 <endereco-gerado>`. Ele e util em demos para amadurecer
recompensas coinbase anteriores; em uma rede zerada, use **Forjar 1** e depois
**Forjar 100** para chegar ao periodo de maturacao esperado em regtest.

### Observar Eventos

Depois de minerar um bloco, observe:

- uma mensagem ZMQ no terminal;
- um novo card na timeline;
- atualizacao dos cards de Node Sync & Divergence e Event Activity.

## 5. Usar Signet

`SIGNET` e uma rede publica de testes. Ela e boa para validar comportamento em rede externa sem usar bitcoin real.

Clique em:

```text
SIGNET
```

Comandos recomendados:

```text
getblockchaininfo
getblockcount
getbestblockhash
getmempoolinfo
getnetworkinfo
getpeerinfo
help blockchain
help network
```

Comandos fora da allowlist podem ser bloqueados com uma mensagem semelhante a:

```text
Metodo bloqueado em signet: <metodo>
```

## 6. Usar Mainnet

`MAINNET` aponta para a rede principal Bitcoin. Por seguranca, trate essa rede como somente leitura dentro da plataforma.

Clique em:

```text
MAINNET
```

Comandos recomendados:

```text
getblockchaininfo
getblockcount
getbestblockhash
getmempoolinfo
getnetworkinfo
getpeerinfo
help blockchain
help network
```

Comandos de escrita, carteira ou envio de fundos nao devem ser habilitados em mainnet sem uma revisao de seguranca especifica.

Durante sincronizacao inicial ou pruning, chamadas em mainnet podem levar mais tempo.
O painel usa timeout, cache de consultas read-only e backoff para reduzir loops
de requisicoes quando o node ainda esta ocupado.

## 7. Funcoes Internas da Interface

Esta secao mapeia as principais funcoes JavaScript presentes nos modulos de
`static/js/panel/`: `state.js`, `terminal.js`, `ui.js`, `api.js` e `main.js`.

| Funcao | Responsabilidade |
| --- | --- |
| `clearLine(t, currentInput)` | Remove visualmente a linha digitada no terminal para permitir reescrita durante historico/autocomplete. |
| `writePrompt(t, net)` | Escreve o prompt `developer@<rede>:~$` no terminal informado. |
| `fitTerminal(net)` / `scheduleTerminalFit(net)` | Recalcula colunas e linhas do xterm apos resize, troca de rede, mudanca de fonte ou retorno da aba do navegador. |
| `focusTerminal(net)` | Foca o terminal ativo, ajusta o tamanho e rola a saida para o final. |
| `switchNet(net)` | Troca a rede ativa, muda estado visual dos botoes, altera cor dos cards, mostra/esconde o grupo de wallet/mineracao, foca o terminal, limpa a timeline e recarrega status. |
| `selectMainView(view, tabName)` | Alterna a area central entre terminal e viewer de documentacao. |
| `selectSidePanel(view)` | Alterna Explorer, Docs, Busca, Fluxos, Execucao e Ajustes na barra lateral. |
| `selectSettingsSection(section)` | Alterna a secao ativa da aba Ajustes. |
| `applyTheme(values, presetName)` | Aplica variaveis CSS de tema e sincroniza os inputs de cor. |
| `loadTheme()` / `loadFont()` / `loadUiPrefs()` | Restaura preferencias visuais salvas no navegador. |
| `applyStatusbarPreference(visible)` | Mostra ou oculta a barra de rodape sem sobrepor o terminal. |
| `buildLocalHelpOutput(topic)` | Monta ajuda local de contingencia quando o RPC `help` nao retorna uma categoria real. |
| `normalizeHelpCategory(category)` | Normaliza nomes e aliases de categorias do `help`, como `rawtx` para `rawtransactions` e `mineracao` para `mining`. |
| `extractHelpCategoryOutput(fullHelp, category)` | Filtra uma secao completa do `help` real do Bitcoin Core. |
| `writeTerminalOutput(t, output)` | Escreve saidas no terminal com limite de linhas, exceto para `help`, que pode exibir a saida completa. |
| `renderRpcResponse(net, cmd, data)` | Atualiza o bloco `rpc.response` com o ultimo retorno RPC ou erro. |
| `showDocTopic(topic)` | Troca o conteudo do viewer de Docs conforme o item escolhido no menu. |
| `clearActiveTerminal()` | Limpa o terminal da rede ativa, recria o cabecalho do terminal, zera o input local e devolve o foco. |
| `authHeaders()` | Monta headers HTTP com `Content-Type: application/json`; chamadas do navegador usam cookie `HttpOnly` apos login. |
| `handleSocketMessage(e)` | Valida o JSON recebido via WebSocket, escreve mensagens ZMQ no terminal correto e adiciona blocos na timeline quando a rede ativa corresponde ao evento. |
| `addBlockToFeed(d, time)` | Cria um card visual na timeline com altura, tamanho, quantidade de transacoes e taxas quando disponiveis, mantendo limite de eventos recentes. |
| `formatHelpOutput(t, text)` | Formata a saida textual do comando `help`, destacando categorias e comandos. |
| `processCommand(net, cmd, silent)` | Envia o comando para `/terminal/`, trata erro de token, imprime resultado no terminal ou retorna o JSON em modo silencioso. |
| `fetchNodeStatus()` | Consulta `/api/blockchain/lag/`, `/api/mempool/summary/`, `/api/events/summary/` e `/api/events/state-comparison/` com trava de concorrencia, backoff e pausa quando a aba nao esta visivel. |
| `loadInitialBlocks()` | Busca `/api/events/latest/` apenas no `regtest` e adiciona o bloco recente na timeline. |
| `executeMacro(cmd)` | Executa comandos dos botoes rapidos no terminal da rede ativa, envia objetos grandes para `rpc.response`, bloqueia wallet/mineracao fora do regtest e trata o atalho `generatetoaddress 100 [auto]`. |
| `mineBlockMacro()` | Automatiza mineracao de um bloco em regtest gerando endereco e chamando `generatetoaddress 1 <endereco>`. |
| `verifyToken(token)` | Valida token inicial ou cookie `HttpOnly` em `/auth/verify/`. |
| `updateDashboardValue(elementId, newValue)` | Atualiza um valor do dashboard e aplica uma animacao curta de destaque. |

## 8. Funcoes do Backend Usadas Pela Plataforma

| Arquivo | Funcao/Classe | Papel |
| --- | --- | --- |
| `core/settings.py` | `env_bool` | Converte variaveis de ambiente textuais em booleanos. |
| `core/settings.py` | `env_list` | Converte listas separadas por virgula em listas Python. |
| `core/views.py` | `index` | Renderiza a interface e informa se autenticacao e obrigatoria. |
| `core/views.py` | `health` | Retorna status simples para healthcheck. |
| `core/views.py` | `terminal_command` | Recebe comandos HTTP, valida token, faz parsing e executa RPC. |
| `core/views.py` | `mempool_summary` | Resume mempool, calcula fee media/distribuicao e evita varredura profunda quando a mempool e grande. |
| `core/views.py` | `blockchain_lag` | Retorna blocos, headers e lag de sincronizacao. |
| `core/views.py` | `events_summary` | Le Redis para retornar blocos/txs observados e tx/s. |
| `core/views.py` | `events_latest` | Le Redis para retornar blocos e transacoes recentes. |
| `core/views.py` | `events_state_comparison` | Compara o melhor bloco RPC com o ultimo bloco visto pelo listener ZMQ. |
| `core/auth.py` | `auth_is_required` | Indica se a autenticacao por token esta ativa. |
| `core/auth.py` | `validate_token` | Compara o token recebido com `APP_AUTH_TOKEN`. |
| `core/auth.py` | `auth_cookie_name` | Retorna o nome do cookie `HttpOnly` usado pelo painel. |
| `core/auth.py` | `token_from_request` | Extrai token de cookie, headers HTTP ou Bearer token. |
| `core/auth.py` | `token_from_scope` | Extrai token de cookie/header no WebSocket, com query string apenas para compatibilidade. |
| `core/auth.py` | `origin_from_scope` | Extrai o header `Origin` do handshake WebSocket. |
| `core/auth.py` | `origin_is_allowed` | Valida `Origin` quando `WEBSOCKET_ALLOWED_ORIGINS` esta configurado. |
| `core/rpc.py` | `csv_set` | Le listas de metodos permitidos/bloqueados a partir do ambiente. |
| `core/rpc.py` | `coerce_rpc_param` | Converte parametros textuais em booleano, `null`, numero ou JSON. |
| `core/rpc.py` | `parse_terminal_command` | Converte uma linha digitada em metodo e parametros RPC. |
| `core/rpc.py` | `ensure_network` | Garante que a rede solicitada existe e esta configurada. |
| `core/rpc.py` | `ensure_method_allowed` | Aplica allowlist/blocklist de comandos por rede. |
| `core/rpc.py` | `rpc_cache_key` / `get_cached_rpc` / `store_cached_rpc` | Cacheia chamadas read-only e erros temporarios por TTL configuravel. |
| `core/rpc.py` | `rpc_key_lock` | Coalesce chamadas RPC identicas em paralelo. |
| `core/rpc.py` | `rpc_call` | Executa chamada JSON-RPC autenticada contra Bitcoin Core. |
| `core/consumers.py` | `BTCEventConsumer` | Inscreve o cliente no grupo `btc_events` e encaminha eventos. |
| `core/zmq_listener.py` | `request_shutdown` | Marca encerramento gracioso quando recebe sinal do sistema. |
| `core/zmq_listener.py` | `mark_ready` | Cria arquivo de prontidao usado pelo healthcheck do listener. |
| `core/zmq_listener.py` | `rpc_call` | Consulta RPC auxiliar para enriquecer eventos de bloco. |
| `core/zmq_listener.py` | `create_subscriber` | Cria socket ZMQ inscrito em eventos do Bitcoin Core. |
| `core/zmq_listener.py` | `publish_event` | Publica dados no grupo `btc_events` do channel layer. |
| `core/zmq_listener.py` | `start_zmq` | Conecta nos sockets ZMQ, escuta eventos e publica no channel layer. |

## 9. API HTTP

A interface usa `POST /terminal/` para executar comandos RPC.

Exemplo:

```bash
curl -X POST http://localhost:8005/terminal/ \
  -H "Content-Type: application/json" \
  -H "X-CoreCraft-Token: <APP_AUTH_TOKEN>" \
  --data '{"network":"regtest","command":"getblockchaininfo"}'
```

Resposta esperada:

```json
{
  "result": {
    "chain": "regtest"
  }
}
```

O formato exato depende do metodo RPC chamado.

O dashboard usa endpoints GET autenticados por cookie ou header:

```bash
curl "http://localhost:8005/api/blockchain/lag/?network=regtest" \
  -H "X-CoreCraft-Token: <APP_AUTH_TOKEN>"

curl "http://localhost:8005/api/mempool/summary/?network=regtest" \
  -H "X-CoreCraft-Token: <APP_AUTH_TOKEN>"

curl "http://localhost:8005/api/events/summary/?network=regtest" \
  -H "X-CoreCraft-Token: <APP_AUTH_TOKEN>"

curl "http://localhost:8005/api/events/latest/?network=regtest" \
  -H "X-CoreCraft-Token: <APP_AUTH_TOKEN>"

curl "http://localhost:8005/api/events/state-comparison/?network=regtest" \
  -H "X-CoreCraft-Token: <APP_AUTH_TOKEN>"
```

Healthcheck:

```bash
curl http://localhost:8005/health/
```

## 10. Troubleshooting

### Token invalido

Sintoma: a interface pede o token repetidamente ou `/terminal/` retorna `401`.

Como resolver:

1. Confirme o valor de `APP_AUTH_TOKEN` no `.env`.
2. Recarregue a pagina.
3. Se necessario, limpe a sessao do painel pelo console do navegador:

   ```javascript
   fetch('/auth/logout/', { method: 'POST', credentials: 'same-origin' }).then(() => location.reload())
   ```

### Metodo bloqueado

Sintoma:

```text
Metodo bloqueado em mainnet: <metodo>
```

Isso indica que a politica de seguranca impediu o comando na rede selecionada. Use `REGTEST` para comandos de escrita ou ajuste a allowlist apenas se houver revisao de risco.

### Wallet regtest indisponivel

Sintoma:

```text
[ERRO] Wallet regtest indisponivel.
```

Resolva criando ou carregando uma carteira no terminal regtest:

```text
createwallet corecraft
loadwallet corecraft
```

### Eventos nao aparecem na timeline

Verifique os logs:

```bash
docker compose logs -f zmq-listener
docker compose logs -f redis
```

Depois gere um bloco em regtest:

```text
getnewaddress
generatetoaddress 1 <endereco>
```

### Dashboard nao atualiza

Possiveis causas:

- node ainda iniciando;
- credenciais RPC inconsistentes entre `.env` e `bitcoin.conf`;
- container Bitcoin sem healthcheck saudavel;
- comando bloqueado pela politica da rede;
- navegador sem token valido.
- aba do navegador oculta, pois o polling pausa quando `document.hidden`;
- rede em backoff temporario apos falha nas APIs agregadas;
- Redis indisponivel ou sem listas `zmq:<rede>:blocks`/`zmq:<rede>:txs` populadas.

Para diagnosticar, use:

```bash
docker compose ps
docker compose logs -f web-app
```

E compare com uma chamada direta:

```bash
curl -X POST http://localhost:8005/terminal/ \
  -H "Content-Type: application/json" \
  -H "X-CoreCraft-Token: <APP_AUTH_TOKEN>" \
  --data '{"network":"regtest","command":"getblockchaininfo"}'
```

### xterm.js nao carrega

A interface usa xterm.js via CDN. Se o navegador estiver sem acesso ao CDN, o terminal pode nao renderizar. Para uso offline, baixe e sirva os assets localmente.

## 11. Encerrar

Para parar os containers mantendo volumes:

```bash
docker compose down
```

Para iniciar novamente:

```bash
docker compose up --build
```

Para acompanhar logs durante o uso:

```bash
docker compose logs -f web-app zmq-listener
```
