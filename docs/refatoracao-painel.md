# Refatoracao do Painel IDE

Este documento descreve a organizacao atual do painel web apos a separacao do
template monolitico em arquivos estaticos e componentes Django menores.

## Objetivo

O arquivo `templates/index.html` concentrava HTML, CSS e JavaScript em um unico
bloco grande, o que dificultava correcoes pontuais e aumentava o risco de uma
alteracao visual quebrar o terminal, a timeline ou a autenticacao.

A refatoracao separa responsabilidades:

- `templates/index.html`: shell principal da pagina, carregamento de assets e
  includes dos componentes.
- `templates/components/header.html`: barra superior com marca, comando ativo,
  status de conexao e operador.
- `templates/components/sidebar_left.html`: Activity Bar, Explorer, Docs,
  Busca, Fluxos, Execucao e Ajustes.
- `templates/components/sidebar_right.html`: timeline lateral de eventos.
- `templates/components/metrics.html`: cards Node Sync & Divergence, Mempool
  Intelligence e Event Activity.
- `templates/components/json_viewer.html`: editor `rpc.response` e viewer de
  documentacao.
- `templates/components/terminal.html`: toolbar, comandos rapidos e tres pontos
  de montagem xterm.
- `templates/components/login_overlay.html`: modal de autenticacao por token.
- `templates/components/icons.html`: simbolos SVG compartilhados pela interface.
- `static/css/panel.css`: agregador de imports dos estilos segmentados.
- `static/css/panel/`: estilos separados por base, shell, sidebars, conteudo,
  terminal, rightbar/statusbar, controles, docs/timeline, responsivo e overrides.
- `static/js/panel/main.js`: bootstrap, listeners do DOM, resize,
  preferencias e verificacao inicial de autenticacao.
- `static/js/panel/state.js`: estado compartilhado, constantes, temas, topicos
  de docs e ajuda local de contingencia.
- `static/js/panel/ui.js`: navegacao, viewer JSON/docs, timeline, toasts,
  preferencias visuais e troca de rede.
- `static/js/panel/terminal.js`: prompt, historico, autocomplete, formatacao de
  saida, filtro de `help` e inicializacao do xterm.
- `static/js/panel/api.js`: autenticacao, WebSocket, eventos ZMQ, comandos RPC,
  chamadas `/api/*`, polling do dashboard, wallet regtest e macros.
- `core/settings.py`: registra `STATICFILES_DIRS` para servir a pasta `static/`
  no ambiente Django.

## Ajustes Aplicados

- O terminal agora fica limitado por altura responsiva e nao cobre mais cards,
  documentacao ou barra inferior.
- O painel usa `min-height: 0` e `overflow` interno nas areas certas para evitar
  sobreposicao entre editor, terminal, sidebar e statusbar.
- A aba `docs` ativa um modo de leitura que reduz o terminal e prioriza o viewer.
- O xterm recalcula colunas e linhas apos troca de rede, resize, alteracao de
  fonte, mudanca de statusbar e retorno de aba do navegador.
- A timeline possui estado vazio e limite de itens, evitando listas enormes que
  poluem a lateral.
- O prompt do terminal rola para o final depois de comandos e eventos ZMQ.
- O terminal usa `xterm-addon-fit` quando disponivel para calcular linhas e
  colunas com base no espaco real, evitando que respostas longas escondam o
  proximo prompt.
- Os botoes de macro ficam em faixa horizontal responsiva, com comandos
  read-only disponiveis para todas as redes e comandos de wallet/mineracao
  restritos ao regtest.
- A timeline colapsa em janelas menores e os cards de bloco usam formato
  compacto com limite de 18 eventos recentes.
- O polling automatico possui intervalo maior, trava de concorrencia e backoff
  quando uma API agregada falha.
- O dashboard deixou de depender de chamadas RPC diretas no navegador e passou
  a consumir endpoints agregados para lag, mempool, atividade ZMQ e divergencia
  entre RPC e ultimo bloco observado.
- O listener ZMQ grava janelas recentes em Redis para alimentar bootstrap da
  timeline e os cards de eventos.
- O backend cacheia consultas RPC read-only e erros temporarios para proteger o
  Bitcoin Core contra abas antigas ou polling repetido.
- Os includes de CSS/JS usam versao na URL para evitar cache antigo do navegador
  depois de refatoracoes de interface.
- O comando `help` usa a resposta real do Bitcoin Core. `help <categoria>`
  filtra secoes reais completas, como `blockchain`, `control`, `mining`,
  `network`, `rawtransactions`, `signer`, `util`, `wallet` e `zmq`.
- O HTML do painel foi quebrado em componentes de template para que alteracoes
  em header, sidebars, metricas, terminal, viewer JSON e login fiquem isoladas.
- CSS e JavaScript tambem foram quebrados em arquivos menores dentro de
  `static/css/panel/` e `static/js/panel/`, preservando a ordem de carregamento
  original para evitar regressao.

## Como Evoluir

Para ajustar layout, edite o arquivo especifico dentro de `static/css/panel/`.
Mantenha `static/css/panel.css` como agregador de imports.

Para alterar a estrutura visual de uma area especifica, edite o componente em
`templates/components/` correspondente. Preserve `id`, `data-*` e classes usadas
por `static/js/panel/`; esses atributos sao o contrato entre template e
comportamento.

Para alterar comportamento do terminal, comandos rapidos, WebSocket ou docs,
edite o modulo correspondente dentro de `static/js/panel/`.

O componente `templates/components/terminal.html` hoje separa os comandos em
grupos: rede (`Info`, `Peers`), mempool (`Mempool`, `Taxas (6 blk)`),
wallet/mineracao em regtest (`Endereco`, `Saldo`, `Forjar 100`, `Forjar 1`) e
utilitarios (`Ajuda`, `Limpar`). Preserve os atributos
`data-terminal-command`, `terminal-wallet-group` e `wallet-separator`, pois eles
sao usados por `main.js`, `api.js` e `ui.js`.

O fluxo de `help` fica dividido entre `static/js/panel/terminal.js` e
`static/js/panel/api.js`: o frontend consulta o `help` completo via
`/terminal/`, filtra secoes quando o usuario digita `help <categoria>` e usa a
ajuda local apenas como contingencia.

Evite recolocar CSS, JavaScript ou grandes blocos de markup diretamente em
`templates/index.html`. O template deve continuar pequeno para que futuras
correcoes fiquem localizadas.

## Validacao Recomendada

Depois de alterar o painel:

```bash
docker compose exec web-app python manage.py check
curl -I http://localhost:8005/static/css/panel.css
curl -I http://localhost:8005/static/css/panel/00-base.css
curl -I http://localhost:8005/static/js/panel/main.js
curl -I http://localhost:8005/static/js/panel/state.js
curl -I http://localhost:8005/static/js/panel/ui.js
curl -I http://localhost:8005/static/js/panel/terminal.js
curl -I http://localhost:8005/static/js/panel/api.js
curl -s -H "X-CoreCraft-Token: $APP_AUTH_TOKEN" "http://localhost:8005/api/blockchain/lag/?network=regtest"
curl -s -H "X-CoreCraft-Token: $APP_AUTH_TOKEN" "http://localhost:8005/api/mempool/summary/?network=regtest"
curl -s -H "X-CoreCraft-Token: $APP_AUTH_TOKEN" "http://localhost:8005/api/events/summary/?network=regtest"
curl -s -o /tmp/corecraft-index.html -w '%{http_code} %{size_download}\n' http://localhost:8005/
```

Tambem valide visualmente nas larguras:

- `1366x768`: desktop comum com timeline.
- `1024x768`: timeline recolhida.
- `768x1024`: tablet com sidebar em drawer.
- `390x844`: celular com toolbar horizontal no terminal.
