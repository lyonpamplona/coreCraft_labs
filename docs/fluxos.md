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
3. `templates/index.html` monta o shell do painel e inclui os componentes de `templates/components/`.
4. `static/css/panel.css` importa os estilos segmentados em `static/css/panel/`.
5. `static/js/panel/main.js` importa `state.js`, `ui.js`, `terminal.js` e `api.js`.
6. `initTerminals()` cria tres terminais: mainnet, signet e regtest.
7. Se `REQUIRE_AUTH=True`, o navegador solicita `APP_AUTH_TOKEN`.
8. `POST /auth/verify/` valida o token e grava cookie `HttpOnly`.
9. O frontend abre WebSocket em `/ws/btc/`.
10. `BTCEventConsumer` valida cookie/token e Origin, depois registra a conexao no grupo `btc_events`.

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

O frontend roda `fetchNodeStatus()` com intervalo controlado de 15 segundos:

1. chama `/api/blockchain/lag/` para atualizar blocos, headers/lag e estado de sincronizacao;
2. chama `/api/mempool/summary/` para calcular total de transacoes, fee media em sat/vB e distribuicao low/medium/high;
3. chama `/api/events/summary/` para mostrar tx/s, txs vistas e blocos vistos pelo listener ZMQ;
4. chama `/api/events/state-comparison/` para indicar divergencia entre `getbestblockhash` e ultimo bloco ZMQ registrado;
5. evita chamadas sobrepostas com uma trava de concorrencia;
6. aplica backoff temporario quando uma API agregada falha.

No backend, `core.views` combina chamadas RPC e leituras Redis para montar os
resumos. `core.rpc` continua cacheando chamadas read-only repetidas e erros
temporarios, protegendo o Bitcoin Core quando abas antigas do painel continuam
abertas ou quando `mainnet` esta sincronizando/pruned.

```mermaid
sequenceDiagram
    participant UI as Dashboard
    participant API as core.views /api/*
    participant RPC as core.rpc
    participant Redis as Redis ZMQ
    participant BTC as Node Bitcoin

    UI->>API: GET /api/blockchain/lag/
    API->>RPC: getblockchaininfo
    RPC->>BTC: JSON-RPC
    BTC-->>RPC: blocks/headers
    API-->>UI: blocks + lag

    UI->>API: GET /api/events/summary/
    API->>Redis: llen/lindex zmq:<rede>:*
    Redis-->>API: contadores recentes
    API-->>UI: tx/s + observados
```

## 5. Help do Terminal

```mermaid
sequenceDiagram
    participant UI as Terminal web
    participant View as /terminal/
    participant RPC as Bitcoin Core

    UI->>View: help
    View->>RPC: help
    RPC-->>View: help completo
    View-->>UI: todas as secoes

    UI->>View: help wallet
    View->>RPC: help
    RPC-->>View: help completo
    UI->>UI: filtra == Wallet == inteira
```

`help <categoria>` funciona para as categorias expostas pelo Bitcoin Core, como `blockchain`, `control`, `mining`, `network`, `rawtransactions`, `signer`, `util`, `wallet` e `zmq`. Quando o argumento nao e uma categoria, o painel tenta tratar como ajuda especifica de comando, por exemplo `help getblock`.

## 6. Eventos ZMQ

```mermaid
sequenceDiagram
    participant BTC as Node Bitcoin
    participant ZMQ as zmq-listener
    participant Redis as Redis
    participant Consumer as BTCEventConsumer
    participant UI as Navegador

    BTC-->>ZMQ: rawtx/rawblock/hashblock
    ZMQ->>ZMQ: monta payload e tenta enriquecer bloco
    ZMQ->>Redis: grava zmq:<rede>:blocks/txs
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

## 7. Macro de Mineracao

Disponivel apenas para `regtest`:

1. executa `getnewaddress`;
2. executa `generatetoaddress 1 <endereco>`;
3. aguarda evento ZMQ;
4. atualiza terminal e timeline.
