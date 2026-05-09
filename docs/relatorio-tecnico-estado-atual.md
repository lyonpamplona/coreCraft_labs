# Relatorio Tecnico do Estado Atual do Codigo

## Escopo

Este relatorio descreve o estado atual do coreCraft Multi-Node apos a separacao
do painel em templates, CSS e ES modules. A analise cobre backend Django/ASGI,
cliente RPC, listener ZMQ, frontend, templates, estilos, Docker Compose,
configuracao, documentacao, riscos e proximos passos recomendados.

## Sumario Executivo

O projeto esta em um estado funcional de laboratorio local. A arquitetura esta
bem separada: Django entrega HTTP e autenticacao, `core.rpc` concentra parsing e
politicas JSON-RPC, Channels/Redis entregam WebSocket, `core.zmq_listener`
encaminha eventos dos nodes, e o frontend foi quebrado em modulos menores.

A maior melhoria recente foi a remocao do template monolitico. O painel agora
usa `templates/components/`, `static/css/panel/` e cinco modulos JavaScript:
`state.js`, `terminal.js`, `ui.js`, `api.js` e `main.js`. Nos ajustes mais
novos, o dashboard passou a consumir endpoints agregados `/api/*`, o listener
ZMQ passou a manter janelas curtas de blocos/transacoes em Redis, o terminal
ganhou uma faixa de comandos agrupada por rede, mempool, wallet/mineracao/faucet
e utilitarios, e Signet ganhou uma faucet controlada pela wallet
`corecraft_faucet`.

Os principais riscos atuais sao:

- nao ha suite automatizada de testes;
- o Compose usa `manage.py runserver`, adequado para laboratorio, nao producao;
- xterm.js e FitAddon agora sao servidos por assets locais, mas precisam ser mantidos atualizados;
- algumas falhas no listener ZMQ e nas APIs agregadas sao silenciadas ou
  devolvidas como payload `{"error": ...}`, dificultando diagnostico;
- o cache RPC e em memoria, sem limite global de crescimento;
- a autenticacao e por token compartilhado, sem usuarios, permissoes ou trilha de auditoria.

## Inventario Tecnico

| Area | Arquivos | Linhas aproximadas | Observacao |
| --- | --- | ---: | --- |
| Backend Python | `core/*.py` | cerca de 1150 | Django, auth, RPC, APIs agregadas, ASGI, WebSocket e ZMQ listener. |
| Frontend JS | `static/js/panel/*.js` | cerca de 1100 | ES modules separados por estado, terminal, UI, API e bootstrap. |
| CSS | `static/css/panel*.css` | 2147 | Estilos segmentados por base, shell, sidebars, conteudo, terminal, controles e responsivo. |
| Templates | `templates/index.html` + `templates/components/*.html` | 294 | Shell principal pequeno e componentes Django menores. |
| Vendors locais | `static/js/vendor/*` + `static/css/vendor/*` | externo | xterm.js e xterm-addon-fit servidos sem CDN. |
| Documentacao | `docs/*.md` | extensa | Guias de arquitetura, comandos, configuracao, fluxos, tutorial e refatoracao. |

## Arquitetura Atual

Fluxo principal:

1. O navegador acessa `GET /`.
2. `core.views.index` renderiza `templates/index.html`.
3. O template inclui componentes de `templates/components/`.
4. `static/css/panel.css` importa os CSS segmentados.
5. `static/js/panel/main.js` importa `state.js`, `ui.js`, `terminal.js` e `api.js`.
6. `initTerminals()` cria uma instancia xterm.js para `mainnet`, `signet` e `regtest`.
7. Se `REQUIRE_AUTH=True`, o usuario autentica com `APP_AUTH_TOKEN`.
8. O backend grava cookie `HttpOnly`.
9. O frontend abre WebSocket em `/ws/btc/`.
10. Comandos RPC sao enviados para `POST /terminal/`.
11. O dashboard consulta `/api/blockchain/lag/`, `/api/mempool/summary/`, `/api/events/summary/`, `/api/events/state-comparison/` e, em Signet, `/api/faucet/balance/`.
12. Eventos ZMQ chegam via `zmq-listener -> Redis/Channels -> BTCEventConsumer -> WebSocket`.
13. O listener tambem grava `zmq:<rede>:blocks`, `zmq:<rede>:txs` e `zmq:<rede>:last_time` em Redis para os endpoints agregados.
14. Os botoes rapidos do terminal chamam `executeMacro` ou `mineBlockMacro`; mineracao fica restrita ao `regtest`, wallet em mainnet e bloqueada, e Signet mostra apenas o fluxo de faucet.

## Backend Django e ASGI

### Pontos Fortes

- Rotas HTTP pequenas e objetivas em `core/urls.py`.
- `core/views.py` delega parsing, politica e chamada RPC para `core.rpc`, mantendo `/terminal/` simples.
- `core/views.py` expoe APIs agregadas para sync/lag, mempool, eventos observados e faucet Signet.
- `core/auth.py` centraliza token HTTP, cookie, Bearer token, WebSocket scope e Origin.
- `core/consumers.py` valida token e Origin antes de aceitar o WebSocket.
- `core/settings.py` usa `.env`, `STATICFILES_DIRS`, Channels/Redis e headers de seguranca basicos.

### Pontos de Atencao

- `DATABASES = {}` e ausencia de usuarios indicam que o app nao usa auth nativa do Django.
- Nao ha `CsrfViewMiddleware`. A protecao principal e o token/cookie com `SameSite=Lax`, suficiente para laboratorio, mas fraca para exposicao fora do localhost.
- O Compose usa `python manage.py runserver 0.0.0.0:8000`; isso deve ser substituido por Daphne/Gunicorn/Uvicorn em qualquer ambiente mais serio.
- O healthcheck HTTP retorna apenas `{"status":"ok"}` e nao valida Redis, RPC, APIs agregadas ou WebSocket.
- As APIs agregadas capturam `Exception` e devolvem `{"error": str(e)}` com HTTP 200; isso simplifica o frontend, mas perde semantica HTTP e pode expor detalhes internos em laboratorio.

## APIs Agregadas do Dashboard

Endpoints atuais:

- `GET /api/blockchain/lag/?network=<rede>`: chama `getblockchaininfo` e retorna `blocks`, `headers`, `lag`, `ibd` e `progress`.
- `GET /api/mempool/summary/?network=<rede>`: chama `getmempoolinfo`; quando a mempool tem ate 1500 transacoes, chama `getrawmempool true` para calcular fee media e distribuicao low/medium/high.
- `GET /api/events/summary/?network=<rede>`: le Redis para contar blocos/txs observados e estimar tx/s.
- `GET /api/events/latest/?network=<rede>`: retorna ate 5 blocos e 10 txs recentes do Redis.
- `GET /api/events/state-comparison/?network=<rede>`: compara `getbestblockhash` com o ultimo bloco observado via ZMQ.
- `GET /api/faucet/balance/?network=signet`: consulta saldo da wallet `corecraft_faucet`.
- `POST /api/faucet/dispense/`: envia `0.01 sBTC` da wallet interna para endereco novo gerado no backend; se a wallet existir mas estiver sem saldo suficiente, o modo demo retorna `simulated: true` com TXID simulado.

### Pontos Fortes

- Tira do navegador a responsabilidade de combinar RPC e Redis.
- Permite cards mais ricos sem expor multiplas chamadas RPC diretas no frontend.
- O endpoint de mempool possui escudo anti-varredura para mempools acima de 1500 transacoes.
- A comparacao RPC vs ZMQ ajuda a detectar feed atrasado ou divergente.
- A faucet nao recebe valor nem endereco arbitrario do cliente, reduzindo o escopo operacional.
- A flag `simulated` deixa explicito quando o fluxo foi apenas visual e nao houve propagacao real na Signet.

### Pontos de Atencao

- Endpoints puramente Redis aceitam qualquer nome de rede na query string e apenas consultam chaves vazias/arbitrarias; vale validar contra `mainnet`, `signet` e `regtest`.
- `get_redis_client()` cria um cliente novo por chamada; funciona em laboratorio, mas pode ser substituido por cliente singleton/pool explicito.
- `mempool_summary` pode fazer uma chamada pesada a `getrawmempool true` para ate 1500 transacoes por polling.
- A dependencia `redis` agora e direta e deve permanecer declarada em `requirements.txt`.

## RPC e Politicas por Rede

`core/rpc.py` e hoje um dos modulos centrais do projeto.

Responsabilidades atuais:

- parsear comandos com `shlex.split`;
- converter parametros `true`, `false`, `null`, numeros e JSON inline;
- aplicar allowlist somente leitura em `mainnet`;
- aplicar allowlist em `signet`, incluindo metodos de wallet necessarios para a faucet controlada;
- aplicar blocklist em `regtest`;
- executar JSON-RPC HTTP com timeout configuravel;
- cachear metodos read-only selecionados;
- cachear erros temporarios;
- coalescer chamadas iguais usando lock por chave;
- tratar `inspect_tx` localmente com `python-bitcoinlib`.
- permitir `bypass_policy=True` para endpoints internos controlados.

### Pontos Fortes

- A separacao de `RPCParseError` e `RPCPolicyError` permite respostas HTTP corretas.
- Allowlist de redes publicas reduz bastante o risco operacional.
- Cache e backoff ajudam quando mainnet/signet estao lentas, em pruning ou sincronizacao.
- `inspect_tx` evita expor parsing de transacao ao frontend e retorna JSON estruturado.

### Pontos de Atencao

- `_rpc_cache` e `_rpc_locks` nao possuem limite global nem limpeza periodica. Em uso normal isso e aceitavel, mas muitos parametros distintos podem crescer memoria.
- O cache e por processo; se houver mais de um worker, cada processo tera seu proprio cache.
- `inspect_tx` trata qualquer string de 64 caracteres como txid antes de tentar parsear como hex. Para transacoes raw curtas ou inputs ambiguos, a mensagem de erro pode ser pouco precisa.
- Os logs de erro RPC foram reduzidos; isso melhora ruido, mas dificulta diagnostico fino de falhas intermitentes.

## Listener ZMQ

`core/zmq_listener.py` assina topicos por rede:

- `mainnet`: `rawblock,hashblock`;
- `signet`: `rawblock,hashblock`;
- `regtest`: `rawtx,rawblock,hashblock`.

Quando recebe `hashblock`, grava `{hash, ts}` em `zmq:<rede>:blocks`, atualiza
`zmq:<rede>:last_time` e tenta enriquecer o evento com `getblockheader` e
`getblockstats`. Quando recebe `rawtx`, tenta desserializar a transacao, grava
`{txid, ts}` em `zmq:<rede>:txs` e calcula `total_out_sats`, `vin_count` e
`vout_count`.

### Pontos Fortes

- O listener roda separado do web-app, isolando polling ZMQ do request/response HTTP.
- Topicos configuraveis por ambiente reduzem carga em mainnet/signet.
- O payload enviado ao frontend e pequeno e normalizado.
- As listas Redis ficam aparadas: 50 blocos recentes e 1000 transacoes recentes por rede.
- O shutdown fecha sockets e termina o contexto ZMQ.

### Pontos de Atencao

- `mark_ready()` cria readiness apos criar sockets, mas antes de provar que eventos chegam ou que Redis esta publicavel.
- Falhas em `publish_event`, Redis, RPC auxiliar e desserializacao de `rawtx` sao silenciadas com `pass`; isso pode esconder problemas reais.
- O RPC auxiliar do listener usa timeout fixo de 5 segundos, independente de `RPC_TIMEOUT_SECONDS`.
- `depends_on` no Compose nao aguarda healthcheck dos nodes; o listener pode iniciar antes dos nodes estarem prontos.

## Frontend JavaScript

Modulos atuais:

- `state.js`: constantes, temas, docs, ajuda local e estado da sessao;
- `terminal.js`: xterm.js, prompt, historico, autocomplete, resize e help;
- `ui.js`: navegacao, troca de rede, viewer JSON/docs, timeline, toasts e preferencias;
- `api.js`: auth, WebSocket, eventos ZMQ, RPC, chamadas `/api/*`, polling, faucet Signet, wallet regtest e macros;
- `main.js`: listeners DOM, resize handles, preferencias e bootstrap.

### Pontos Fortes

- Separacao atual esta clara e segue responsabilidades reais.
- `xterm-addon-fit` e fallback manual tornam o terminal mais resiliente a resize.
- Historico e input sao separados por rede.
- `renderRpcResponse` e `blockCardMarkup` escapam conteudo antes de inserir HTML.
- Polling pausa quando a aba esta oculta, evita chamadas sobrepostas e consulta endpoints agregados em paralelo.
- Preferencias visuais persistem em `localStorage`.
- Mineracao e bloqueada fora de `regtest`; wallet em mainnet tambem e bloqueada.
- Respostas RPC estruturadas deixam de inundar o terminal e passam a aparecer no painel `rpc.response`.
- A toolbar atual cobre Info, Peers, Mempool, `estimatesmartfee 6`, Endereco, Saldo, Pingar Faucet, Forjar 100, Forjar 1, Ajuda e Limpar.
- `Forjar 100` automatiza wallet/endereco e chama `generatetoaddress 100 <endereco>` para maturar recompensas anteriores em demos regtest.

### Pontos de Atencao

- `showToast()` usa `innerHTML` sem escapar `title` e `message`. Hoje as mensagens sao majoritariamente internas, mas e melhor trocar para `textContent`.
- Ainda existem handlers `onclick` no HTML para compatibilidade. Funciona, mas mistura contrato de template e JS global.
- `terminal.html` usa alguns estilos inline nos botoes/grupos; funciona, mas dificulta padronizacao visual futura.
- O cache bust de assets usa `?v=20260504` manual; esquecimentos podem causar navegador servindo JS/CSS antigo.
- O Dockerfile ja roda ESLint para `static/js/panel/` e Ruff para Python; ainda faltam testes automatizados.
- `legacyStoredToken` ainda le `corecraft.authToken` para compatibilidade e remove depois; isso e bom para migracao, mas pode ser removido futuramente.

## Templates e CSS

### Estado Atual

- `templates/index.html` virou shell pequeno.
- Componentes foram separados em `header`, `sidebar_left`, `sidebar_right`, `metrics`, `json_viewer`, `terminal`, `login_overlay` e `icons`.
- CSS foi dividido em dez arquivos importados por `static/css/panel.css`.
- `terminal.html` organiza comandos rapidos por grupos: rede, mempool, wallet/mineracao/faucet e utilitarios.
- `metrics.html` mostra tres cards orientados a operacao: Node Sync & Divergence, Mempool Intelligence e Event Activity.

### Pontos Fortes

- A modularizacao reduz risco de edicoes acidentais.
- Contratos por `id`, `data-*` e classes estao relativamente claros.
- Layout contempla desktop, tablet e mobile.
- O painel tem controles esperados: tema, fonte, cores, toggles, resize handles e comandos rapidos.

### Pontos de Atencao

- `sidebar_left.html` ainda e grande, porque concentra Explorer, Busca, Docs, Fluxos, Execucao e Ajustes.
- O viewer de Docs ainda exibe resumos internos; ele nao carrega Markdown diretamente do diretorio `docs/`.
- Icones SVG sao inline e funcionam bem, mas nao ha sistema externo de icones; manter consistencia depende de disciplina manual.

## Docker, Configuracao e Operacao

Servicos principais:

- `btc-mainnet`, `btc-signet`, `btc-regtest`;
- `redis`;
- `web-app`;
- `zmq-listener`.

### Pontos Fortes

- `.env.example` documenta variaveis essenciais de auth, RPC, Redis, allowlists, blocklist e topicos ZMQ.
- `bitcoin.conf.example` usa `rpcauth`, `prune` em redes publicas e ZMQ segmentado; Signet precisa de wallet habilitada se a faucet local for usada.
- Healthchecks existem para Bitcoin Core, Redis, web-app e listener.
- `scripts/sync_rpcauth.py` ajuda a manter `.env` e `bitcoin.conf` alinhados sem imprimir segredos.
- `scripts/download_vendors.py` ajuda a atualizar os vendors locais de xterm/FitAddon.
- `requirements.txt` declara `redis`, pois views e listener importam esse pacote diretamente.
- `requirements.txt`, `pyproject.toml` e `package.json` cobrem lint Python/JS no build.

### Pontos de Atencao

- `rpcallowip=0.0.0.0/0` e `rpcbind=0.0.0.0` sao aceitaveis dentro do Docker local, mas perigosos fora dele.
- `ruimarinho/bitcoin-core:latest` nao fixa versao do Bitcoin Core; builds podem mudar com o tempo.
- O container instala dependencias Python pinadas, mas nao ha lockfile com hashes.
- O app roda como usuario `appuser`, ponto positivo; em desenvolvimento o volume `.:/app` pode sobrescrever permissoes da imagem.

## Seguranca

Estado atual: adequado para laboratorio local, inadequado para exposicao publica.

Controles existentes:

- token compartilhado `APP_AUTH_TOKEN`;
- cookie `HttpOnly`, `SameSite=Lax`;
- headers `X-CoreCraft-Token` e `Authorization: Bearer` para clientes externos;
- validação de Origin no WebSocket;
- allowlist para `mainnet` e `signet`;
- blocklist em `regtest`;
- `bitcoin.conf` e `.env` reais fora do Git.

Riscos restantes:

- sem usuarios, papeis ou auditoria por operador;
- sem CSRF nativo do Django;
- token compartilhado pode ser vazado e libera todo o painel;
- sem rate limit por IP/token;
- assets de terminal sao locais, mas precisam de rotina de atualizacao e validacao;
- comandos RPC permitidos em redes publicas devem ser revisados antes de qualquer uso sensivel.

## Qualidade, Testes e Manutenibilidade

O codigo esta mais legivel depois da modularizacao e das docstrings/JSDoc. A
maior lacuna e a falta de testes automatizados.

Recomendado adicionar:

- testes unitarios para `parse_terminal_command`, `coerce_rpc_param`, allowlist/blocklist e cache RPC;
- testes para `auth.py`, especialmente cookie/header/Bearer e Origin;
- testes do `sync_rpcauth.py`;
- smoke test HTTP de `/health/`, `/auth/verify/` e `/terminal/`;
- testes para endpoints da faucet Signet e para `bypass_policy`;
- um checklist visual com Playwright quando o ambiente tiver Node disponível.

## Achados Priorizados

| Prioridade | Achado | Impacto | Recomendacao |
| --- | --- | --- | --- |
| Alta | Nao ha testes automatizados | Regressao pode passar despercebida | Criar suite minima para RPC/auth e smoke HTTP. |
| Alta | `runserver` no Compose | Inadequado fora de laboratorio | Usar Daphne/Gunicorn para ambiente nao local. |
| Media | `showToast` usa `innerHTML` sem escape | Possivel XSS se mensagem externa entrar no fluxo | Montar DOM com `textContent`. |
| Media | APIs agregadas retornam erros internos como HTTP 200 | Observabilidade e clientes externos ficam menos precisos | Usar status HTTP apropriado e mensagens normalizadas. |
| Media | Listener ZMQ silencia excecoes | Diagnostico de eventos perdidos fica dificil | Logar falhas com rate limit ou nivel debug/warning. |
| Media | Cache RPC sem limite global | Crescimento de memoria em uso adversarial | Adicionar limite LRU ou limpeza periodica. |
| Media | Redis e consultado por chave derivada de `network` sem validacao explicita | Chaves arbitrarias podem ser consultadas | Validar rede contra conjunto permitido antes de acessar Redis. |
| Media | Faucet Signet depende de wallet local com saldo | Sem saldo, o modo demo retorna TXID simulado e pode ser confundido com envio real | Documentar `simulated`, checar saldo antes da demo e remover o fallback em validacoes reais. |
| Baixa | Estilos inline em `terminal.html` | Padronizacao visual pode ficar espalhada | Mover regras para `static/css/panel/40-terminal.css`. |
| Baixa | Cache bust manual `?v=20260504` | Navegador pode ficar com assets antigos | Automatizar versao por build/env. |
| Baixa | `sidebar_left.html` concentra muitos paineis | Arquivo pode crescer novamente | Separar paineis laterais em componentes menores se continuar evoluindo. |

## Recomendacoes de Evolucao

1. Criar testes unitarios de `core.rpc` e `core.auth`.
2. Trocar `showToast` para DOM seguro com `textContent`.
3. Normalizar erros das APIs agregadas e usar status HTTP apropriado.
4. Validar `network` explicitamente antes de acessar Redis.
5. Adicionar logs controlados no listener ZMQ.
6. Automatizar versionamento de assets estaticos.
7. Fixar versao da imagem Bitcoin Core em vez de usar `latest`.
8. Adicionar rate limit simples para `/auth/verify/`, `/terminal/` e `/api/*`.
9. Criar auditoria local de comandos RPC executados.
10. Separar `sidebar_left.html` se novos paineis forem adicionados.
11. Substituir `runserver` por servidor ASGI adequado quando sair de laboratorio.

## Validacao Executada Nesta Revisao

Comandos executados no ambiente local:

```bash
PYTHONPYCACHEPREFIX=/tmp/bitcoin-regtest-pycache python3 -m py_compile manage.py core/settings.py core/urls.py core/views.py core/wsgi.py core/asgi.py core/consumers.py core/zmq_listener.py core/auth.py core/rpc.py core/docs_test.py
git diff --check
docker compose config
docker compose run --rm --no-deps web-app python manage.py check
docker compose run --rm --no-deps web-app ruff check core/ manage.py
docker build --target linter-js -t corecraft-js-lint .
```

`ruff` e `npx eslint` nao estavam instalados diretamente no host, entao foram
executados pelo container/estagio Docker do projeto.

Resultado:

- compilacao Python passou;
- checagem de whitespace/diff passou;
- `docker compose config` passou;
- `manage.py check` passou dentro do container;
- `ruff check` passou dentro do container;
- o estagio `linter-js` passou e executou `npx eslint static/js/panel/`;
- nao foram encontrados testes automatizados versionados.

## Conclusao

O codigo atual esta consistente com o objetivo de laboratorio Bitcoin multi-rede.
A modularizacao recente melhorou bastante a manutencao do painel. O backend tem
responsabilidades bem separadas, o frontend esta compreensivel e a documentacao
esta alinhada ao desenho atual.

O proximo salto de maturidade nao e mais reorganizar arquivos: e adicionar
testes, melhorar observabilidade, endurecer seguranca e automatizar validacoes.
Com esses pontos, o projeto fica muito mais confiavel para demos longas,
workshops e evolucao de automacoes em cima do Bitcoin Core.
