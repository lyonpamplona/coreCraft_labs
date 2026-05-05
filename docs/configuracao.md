# Configuracao e Operacao

## Requisitos

- Docker e Docker Compose.
- Porta `8005` livre no host.
- Espaco em disco para volumes dos nodes Bitcoin.
- `.env` com endpoints/credenciais RPC.
- `bitcoin.conf` local criado a partir de `bitcoin.conf.example`.

## Servicos

| Servico | Container | Uso |
| --- | --- | --- |
| `btc-mainnet` | `btc_mainnet` | Node mainnet pruned. |
| `btc-signet` | `btc_signet` | Node signet. |
| `btc-regtest` | `btc_regtest` | Node regtest. |
| `redis` | `btc_redis` | Channel layer e memoria curta de eventos ZMQ. |
| `web-app` | `btc_ui` | Interface HTTP/WebSocket, `/terminal/` e APIs agregadas `/api/*`. |
| `zmq-listener` | `btc_zmq_listener` | Ponte ZMQ para WebSocket e gravacao de resumos em Redis. |

## Executar

```bash
docker compose up --build
```

Em segundo plano:

```bash
docker compose up --build -d
```

Acessar:

```text
http://localhost:8005
```

Encerrar:

```bash
docker compose down
```

## Variaveis de Ambiente

Copie `.env.example` para `.env` e ajuste os valores locais. O `.env` real e ignorado pelo Git.

```text
DEBUG=True
SECRET_KEY=<chave-local>
ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0
REQUIRE_AUTH=True
APP_AUTH_TOKEN=<token-local>
APP_AUTH_COOKIE_NAME=corecraft_auth
WEBSOCKET_ALLOWED_ORIGINS=http://localhost:8005,http://127.0.0.1:8005

MAINNET_RPC_URL=http://btc-mainnet:8332
MAINNET_RPC_USER=<usuario>
MAINNET_RPC_PASS=<senha>

SIGNET_RPC_URL=http://btc-signet:38332
SIGNET_RPC_USER=<usuario>
SIGNET_RPC_PASS=<senha>

REGTEST_RPC_URL=http://btc-regtest:18443
REGTEST_RPC_USER=<usuario>
REGTEST_RPC_PASS=<senha>
RPC_TIMEOUT_SECONDS=5
RPC_CACHE_SECONDS=15
RPC_ERROR_CACHE_SECONDS=30

REDIS_URL=redis://redis:6379/0
MAINNET_RPC_ALLOWLIST=<metodos-read-only-separados-por-virgula>
SIGNET_RPC_ALLOWLIST=<metodos-read-only-separados-por-virgula>
REGTEST_RPC_BLOCKLIST=stop

ZMQ_MAINNET_TOPICS=rawblock,hashblock
ZMQ_SIGNET_TOPICS=rawblock,hashblock
ZMQ_REGTEST_TOPICS=rawtx,rawblock,hashblock
CHANNELS_REDIS_LOG_LEVEL=WARNING
```

`RPC_TIMEOUT_SECONDS` controla quanto tempo o backend espera por cada chamada
JSON-RPC ao Bitcoin Core. Em mainnet durante sincronizacao/pruning, valores
menores evitam que o painel acumule requisicoes longas.

`RPC_CACHE_SECONDS` cacheia consultas read-only repetidas por alguns segundos.
`RPC_ERROR_CACHE_SECONDS` cacheia erros temporarios, como timeout, por mais
tempo para impedir loops de polling contra nodes ainda ocupados.

Quando `REQUIRE_AUTH=True`, a interface solicita `APP_AUTH_TOKEN` no navegador. A verificacao inicial usa o header `X-CoreCraft-Token`; depois o backend grava um cookie `HttpOnly` chamado `APP_AUTH_COOKIE_NAME` para liberar `/terminal/` e `/ws/btc/` sem expor o token em `localStorage` ou na URL do WebSocket.

Clientes externos ainda podem chamar a API HTTP usando `X-CoreCraft-Token` ou `Authorization: Bearer <token>`.

O WebSocket aceita origens listadas em `WEBSOCKET_ALLOWED_ORIGINS` e tambem a propria origem do host acessado no navegador. Isso permite usar `localhost`, `127.0.0.1` ou outro host local configurado em `ALLOWED_HOSTS` sem quebrar o painel por divergencia de Origin.

Por padrao, o listener ZMQ nao assina `rawtx` em `mainnet` e `signet`, porque essas redes podem gerar volume alto de eventos e saturar o grupo WebSocket `btc_events`. Para monitorar transacoes nessas redes, adicione `rawtx` em `ZMQ_MAINNET_TOPICS` ou `ZMQ_SIGNET_TOPICS` sabendo que isso aumenta bastante o volume de mensagens.

O listener tambem grava janelas curtas em Redis para o dashboard:

- `zmq:<rede>:blocks`: ultimos blocos observados, limitado a 50 itens;
- `zmq:<rede>:txs`: ultimas transacoes observadas, limitado a 1000 itens;
- `zmq:<rede>:last_time`: timestamp do ultimo evento observado.

Essas chaves alimentam `/api/events/summary/`, `/api/events/latest/` e
`/api/events/state-comparison/`.

## Bitcoin Core

O projeto versiona apenas `bitcoin.conf.example`. O `bitcoin.conf` real e ignorado pelo Git e deve ser criado localmente:

```bash
cp bitcoin.conf.example bitcoin.conf
```

Use `rpcauth` no `bitcoin.conf`, nao `rpcpassword`. O usuario e a senha em texto puro ficam apenas no `.env`, para que Django e o listener ZMQ consigam autenticar no RPC.

Para gerar novos valores, use o script `rpcauth.py` do Bitcoin Core ou um gerador local equivalente. Depois:

1. coloque o valor `rpcauth=<usuario>:<salt>$<hash>` no bloco da rede em `bitcoin.conf`;
2. coloque o mesmo usuario em `<REDE>_RPC_USER` no `.env`;
3. coloque a senha original em `<REDE>_RPC_PASS` no `.env`.

Perfil pruned recomendado neste projeto:

- mainnet: `prune=550`, `disablewallet=1`, mempool limitada e apenas eventos ZMQ de bloco;
- signet: `prune=550`, `disablewallet=1`, mempool menor e apenas eventos ZMQ de bloco;
- regtest: sem prune, com `txindex=1`, wallet habilitada e `rawtx` ativo para testes locais.

## Logs

```bash
docker compose logs -f web-app
docker compose logs -f zmq-listener
docker compose logs -f btc-mainnet
docker compose logs -f btc-signet
docker compose logs -f btc-regtest
docker compose logs -f redis
```

## Validacao

```bash
docker compose config
PYTHONPYCACHEPREFIX=/tmp/bitcoin-regtest-pycache python3 -m py_compile manage.py core/settings.py core/urls.py core/views.py core/wsgi.py core/asgi.py core/consumers.py core/zmq_listener.py core/auth.py core/rpc.py
```

## Troubleshooting

### Interface abre, mas RPC falha

Verifique `.env`, `bitcoin.conf` e logs do node da rede selecionada.

### Eventos nao aparecem

Confira:

```bash
docker compose logs -f zmq-listener
docker compose logs -f redis
```

Confira tambem se o listener esta gravando chaves Redis:

```bash
docker compose exec redis redis-cli keys 'zmq:*'
docker compose exec redis redis-cli llen zmq:regtest:blocks
docker compose exec redis redis-cli llen zmq:regtest:txs
```

Depois gere um bloco em regtest para forcar evento:

```text
getnewaddress
generatetoaddress 1 <endereco>
```

### Logs repetidos de channels_redis over capacity

Esse log indica que o listener esta publicando mais eventos do que os WebSockets conseguem consumir. Mantenha `rawtx` desabilitado em `mainnet` e `signet`, feche abas antigas do painel e reinicie Redis/web/listener para limpar canais antigos:

```bash
docker compose restart redis web-app zmq-listener
```

### Node aparece unhealthy com incorrect password attempt

Isso geralmente indica divergencia entre o `rpcauth` do `bitcoin.conf` e usuario/senha no `.env`. Os healthchecks dos nodes usam as variaveis `<REDE>_RPC_USER` e `<REDE>_RPC_PASS`; confirme se elas correspondem exatamente ao `rpcauth` da rede.

### Mainnet demora para ficar util

Mesmo com `prune`, a sincronizacao inicial pode ser longa e consumir disco/rede. Use signet/regtest para testes rapidos.
