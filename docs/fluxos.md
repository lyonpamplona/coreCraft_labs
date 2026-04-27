# Fluxos do Sistema

## 1. Inicializacao

```mermaid
sequenceDiagram
    participant User as Usuario
    participant Compose as Docker Compose
    participant Main as btc-mainnet
    participant Sig as btc-signet
    participant Reg as btc-regtest
    participant Redis as Redis
    participant Web as web-app
    participant ZMQ as zmq-listener

    User->>Compose: docker compose up --build
    Compose->>Main: inicia mainnet
    Compose->>Sig: inicia signet
    Compose->>Reg: inicia regtest
    Compose->>Redis: inicia channel layer
    Compose->>Web: inicia Django/ASGI
    Compose->>ZMQ: inicia listener ZMQ
    Web-->>User: http://localhost:8005
```

## 2. Carregamento da Interface

1. O navegador acessa `GET /`.
2. `core.urls` chama `views.index`.
3. `templates/index.html` cria tres terminais: mainnet, signet e regtest.
4. Se `REQUIRE_AUTH=True`, o navegador solicita `APP_AUTH_TOKEN`.
5. `POST /auth/verify/` valida o token e grava cookie `HttpOnly`.
6. O frontend abre WebSocket em `/ws/btc/`.
7. `BTCEventConsumer` valida cookie/token e Origin, depois registra a conexao no grupo `btc_events`.

Para limpar a sessao, `POST /auth/logout/` remove o cookie e o navegador pode recarregar a tela de login.

## 3. Comando RPC

```mermaid
sequenceDiagram
    participant UI as Terminal web
    participant View as terminal_command
    participant RPC as rpc_call
    participant BTC as Node selecionado

    UI->>View: POST /terminal/ {network, command} + cookie/header
    View->>View: valida autenticacao, JSON, politica e comando
    View->>RPC: rpc_call(network, method, params)
    RPC->>BTC: JSON-RPC HTTP
    BTC-->>RPC: result/error
    RPC-->>View: JSON
    View-->>UI: JsonResponse
```

## 4. Dashboard

O frontend roda `fetchNodeStatus()` a cada 3 segundos:

1. chama `getblockchaininfo`;
2. atualiza progresso/blocos e tamanho em disco;
3. chama `getmempoolinfo`;
4. atualiza taxas acumuladas.

## 5. Eventos ZMQ

```mermaid
sequenceDiagram
    participant BTC as Node Bitcoin
    participant ZMQ as zmq-listener
    participant Redis as Redis
    participant Consumer as BTCEventConsumer
    participant UI as Navegador

    BTC-->>ZMQ: rawtx/rawblock/hashblock
    ZMQ->>ZMQ: monta payload e tenta enriquecer bloco
    ZMQ->>Redis: group_send btc_events
    Redis-->>Consumer: btc_message
    Consumer-->>UI: WebSocket JSON
    UI->>UI: escreve no terminal e atualiza timeline
```

Payload tipico:

```json
{
  "network": "regtest",
  "topic": "block_rich",
  "size": 1234,
  "sequence": 42,
  "height": 42,
  "tx_count": 1,
  "fees": 0
}
```

## 6. Macro de Mineracao

Disponivel apenas para `regtest`:

1. executa `getnewaddress`;
2. executa `generatetoaddress 1 <endereco>`;
3. aguarda evento ZMQ;
4. atualiza terminal e timeline.
