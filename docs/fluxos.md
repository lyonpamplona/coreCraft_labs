# Fluxos do Sistema

## 1. Inicializacao

```mermaid
sequenceDiagram
    participant User as Usuario
    participant Compose as Docker Compose
    participant BTC as bitcoind
    participant Redis as Redis
    participant Web as web-app
    participant ZMQ as zmq-listener

    User->>Compose: docker compose up --build
    Compose->>BTC: inicia Bitcoin Core regtest
    BTC->>BTC: carrega bitcoin.conf
    Compose->>Redis: inicia Redis
    Compose->>Web: python manage.py runserver 0.0.0.0:8000
    Compose->>ZMQ: python -m core.zmq_listener
    ZMQ->>BTC: assina tcp://bitcoind:28332 e :28333
    Web-->>User: interface em http://localhost:8005
```

## 2. Carregamento da Interface

1. O navegador faz `GET /`.
2. `core.urls` direciona para `views.index`.
3. `views.index` renderiza `templates/index.html`.
4. O HTML inicializa xterm.js, botoes de macro, dashboard e WebSocket.
5. O WebSocket conecta em `/ws/btc/`.
6. O consumer registra a conexao no grupo `btc_events`.

## 3. Comando RPC pelo Terminal

```mermaid
sequenceDiagram
    participant UI as Terminal web
    participant View as terminal_command
    participant Parser as Parser
    participant RPC as rpc_call
    participant BTC as Bitcoin Core

    UI->>View: POST /terminal/ {"command": "getblockcount"}
    View->>Parser: parse_terminal_command(command)
    Parser-->>View: method + params
    View->>RPC: rpc_call(method, params)
    RPC->>BTC: JSON-RPC HTTP Basic Auth
    BTC-->>RPC: result/error
    RPC-->>View: JSON
    View-->>UI: JsonResponse
    UI->>UI: imprime saida no xterm.js
```

Exemplo:

```text
generatetoaddress 1 bcrt1...
```

Vira:

```json
{
  "jsonrpc": "2.0",
  "id": "django",
  "method": "generatetoaddress",
  "params": [1, "bcrt1..."]
}
```

## 4. Dashboard de Mempool

1. A cada 3 segundos, o frontend chama `fetchMempoolState`.
2. A funcao envia `getmempoolinfo` para `POST /terminal/`.
3. O backend consulta o Bitcoin Core via RPC.
4. O frontend atualiza:
   - quantidade de transacoes;
   - tamanho total em bytes;
   - taxas acumuladas.

## 5. Eventos em Tempo Real

```mermaid
sequenceDiagram
    participant BTC as Bitcoin Core
    participant ZMQ as zmq-listener
    participant Redis as Redis Channel Layer
    participant Consumer as BTCEventConsumer
    participant UI as Navegador

    BTC-->>ZMQ: rawtx/rawblock via ZMQ
    ZMQ->>ZMQ: extrai topic, size e sequence
    ZMQ->>Redis: group_send("btc_events")
    Redis-->>Consumer: evento btc_message
    Consumer-->>UI: WebSocket JSON
    UI->>UI: imprime evento e atualiza feed
```

Payload enviado ao frontend:

```json
{
  "topic": "rawblock",
  "size": 1234,
  "sequence": 42
}
```

## 6. Macro "Forjar 1 Bloco"

1. O usuario clica no botao de macro.
2. O frontend executa `getnewaddress` em modo silencioso.
3. Se receber um endereco, executa `generatetoaddress 1 <endereco>`.
4. O Bitcoin Core minera o bloco em regtest.
5. O ZMQ publica `rawblock`.
6. O WebSocket entrega o evento.
7. O feed lateral adiciona o novo bloco.

## 7. Tratamento de Erros

- Linha vazia retorna `{"error": "No command"}`.
- Metodo HTTP diferente de POST em `/terminal/` retorna `405`.
- Erros RPC sao exibidos como `[RPC ERROR]`.
- Falhas de comunicacao entre frontend e backend sao exibidas como `[SYSTEM ERROR]`.
- Falhas internas do listener ZMQ ainda nao possuem retry/backoff explicito.
