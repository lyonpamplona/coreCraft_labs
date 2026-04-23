# Configuracao e Operacao

## Requisitos

- Docker instalado.
- Docker Compose pelo comando `docker compose`.
- Acesso a internet para baixar imagens e dependencias.
- Porta `8005` livre para a interface.
- Portas `18443`, `28332` e `28333` livres se voce quiser acessar RPC/ZMQ pelo host.

## Execucao

```bash
docker compose up --build
```

A interface fica disponivel em:

```text
http://localhost:8005
```

Encerramento:

```bash
docker compose down
```

## Servicos

| Servico | Container | Comando/Imagem | Memoria |
| --- | --- | --- | --- |
| `bitcoind` | `btc_regtest` | `ruimarinho/bitcoin-core:latest` | `512M` |
| `redis` | `btc_redis` | `redis:7-alpine` | padrao |
| `web-app` | `btc_ui` | `python manage.py runserver 0.0.0.0:8000` | `256M` |
| `zmq-listener` | `btc_zmq_listener` | `python -m core.zmq_listener` | `128M` |

## Portas

| Porta host | Porta container | Uso |
| --- | --- | --- |
| `8005` | `8000` | HTTP/WebSocket da aplicacao |
| `18443` | `18443` | RPC do Bitcoin Core em regtest |
| `28332` | `28332` | ZMQ `rawtx` |
| `28333` | `28333` | ZMQ `rawblock` |

## Bitcoin Core

Arquivo: `bitcoin.conf`

```text
regtest=1
server=1
txindex=1
printtoconsole=1

[regtest]
rpcallowip=0.0.0.0/0
rpcbind=0.0.0.0
rpcuser=lyon
rpcpassword=senha_segura
zmqpubrawtx=tcp://0.0.0.0:28332
zmqpubrawblock=tcp://0.0.0.0:28333
```

## Django e Channels

Arquivo: `core/settings.py`

- `ROOT_URLCONF = 'core.urls'`.
- `WSGI_APPLICATION = 'core.wsgi.application'`.
- `ASGI_APPLICATION = 'core.asgi.application'`.
- `CHANNEL_LAYERS` aponta para Redis em `redis:6379`.
- `DATABASES = {}` porque nao ha persistencia relacional.

## Dependencias Python

Instaladas no `Dockerfile`:

```text
django
requests
pyzmq
channels
channels-redis
daphne
```

## Executando Partes Manualmente

O modo principal e Docker Compose. Para diagnosticar partes isoladas:

```bash
docker compose logs -f web-app
docker compose logs -f zmq-listener
docker compose logs -f bitcoind
docker compose logs -f redis
```

Executar o listener dentro do container web:

```bash
docker compose exec web-app python -m core.zmq_listener
```

## Rodando Fora do Docker

Para rodar no host, ajuste dependencias e endpoints:

1. Instale Python 3.11+.
2. Instale os pacotes:

   ```bash
   pip install django requests pyzmq channels channels-redis daphne
   ```

3. Tenha Redis acessivel.
4. Tenha Bitcoin Core regtest com RPC e ZMQ habilitados.
5. Ajuste `RPC_URL` e endpoints ZMQ caso nao use hostnames Docker.
6. Rode a aplicacao:

   ```bash
   python manage.py runserver 0.0.0.0:8000
   ```

7. Rode o listener:

   ```bash
   DJANGO_SETTINGS_MODULE=core.settings python -m core.zmq_listener
   ```

## `.gitignore`

O projeto ignora:

- caches Python;
- ambientes virtuais;
- banco SQLite local;
- logs;
- `.env` e variantes;
- dados locais de Bitcoin/Redis;
- arquivos de IDE;
- artefatos locais do Codex.

## Troubleshooting

### A interface abre, mas comandos RPC falham

Verifique se `bitcoind` esta ativo e se `RPC_USER`/`RPC_PASS` em `core/views.py` batem com `bitcoin.conf`.

### WebSocket conecta, mas nao chegam eventos

Confirme que `zmq-listener` esta rodando e que o Bitcoin Core publicou algum `rawtx` ou `rawblock`. Minerar um bloco pela macro deve gerar `rawblock`.

### Dashboard de mempool fica zerado

Em `regtest`, a mempool pode estar vazia. Gere uma transacao ou consulte `getmempoolinfo` manualmente no terminal.

### `getnewaddress` falha

O Bitcoin Core pode estar sem wallet carregada/criada. Use comandos RPC de wallet conforme a versao da imagem Bitcoin Core.

### xterm.js nao carrega

A interface usa CDN. Sem acesso a internet no navegador, empacote xterm.js localmente ou substitua os links CDN.
