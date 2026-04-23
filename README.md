# Bitcoin Regtest Terminal

Interface web para operar e monitorar um node Bitcoin Core em modo `regtest`. O projeto combina Django, Django Channels, Redis, WebSocket, ZMQ e xterm.js para oferecer um terminal RPC no navegador, acoes rapidas, painel de mempool e feed de blocos/transacoes em tempo real.

## Visao Geral

O sistema sobe um ambiente local com quatro servicos:

- `bitcoind`: Bitcoin Core em `regtest`, com RPC e ZMQ habilitados.
- `redis`: broker usado pelo Django Channels.
- `web-app`: aplicacao Django/ASGI que serve HTTP, WebSocket e a interface web.
- `zmq-listener`: processo Python que assina eventos ZMQ do Bitcoin Core e publica no channel layer.

Fluxos principais:

1. O usuario acessa `http://localhost:8005`.
2. O Django entrega `templates/index.html`.
3. O terminal web envia comandos para `POST /terminal/`.
4. A view Django converte a linha em chamada JSON-RPC para o `bitcoind`.
5. O dashboard consulta `getmempoolinfo` periodicamente.
6. O listener ZMQ recebe `rawtx` e `rawblock`.
7. O listener publica eventos no grupo `btc_events` via Redis/Channels.
8. O WebSocket `/ws/btc/` entrega os eventos ao navegador.

## Estrutura do Projeto

```text
.
├── .gitignore                # Regras para ignorar caches, ambientes e segredos locais
├── bitcoin.conf              # Configuracao regtest, RPC e ZMQ do Bitcoin Core
├── docker-compose.yaml       # Orquestracao de bitcoind, Redis, Django e listener ZMQ
├── Dockerfile                # Imagem Python da aplicacao
├── manage.py                 # CLI administrativa do Django
├── core/
│   ├── asgi.py               # Entrada ASGI: HTTP + WebSocket
│   ├── consumers.py          # Consumer WebSocket para eventos BTC
│   ├── settings.py           # Configuracoes Django, Channels e Redis
│   ├── urls.py               # Rotas HTTP
│   ├── views.py              # Interface HTTP e cliente JSON-RPC
│   ├── wsgi.py               # Entrada WSGI tradicional
│   └── zmq_listener.py       # Assinante ZMQ e publicador no channel layer
├── templates/
│   └── index.html            # Command center com xterm.js, macros e dashboard
└── docs/                     # Documentacao tecnica detalhada
```

## Dependencias

- Docker e Docker Compose.
- Python 3.11 no container.
- Pacotes Python instalados no `Dockerfile`: `django`, `requests`, `pyzmq`, `channels`, `channels-redis` e `daphne`.
- Imagens Docker: `ruimarinho/bitcoin-core:latest` e `redis:7-alpine`.
- xterm.js `5.1.0`, carregado por CDN no navegador.

## Como Executar

Suba todo o ambiente:

```bash
docker compose up --build
```

Acesse:

```text
http://localhost:8005
```

Servicos e portas:

| Servico | Container | Porta host | Uso |
| --- | --- | --- | --- |
| `bitcoind` | `btc_regtest` | `18443` | RPC Bitcoin Core |
| `bitcoind` | `btc_regtest` | `28332` | ZMQ `rawtx` |
| `bitcoind` | `btc_regtest` | `28333` | ZMQ `rawblock` |
| `web-app` | `btc_ui` | `8005` | Interface HTTP/WebSocket |
| `redis` | `btc_redis` | interna | Channel layer |
| `zmq-listener` | `btc_zmq_listener` | interna | Ponte ZMQ -> Redis/Channels |

Para encerrar:

```bash
docker compose down
```

## Comandos RPC Uteis

Digite no terminal web:

```text
getblockchaininfo
getblockcount
getmempoolinfo
getnewaddress
generatetoaddress 1 <endereco>
getbalance
```

A acao rapida "Forjar 1 Bloco" gera um endereco automaticamente com `getnewaddress` e depois executa `generatetoaddress 1 <endereco>`.

## Documentacao

- [Indice tecnico](docs/README.md)
- [Arquitetura](docs/arquitetura.md)
- [Fluxos do sistema](docs/fluxos.md)
- [Modulos e responsabilidades](docs/modulos.md)
- [Configuracao e operacao](docs/configuracao.md)
- [Guia de comandos](docs/comandos.md)
- [Mapa do codigo](docs/codigo.md)

## Notas de Seguranca

Este projeto esta configurado para laboratorio local:

- `DEBUG=True`.
- `ALLOWED_HOSTS=['*']`.
- Endpoint `/terminal/` sem CSRF.
- Credenciais RPC fixas em `core/views.py` e `bitcoin.conf`.
- RPC e ZMQ expostos em `0.0.0.0` dentro do ambiente Docker.

Nao exponha esta aplicacao em rede publica. Para endurecer o ambiente, mova segredos para variaveis de ambiente, restrinja hosts e redes, adicione autenticacao, defina timeouts e trate falhas de rede de forma explicita.
