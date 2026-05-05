# Mapa do Codigo

## Contratos

### `GET /`

Renderiza `templates/index.html`.

### `POST /terminal/`

Entrada:

```json
{
  "network": "regtest",
  "command": "getblockchaininfo"
}
```

Header quando `REQUIRE_AUTH=True`:

```text
X-CoreCraft-Token: <APP_AUTH_TOKEN>
```

O navegador autenticado usa cookie `HttpOnly`; o header acima e mantido para `curl`, scripts e diagnostico.

Saida: resposta JSON-RPC do Bitcoin Core ou erro HTTP de validacao/politica.

### `GET /api/blockchain/lag/?network=<rede>`

Resumo de sincronizacao:

```json
{
  "blocks": 100,
  "headers": 100,
  "lag": 0
}
```

### `GET /api/mempool/summary/?network=<rede>`

Resumo de mempool para o card Mempool Intelligence:

```json
{
  "tx_count": 3,
  "total_vsize": 420,
  "avg_fee_rate": 1.25,
  "min_fee_rate": 1.0,
  "max_fee_rate": 2.0,
  "fee_distribution": {"low": 3, "medium": 0, "high": 0}
}
```

Quando a mempool passa de 1500 transacoes, o endpoint evita a varredura
profunda de `getrawmempool true` e retorna `warning: "Extensa"`.

### `GET /api/events/summary/?network=<rede>`

Resume as listas Redis mantidas pelo listener ZMQ:

```json
{
  "blocks_observed": 5,
  "tx_observed": 12,
  "last_event_time": 1710000000,
  "tx_per_second": 0.42
}
```

### `GET /api/events/latest/?network=<rede>`

Retorna os blocos e txs mais recentes persistidos em Redis.

### `GET /api/events/state-comparison/?network=<rede>`

Compara `getbestblockhash` com o ultimo bloco observado via ZMQ/Redis e indica
divergencia entre estado RPC e feed de eventos.

### `POST /auth/logout/`

Remove o cookie de autenticacao do painel e permite reiniciar o login no navegador.

### `WebSocket /ws/btc/`

Entrega eventos publicados pelo listener:

```json
{
  "network": "regtest",
  "topic": "rawblock",
  "size": 1024,
  "sequence": 10
}
```

## Backend HTTP

`core/views.py`:

- renderiza a interface com sinalizacao de autenticacao;
- expoe `/health/`;
- valida login em `/auth/verify/` e remove sessao em `/auth/logout/`;
- valida token de acesso em `/terminal/`;
- trata JSON invalido;
- delega parsing, politica e chamada RPC para `core.rpc`;
- expoe APIs agregadas para dashboard de sync/lag, mempool e eventos;
- consulta Redis para blocos/txs recentes observados pelo listener ZMQ;
- retorna JSON ao frontend.

`core/auth.py`:

- valida token compartilhado;
- define o cookie de autenticacao do painel;
- extrai token de cookie/header HTTP;
- extrai token de cookie/header WebSocket, mantendo query string como compatibilidade;
- valida Origin do WebSocket quando configurado.

`core/rpc.py`:

- usa `shlex.split` para argumentos com aspas;
- converte booleanos, `null`, numeros e JSON inline;
- aplica allowlist em mainnet/signet;
- aplica blocklist em regtest;
- executa JSON-RPC com timeout configuravel e erros normalizados;
- cacheia consultas read-only repetidas por `RPC_CACHE_SECONDS`;
- cacheia erros temporarios por `RPC_ERROR_CACHE_SECONDS`;
- usa lock por chave RPC para coalescer chamadas iguais em paralelo.

## Backend WebSocket

`core/asgi.py` direciona `/ws/btc/` para `BTCEventConsumer`.

`core/consumers.py`:

- valida token e Origin no handshake;
- entra no grupo `btc_events`;
- recebe evento `btc_message`;
- serializa `event["data"]` para JSON.

## Listener ZMQ

`core/zmq_listener.py`:

- conecta em `btc-mainnet`, `btc-signet` e `btc-regtest`;
- assina `rawtx`, `rawblock`, `hashblock`;
- chama RPC para enriquecer `hashblock`;
- grava janelas curtas em Redis: `zmq:<rede>:blocks`, `zmq:<rede>:txs` e `zmq:<rede>:last_time`;
- publica `rawtx`, `rawblock` e `block_rich`;
- registra logs;
- trata sinais de encerramento;
- cria arquivo de readiness para healthcheck.

## Frontend

`templates/index.html` + `templates/components/` + `static/css/panel/` +
`static/js/panel/`:

- mantem `templates/index.html` como shell principal da pagina;
- separa header, sidebars, metricas, viewer JSON/docs, terminal, login e icones
  em `templates/components/`;
- organiza tema, grid responsivo, terminal, timeline e estados visuais em arquivos segmentados dentro de `static/css/panel/`;
- organiza estado da interface, WebSocket, comandos RPC e xterm em arquivos segmentados dentro de `static/js/panel/`;
- carrega `main.js` como ponto de entrada ES module;
- concentra constantes e estado em `state.js`;
- concentra navegacao, preferencias e renderizacao segura em `ui.js`;
- concentra xterm, historico, autocomplete e `help` em `terminal.js`;
- concentra WebSocket, RPC, chamadas `/api/*`, dashboard, wallet regtest, `verifyToken` e macros **Forjar 1**/**Forjar 100** em `api.js`;
- cria uma instancia de terminal por rede;
- mantem entrada e historico por rede;
- alterna a view central entre terminal e documentacao;
- alterna paineis laterais de Explorer, Docs, Busca, Fluxos, Execucao e Ajustes;
- permite escolher tema, fonte, cores e exibicao do rodape via `localStorage`;
- permite redimensionar paines laterais em telas desktop;
- renderiza `rpc.response` com o ultimo retorno RPC executado;
- envia respostas RPC estruturadas para `rpc.response` e deixa o terminal com mensagens curtas de sucesso;
- agrupa botoes rapidos em rede, mempool, wallet/mineracao e utilitarios;
- oferece `estimatesmartfee 6` no botao **Taxas (6 blk)**;
- usa o `help` real do Bitcoin Core e filtra secoes completas para `help <categoria>`;
- usa ajuda local apenas como contingencia quando o RPC nao retorna a secao pedida;
- recalcula o tamanho do xterm com `xterm-addon-fit` depois de resize, troca de rede, troca de fonte e mudanca de aba;
- envia comandos para `/terminal/`;
- usa cookie `HttpOnly` apos o login;
- abre WebSocket com `ws://` ou `wss://` sem token na URL;
- sanitiza dados exibidos no viewer JSON e nos cards da timeline;
- restringe macros de wallet/mineracao ao `regtest`;
- atualiza dashboard com polling de 15 segundos, endpoints agregados, trava de concorrencia e backoff por rede;
- renderiza cards de Node Sync & Divergence, Mempool Intelligence e Event Activity;
- renderiza timeline visual de blocos com status, hash/resumo, tx, peso e taxas;
- limita a timeline a 18 eventos recentes para preservar densidade visual.

## Melhorias Planejadas

Detalhes completos:

- [Relatorio de auditoria](auditoria.md)
- [Roadmap de melhorias](roadmap.md)
