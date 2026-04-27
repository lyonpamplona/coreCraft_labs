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
- executa JSON-RPC com timeout e erros normalizados.

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
- publica `rawtx`, `rawblock` e `block_rich`;
- registra logs;
- trata sinais de encerramento;
- cria arquivo de readiness para healthcheck.

## Frontend

`templates/index.html`:

- cria uma instancia de terminal por rede;
- mantem entrada e historico por rede;
- alterna a view central entre terminal e documentacao;
- alterna paineis laterais de Explorer, Busca, Fluxos, Execucao e Ajustes;
- permite escolher tema, fonte e cores da interface via `localStorage`;
- permite redimensionar paines laterais em telas desktop;
- envia comandos para `/terminal/`;
- usa cookie `HttpOnly` apos o login;
- abre WebSocket com `ws://` ou `wss://` sem token na URL;
- sanitiza dados exibidos em toasts e cards da timeline;
- restringe macros de wallet/mineracao ao `regtest`;
- atualiza dashboard a cada 3 segundos;
- renderiza timeline visual de blocos com status, hash/resumo, tx, peso e taxas.

## Melhorias Planejadas

Detalhes completos:

- [Relatorio de auditoria](auditoria.md)
- [Roadmap de melhorias](roadmap.md)
