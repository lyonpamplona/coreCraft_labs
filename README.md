# coreCraft Multi-Node

Interface web para operar e monitorar nodes Bitcoin Core em `mainnet`, `signet` e `regtest`. O projeto combina Django, Django Channels, Redis, WebSocket, ZMQ e xterm.js para oferecer terminais RPC por rede, acoes rapidas, dashboard de sincronizacao/mempool/eventos e feed de blocos/transacoes em tempo real.

## Visao Geral

O sistema sobe um ambiente local com seis servicos principais:

- `btc-mainnet`: Bitcoin Core em mainnet, com RPC e ZMQ habilitados.
- `btc-signet`: Bitcoin Core em signet, com RPC e ZMQ habilitados.
- `btc-regtest`: Bitcoin Core em regtest, com RPC e ZMQ habilitados.
- `redis`: broker usado pelo Django Channels.
- `web-app`: aplicacao Django/ASGI que serve HTTP, WebSocket e a interface web.
- `zmq-listener`: processo Python que assina eventos ZMQ do Bitcoin Core e publica no channel layer.

Fluxos principais:

1. O usuario acessa `http://localhost:8005`.
2. O Django entrega `templates/index.html`, componentes em `templates/components/` e assets modularizados em `static/css/` e `static/js/panel/`.
3. O terminal web envia comandos para `POST /terminal/`.
4. A view Django converte a linha em chamada JSON-RPC para a rede selecionada.
5. O dashboard consulta endpoints agregados em `/api/*` para sync/lag, mempool e atividade ZMQ.
6. O listener ZMQ recebe `rawtx`, `rawblock` e `hashblock`.
7. O listener publica eventos no grupo `btc_events` via Redis/Channels e grava resumos recentes em Redis.
8. O WebSocket `/ws/btc/` entrega os eventos ao navegador.

## Estrutura do Projeto

```text
.
├── .gitignore                # Regras para ignorar caches, ambientes e segredos locais
├── bitcoin.conf.example      # Template seguro de configuracao Bitcoin Core
├── docker-compose.yaml       # Orquestracao de nodes Bitcoin, Redis, Django e ZMQ
├── Dockerfile                # Imagem Python da aplicacao
├── requirements.txt          # Dependencias Python pinadas
├── manage.py                 # CLI administrativa do Django
├── core/
│   ├── asgi.py               # Entrada ASGI: HTTP + WebSocket
│   ├── auth.py               # Autenticacao por token HTTP/WebSocket
│   ├── consumers.py          # Consumer WebSocket para eventos BTC
│   ├── rpc.py                # Parser, politicas por rede e cliente JSON-RPC
│   ├── settings.py           # Configuracoes Django, Channels e Redis
│   ├── urls.py               # Rotas HTTP
│   ├── views.py              # Interface HTTP e cliente JSON-RPC
│   ├── wsgi.py               # Entrada WSGI tradicional
│   └── zmq_listener.py       # Assinante ZMQ e publicador no channel layer
├── templates/
│   ├── index.html            # Shell do command center multi-node
│   └── components/           # Header, sidebars, metricas, viewer, terminal e login
├── static/
│   ├── css/
│   │   ├── panel.css         # Agregador de CSS do painel
│   │   └── panel/            # Base, shell, sidebars, terminal, docs, timeline e responsivo
│   └── js/
│       └── panel/            # Estado, UI, API, terminal e bootstrap do painel
└── docs/                     # Documentacao tecnica detalhada
```

## Dependencias

- Docker e Docker Compose.
- Python 3.11 no container.
- Pacotes Python instalados no `Dockerfile`: `django`, `requests`, `pyzmq`, `channels`, `channels-redis`, `daphne`, `redis`, `python-bitcoinlib` e `python-dotenv`.
- Imagens Docker: `ruimarinho/bitcoin-core:latest` e `redis:7-alpine`.
- xterm.js `5.1.0` e `xterm-addon-fit` `0.7.0`, carregados por CDN no navegador.

## Como Executar

Suba todo o ambiente:

```bash
docker compose up --build
```

Na primeira execucao, copie os modelos locais e ajuste segredos:

```bash
cp .env.example .env
cp bitcoin.conf.example bitcoin.conf
```

O arquivo `bitcoin.conf` real e ignorado pelo Git. Gere valores `rpcauth` locais e mantenha as senhas correspondentes apenas no `.env`.

Acesse:

```text
http://localhost:8005
```

Na primeira abertura, informe o valor de `APP_AUTH_TOKEN` configurado no `.env`. Depois da validacao, o backend grava um cookie `HttpOnly` para proteger `/terminal/` e `/ws/btc/` sem expor o token na URL do WebSocket.

Servicos e portas:

| Servico | Container | Porta host | Uso |
| --- | --- | --- | --- |
| `btc-mainnet` | `btc_mainnet` | interna | Node mainnet |
| `btc-signet` | `btc_signet` | interna | Node signet |
| `btc-regtest` | `btc_regtest` | interna | Node regtest |
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
estimatesmartfee 6
help
help blockchain
help wallet
getnewaddress
generatetoaddress 100 <endereco>
generatetoaddress 1 <endereco>
getbalance
```

As acoes rapidas de regtest geram endereco automaticamente com `getnewaddress`: **Forjar 1** executa `generatetoaddress 1 <endereco>` e **Forjar 100** executa `generatetoaddress 100 <endereco>` para acelerar a maturacao de recompensas anteriores.

## Documentacao

- [Indice tecnico](docs/README.md)
- [Guia de apresentacao do projeto](docs/apresentacao.md)
- [Tutorial da plataforma](docs/tutorial-plataforma.md)
- [Redesign da interface IDE](docs/redesign-interface-ide.md)
- [Refatoracao do painel IDE](docs/refatoracao-painel.md)
- [Relatorio tecnico do estado atual](docs/relatorio-tecnico-estado-atual.md)
- [Arquitetura](docs/arquitetura.md)
- [Fluxos do sistema](docs/fluxos.md)
- [Modulos e responsabilidades](docs/modulos.md)
- [Configuracao e operacao](docs/configuracao.md)
- [Guia de comandos](docs/comandos.md)
- [Mapa do codigo](docs/codigo.md)

## Notas de Seguranca

Este projeto esta configurado para laboratorio local:

- `DEBUG=True`.
- `/terminal/` e `/ws/btc/` exigem autenticacao quando `REQUIRE_AUTH=True`; o navegador usa cookie `HttpOnly` e clientes externos podem usar `X-CoreCraft-Token`.
- Mainnet e signet usam allowlist de metodos RPC por padrao.
- `bitcoin.conf` real e ignorado; versionamos apenas `bitcoin.conf.example`.
- Use `rpcauth` no `bitcoin.conf` e mantenha senhas reais somente no `.env`.
- RPC e ZMQ expostos em `0.0.0.0` dentro do ambiente Docker.

Nao exponha esta aplicacao em rede publica. Antes de qualquer uso fora de laboratorio, implemente autenticacao forte por usuario, revise comandos permitidos em mainnet e restrinja a rede RPC.
