# Modulos e Responsabilidades

## Visao por Arquivo

| Arquivo | Responsabilidade |
| --- | --- |
| `.gitignore` | Ignora caches, ambientes virtuais, logs, dados locais e segredos de ambiente. |
| `Dockerfile` | Define imagem Python 3.11 com Django, Channels, Redis client, ZMQ e Daphne. |
| `docker-compose.yaml` | Orquestra `bitcoind`, Redis, aplicacao web e listener ZMQ. |
| `bitcoin.conf` | Configura Bitcoin Core em regtest com RPC e ZMQ. |
| `manage.py` | Entrada CLI para comandos administrativos Django. |
| `core/settings.py` | Configuracoes Django, ASGI, Channels e Redis. |
| `core/urls.py` | Rotas HTTP: `/` e `/terminal/`. |
| `core/views.py` | Renderiza a pagina e encaminha comandos JSON-RPC. |
| `core/asgi.py` | Roteia HTTP e WebSocket. |
| `core/consumers.py` | Consumer WebSocket do grupo `btc_events`. |
| `core/zmq_listener.py` | Processo assinante de ZMQ e publicador no channel layer. |
| `core/wsgi.py` | Entrada WSGI tradicional. |
| `templates/index.html` | Interface visual, terminal, dashboard, macros e cliente WebSocket. |
| `docs/` | Documentacao tecnica do projeto. |

## `core/views.py`

Constantes:

- `RPC_URL`: endpoint interno `http://bitcoind:18443`.
- `RPC_USER`: usuario RPC.
- `RPC_PASS`: senha RPC.

Funcoes:

- `coerce_rpc_param(value)`: converte tokens textuais para `int`, `bool` ou `str`.
- `parse_terminal_command(command)`: separa a linha em metodo RPC e parametros.
- `rpc_call(method, params=None)`: executa POST JSON-RPC autenticado.
- `index(request)`: renderiza `templates/index.html`.
- `terminal_command(request)`: recebe comandos do terminal e devolve resposta JSON-RPC.

## `core/asgi.py`

Define `application` com `ProtocolTypeRouter`:

- `http`: delega ao Django via `get_asgi_application()`.
- `websocket`: direciona `ws/btc/` para `BTCEventConsumer`.

## `core/consumers.py`

Classe `BTCEventConsumer`:

- `connect()`: adiciona o canal ao grupo `btc_events` e aceita a conexao.
- `disconnect(close_code)`: remove o canal do grupo.
- `btc_message(event)`: envia `event["data"]` ao navegador em JSON.

## `core/zmq_listener.py`

Funcao `start_zmq()`:

- cria contexto ZMQ;
- conecta em `tcp://bitcoind:28332` e `tcp://bitcoind:28333`;
- assina `rawtx` e `rawblock`;
- recebe mensagens multipart;
- monta payload com `topic`, `size` e `sequence`;
- publica no grupo `btc_events` via `async_to_sync(layer.group_send)`.

## `core/settings.py`

Configuracoes importantes:

- `INSTALLED_APPS` inclui `daphne`, `core` e `django.contrib.staticfiles`.
- `ASGI_APPLICATION = 'core.asgi.application'`.
- `CHANNEL_LAYERS` usa `channels_redis.core.RedisChannelLayer`.
- Redis configurado em `redis:6379`.
- `DATABASES = {}`, porque o projeto nao persiste dados em banco.

## `templates/index.html`

Responsabilidades:

- renderizar layout do command center;
- inicializar xterm.js;
- abrir WebSocket para `/ws/btc/`;
- imprimir eventos `rawtx` e `rawblock`;
- manter feed lateral de blocos;
- enviar comandos ao endpoint `/terminal/`;
- atualizar dashboard de mempool com `getmempoolinfo`;
- executar macros como saldo, novo endereco, info de rede e mineracao de bloco.
