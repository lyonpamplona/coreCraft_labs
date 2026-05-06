# Modulos e Responsabilidades

| Arquivo | Responsabilidade |
| --- | --- |
| `Dockerfile` | Build multi-stage: lint JavaScript com Node/ESLint, imagem Python final com Ruff, Django, Channels, ZMQ, requests e dotenv. |
| `package.json` / `.eslintrc.json` | Dependencia e regras de lint JavaScript para `static/js/panel/`. |
| `pyproject.toml` | Configuracao Ruff para lint Python no build. |
| `requirements.txt` | Dependencias Python pinadas para builds reprodutiveis, incluindo `redis`, `python-bitcoinlib` e `ruff`. |
| `docker-compose.yaml` | Sobe os tres nodes Bitcoin, Redis, web-app e zmq-listener. |
| `bitcoin.conf.example` | Template seguro de RPC/ZMQ para mainnet, signet e regtest. |
| `bitcoin.conf` | Arquivo local ignorado pelo Git, montado nos containers Bitcoin. |
| `.env` | Define endpoints, usuarios e senhas RPC usados pela aplicacao. |
| `manage.py` | CLI administrativa Django. |
| `core/settings.py` | Configuracoes Django/ASGI/Channels lidas do ambiente. |
| `core/urls.py` | Rotas HTTP `/`, `/terminal/`, auth, healthcheck e APIs agregadas `/api/*`. |
| `core/auth.py` | Validacao de token/cookie HTTP/WebSocket e Origin. |
| `core/rpc.py` | Parser, politica por rede e cliente JSON-RPC. |
| `core/views.py` | Renderizacao da interface, healthcheck, endpoint RPC HTTP e APIs agregadas do dashboard. |
| `core/asgi.py` | Roteamento HTTP/WebSocket. |
| `core/consumers.py` | Consumer WebSocket do grupo `btc_events`. |
| `core/zmq_listener.py` | Listener ZMQ multi-rede, publicador de eventos e gravador de resumos em Redis. |
| `templates/index.html` | Shell da interface multi-terminal e includes dos componentes. |
| `templates/components/` | Componentes HTML de header, sidebars, metricas, viewer, terminal, login e icones. |
| `static/css/panel.css` | Agregador dos estilos segmentados do painel. |
| `static/css/panel/` | Estilos separados por base, shell, sidebars, conteudo, terminal, controles e responsividade. |
| `static/js/panel/` | JavaScript separado por estado, UI, API, terminal e bootstrap. |
| `static/css/vendor/` / `static/js/vendor/` | Assets locais do xterm.js e xterm-addon-fit usados pelo terminal. |
| `scripts/download_vendors.py` | Script para baixar/atualizar vendors locais do xterm.js. |
| `docs/` | Documentacao, auditoria e roadmap. |

## `core/views.py`

Funcoes:

- `index(request)`: renderiza a interface.
- `health(request)`: responde healthcheck HTTP.
- `auth_verify(request)`: valida token e grava cookie `HttpOnly`.
- `auth_logout(request)`: remove o cookie de autenticacao.
- `terminal_command(request)`: valida requisicao e encaminha comando RPC.
- `mempool_summary(request)`: resume `getmempoolinfo`/`getrawmempool true` com escudo para mempools grandes.
- `blockchain_lag(request)`: retorna blocos, headers e lag de sincronizacao.
- `events_summary(request)`: resume contadores ZMQ recentes mantidos em Redis.
- `events_latest(request)`: retorna blocos/txs recentes persistidos pelo listener.
- `events_state_comparison(request)`: compara melhor bloco RPC com ultimo bloco observado via ZMQ.
- `faucet_balance(request)`: consulta o saldo da wallet Signet `corecraft_faucet`.
- `faucet_dispense(request)`: envia `0.01 sBTC` da wallet interna para endereco novo gerado pelo backend.

## `core/rpc.py`

Responsavel por:

- interpretar comandos com `shlex.split`;
- converter parametros JSON basicos;
- aplicar allowlist em mainnet/signet;
- permitir metodos de wallet em signet para a faucet controlada;
- aplicar blocklist em regtest;
- normalizar erros de comunicacao RPC;
- aplicar timeout configuravel por `RPC_TIMEOUT_SECONDS`;
- cachear consultas read-only por `RPC_CACHE_SECONDS`;
- cachear erros temporarios por `RPC_ERROR_CACHE_SECONDS`;
- coalescer chamadas RPC iguais com lock por chave.
- aceitar `bypass_policy=True` apenas para fluxos internos do backend.

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
- gravar listas Redis `zmq:<rede>:blocks` e `zmq:<rede>:txs`;
- publicar eventos no grupo `btc_events`;
- registrar logs e encerrar sockets de forma graciosa.

## `templates/index.html` e `templates/components/`

Contem:

- `index.html`: head, carregamento de assets, shell `.ide-shell`, tabs, statusbar e includes;
- `components/header.html`: marca, busca/contexto, status de conexao e operador;
- `components/sidebar_left.html`: Activity Bar, Explorer, Docs, Busca, Fluxos, Execucao e Ajustes;
- `components/sidebar_right.html`: timeline lateral e `block-feed`;
- `components/metrics.html`: cards Node Sync & Divergence, Mempool Intelligence e Event Activity;
- `components/json_viewer.html`: `rpc.response` e viewer de documentacao;
- `components/terminal.html`: toolbar agrupada por rede, mempool, wallet/mineracao/faucet e utilitarios, alem dos mounts xterm;
- `components/login_overlay.html`: formulario de token;
- `components/icons.html`: simbolos SVG compartilhados.

## `static/css/panel.css` e `static/css/panel/`

Contem:

- `panel.css`: imports na ordem correta;
- `00-base.css`: fontes, variaveis globais, reset, toasts e login;
- `10-shell.css`: shell IDE, topbar, workspace e estrutura principal;
- `20-sidebars.css`: Activity Bar, Explorer e paineis laterais;
- `30-content.css`: conteudo central, editor, tabs e metricas;
- `40-terminal.css`: terminal, toolbar, comandos rapidos e xterm;
- `50-rightbar-status.css`: timeline lateral e statusbar;
- `60-controls-settings.css`: inputs, macros, ajustes, temas e toggles;
- `70-docs-timeline.css`: viewer de docs, cards de blocos e resize handles;
- `80-responsive.css`: breakpoints responsivos;
- `90-overrides.css`: estabilizacoes finais apos testes visuais.

## `static/js/panel/`

Contem:

- `state.js`: estado compartilhado, constantes, temas, docs, autocomplete e ajuda local de contingencia;
- `terminal.js`: prompt, foco, resize, historico, autocomplete, formatacao de saida, filtro de `help` e criacao das instancias xterm.js por rede;
- `ui.js`: viewer JSON, docs, markup seguro da timeline, troca de rede, navegacao, paineis, ajustes, temas, fontes, preferencias e toasts;
- `api.js`: headers de autenticacao, verificacao de token, WebSocket, eventos ZMQ, envio de comandos para `/terminal/`, chamadas `/api/*`, polling, faucet Signet, wallet regtest, macros **Forjar 1**/**Forjar 100** e bootstrap autenticado;
- `main.js`: exposicao de handlers usados pelo template, listeners do DOM, resize handles, carregamento de preferencias e verificacao inicial de token.

## Pontos de Atencao

- `bitcoin.conf` real deve permanecer ignorado pelo Git.
- Evite recolocar CSS, JavaScript ou grandes blocos de HTML direto em `templates/index.html`.
- Ao editar componentes, preserve os `id`, `data-*` e classes consumidos por `static/js/panel/`.
- O modelo de autenticacao ainda e token compartilhado, nao usuarios individuais.
