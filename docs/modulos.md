# Modulos e Responsabilidades

| Arquivo | Responsabilidade |
| --- | --- |
| `Dockerfile` | Imagem Python com Django, Channels, ZMQ, requests e dotenv. |
| `requirements.txt` | Dependencias Python pinadas para builds reprodutiveis. |
| `docker-compose.yaml` | Sobe os tres nodes Bitcoin, Redis, web-app e zmq-listener. |
| `bitcoin.conf.example` | Template seguro de RPC/ZMQ para mainnet, signet e regtest. |
| `bitcoin.conf` | Arquivo local ignorado pelo Git, montado nos containers Bitcoin. |
| `.env` | Define endpoints, usuarios e senhas RPC usados pela aplicacao. |
| `manage.py` | CLI administrativa Django. |
| `core/settings.py` | Configuracoes Django/ASGI/Channels lidas do ambiente. |
| `core/urls.py` | Rotas HTTP `/` e `/terminal/`. |
| `core/auth.py` | Validacao de token/cookie HTTP/WebSocket e Origin. |
| `core/rpc.py` | Parser, politica por rede e cliente JSON-RPC. |
| `core/views.py` | Renderizacao da interface, healthcheck e endpoint RPC HTTP. |
| `core/asgi.py` | Roteamento HTTP/WebSocket. |
| `core/consumers.py` | Consumer WebSocket do grupo `btc_events`. |
| `core/zmq_listener.py` | Listener ZMQ multi-rede e publicador de eventos. |
| `templates/index.html` | Interface multi-terminal, dashboard, macros e WebSocket. |
| `docs/` | Documentacao, auditoria e roadmap. |

## `core/views.py`

Funcoes:

- `index(request)`: renderiza a interface.
- `health(request)`: responde healthcheck HTTP.
- `auth_verify(request)`: valida token e grava cookie `HttpOnly`.
- `auth_logout(request)`: remove o cookie de autenticacao.
- `terminal_command(request)`: valida requisicao e encaminha comando RPC.

## `core/rpc.py`

Responsavel por:

- interpretar comandos com `shlex.split`;
- converter parametros JSON basicos;
- aplicar allowlist em mainnet/signet;
- aplicar blocklist em regtest;
- normalizar erros de comunicacao RPC.

## `core/auth.py`

Responsavel por:

- validar `APP_AUTH_TOKEN`;
- definir o nome do cookie de autenticacao;
- ler token de cookie `HttpOnly`, header `X-CoreCraft-Token` ou `Authorization`;
- ler token de cookie/header no WebSocket, com query string apenas para compatibilidade;
- validar Origin quando configurado.

## `core/zmq_listener.py`

Responsavel por:

- conectar nos endpoints ZMQ dos tres nodes;
- assinar `rawtx`, `rawblock` e `hashblock`;
- enriquecer blocos via RPC quando possivel;
- publicar eventos no grupo `btc_events`;
- registrar logs e encerrar sockets de forma graciosa.

## `templates/index.html`

Contem:

- seletor de rede;
- tres terminais xterm.js;
- historico por rede;
- autocomplete simples;
- macros;
- dashboard;
- timeline de blocos;
- cliente WebSocket;
- tema/fonte/cores salvos no navegador.

## Pontos de Atencao

- `bitcoin.conf` real deve permanecer ignorado pelo Git.
- `templates/index.html` cresceu e deve ser separado em arquivos estaticos.
- O modelo de autenticacao ainda e token compartilhado, nao usuarios individuais.
