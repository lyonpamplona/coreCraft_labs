# Guia de Apresentacao do Projeto

## Resumo Executivo

O coreCraft Multi-Node e um command center local para desenvolvimento Bitcoin. Ele permite operar, estudar e observar tres redes Bitcoin Core a partir de uma unica interface web: `mainnet`, `signet` e `regtest`.

O projeto combina Django/ASGI, WebSocket, Redis, ZMQ, Bitcoin Core, xterm.js e uma interface estilo IDE para entregar um painel operacional com terminal RPC, dashboard de inteligencia de consenso, viewer de documentacao e timeline de blocos/transacoes em tempo real.

## Proposta

O sistema resolve um problema comum em laboratorios Bitcoin: alternar entre redes, containers, credenciais RPC, comandos `bitcoin-cli`, scripts ZMQ, logs e hexadecimais exige muitos passos manuais. A plataforma centraliza esse fluxo em um command center unico, mantendo separacao por rede e politicas de seguranca diferentes para cada ambiente.

Em uma demonstracao, o projeto deve ser apresentado como:

- um laboratorio multi-rede para Bitcoin Core;
- uma interface web para executar comandos RPC;
- uma ponte de eventos em tempo real usando ZMQ, Redis e WebSocket;
- um ambiente seguro para experimentos em `regtest`;
- uma faucet operacional em `signet` para demonstrar fluxo de wallet sem valor real;
- um dashboard para comparar estado RPC, mempool e eventos observados;
- um motor de inspecao para transacoes via `inspect_tx`;
- uma base para evoluir automacoes, dashboards e ferramentas de ensino.

## Publico-Alvo

- Desenvolvedores que estudam Bitcoin Core, RPC e ZMQ.
- Times que precisam testar fluxos em `regtest` antes de usar redes publicas.
- Pessoas que querem visualizar o comportamento de nodes sem depender apenas de terminal.
- Ambientes de ensino, workshops e provas de conceito.

## Componentes Principais

| Camada | Componente | Papel |
| --- | --- | --- |
| Interface | `templates/index.html` + `templates/components/` | Shell HTML do painel e componentes de header, sidebars, metricas, viewer, terminal, login e icones. |
| Estilo | `static/css/panel.css` + `static/css/panel/` | Agregador e arquivos segmentados para layout IDE, tema, responsividade, terminal, docs, timeline e estados visuais. |
| Estado | `static/js/panel/state.js` | Constantes, temas, topicos de docs, ajuda local, redes suportadas e estado mutavel da sessao. |
| UI | `static/js/panel/ui.js` | Navegacao, troca de rede, viewer JSON/docs, timeline, toasts, temas, fontes e preferencias visuais. |
| Terminal | `static/js/panel/terminal.js` | Instancias xterm.js, prompt, resize, historico, autocomplete, saida formatada e filtro de `help`. |
| API frontend | `static/js/panel/api.js` | Login, WebSocket, eventos ZMQ, comandos RPC, chamadas `/api/*`, polling do dashboard, faucet Signet, wallet regtest e macros. |
| Bootstrap | `static/js/panel/main.js` | Listeners do DOM, resize handles, exposicao de handlers globais e inicializacao do painel. |
| HTTP | `core/views.py` | Entrega a pagina inicial, healthcheck, autenticacao, `/terminal/`, APIs agregadas do dashboard e endpoints da faucet Signet. |
| RPC | `core/rpc.py` | Faz parsing de comandos, aplica politicas por rede, timeout/cache, `inspect_tx` e chamadas internas controladas com `bypass_policy`. |
| WebSocket | `core/consumers.py` | Entrega eventos Bitcoin em tempo real para o navegador. |
| ASGI | `core/asgi.py` | Roteia HTTP e WebSocket. |
| Configuracao | `core/settings.py` | Django, Channels, Redis, autenticacao e seguranca. |
| Eventos | `core/zmq_listener.py` | Escuta ZMQ dos nodes, publica eventos no channel layer e grava janelas recentes em Redis. |
| Broker | `redis` | Channel layer usado pelo Django Channels e memoria curta de eventos ZMQ. |
| Bitcoin | `btc-mainnet`, `btc-signet`, `btc-regtest` | Nodes Bitcoin Core com RPC e ZMQ habilitados. |

## Arquitetura em Alto Nivel

```text
Navegador
  |-- HTTP GET / + /static/*
  |-- HTTP POST /terminal/
  |-- HTTP GET /api/*
  |-- HTTP POST /api/faucet/dispense/
  |-- WebSocket /ws/btc/
  v
Django ASGI web-app
  |-- core.views: paginas, autenticacao e API HTTP
  |-- core.views: APIs agregadas de sync, mempool e eventos
  |-- core.rpc: cliente JSON-RPC, politicas, timeout e cache
  |-- core.consumers: WebSocket
  v
Redis / Channels
  ^
  |
core.zmq_listener
  ^
  |-- ZMQ topicos configurados por rede
  |-- Redis listas zmq:<rede>:blocks/txs
  |
Bitcoin Core mainnet / signet / regtest
```

## Diferenciais do Projeto

- **Multi-rede na mesma tela:** o operador alterna entre `MAINNET`, `SIGNET` e `REGTEST` sem trocar de ferramenta.
- **Terminal web por rede:** cada rede tem seu proprio terminal, historico, prompt e respostas estruturadas em `rpc.response`.
- **Interface estilo IDE:** Explorer, Activity Bar, abas, editor `rpc.response`, viewer de docs, terminal e statusbar em uma mesma tela.
- **Acoes rapidas agrupadas:** botoes para Info, Peers, Mempool, Taxas (6 blk), Endereco, Saldo, Forjar 100, Forjar 1, Ajuda e limpeza do terminal.
- **Faucet Signet integrada:** botao **Pingar Faucet** solicita `0.01 sBTC` da wallet interna `corecraft_faucet` e mostra saldo disponivel no badge do botao.
- **Help real do Bitcoin Core:** `help` exibe o retorno completo do node, `help <categoria>` filtra secoes reais e `help <comando>` busca ajuda especifica.
- **Dashboard operacional protegido:** mostra Node Sync & Divergence, Mempool Intelligence e Event Activity com polling controlado, trava de concorrencia e backoff.
- **APIs agregadas para metricas:** `/api/blockchain/lag/`, `/api/mempool/summary/`, `/api/events/summary/`, `/api/events/latest/` e `/api/events/state-comparison/` reduzem logica pesada no navegador.
- **Mempool Intelligence:** mostra volume, fee media e classificacao Low/Medium/High; a toolbar tambem oferece `estimatesmartfee 6`.
- **Docs integrados:** menu lateral e aba central para abrir guias de arquitetura, comandos, fluxos e operacao.
- **Timeline em tempo real:** exibe blocos e transacoes recebidos via ZMQ/WebSocket, com valores BTC aproximados e tamanhos quando a desserializacao permite.
- **Politicas por rede:** mainnet usa allowlist somente leitura; signet adiciona metodos de wallet para a faucet controlada; regtest permite mais liberdade, com blocklist para comandos perigosos.
- **Autenticacao simples:** o token `APP_AUTH_TOKEN` libera uma sessao via cookie `HttpOnly` quando `REQUIRE_AUTH=True`.
- **Preferencias persistentes:** tema, fonte, statusbar, modo compacto, terminal fixo e exibicao da mainnet ficam em `localStorage`.
- **Frontend modular:** o painel usa cinco ES modules (`main`, `state`, `ui`, `terminal`, `api`), vendors locais do xterm.js e componentes Django menores, reduzindo o risco de mudancas acidentais em arquivos monoliticos.
- **Qualidade no build:** o Dockerfile roda ESLint no JavaScript do painel e Ruff no codigo Python antes de entregar a imagem final.
- **Configuracao segura:** segredos reais ficam em `.env` e `bitcoin.conf`, ambos ignorados pelo Git.
- **Codigo documentado:** os principais exports JavaScript e funcoes Python receberam docstrings/JSDoc para facilitar manutencao.

## Narrativa de Apresentacao

Uma boa apresentacao pode seguir esta ordem:

1. **Contexto:** operar Bitcoin Core em multiplas redes costuma exigir comandos separados, portas, credenciais e logs.
2. **Solucao:** o coreCraft centraliza a operacao em uma interface unica, sem remover o poder do RPC.
3. **Arquitetura:** Django recebe comandos, Bitcoin Core executa RPC, ZMQ envia eventos, Redis distribui mensagens e WebSocket atualiza a tela.
4. **Interface:** o painel adota visual de IDE para organizar redes, documentacao, terminal, respostas RPC, metricas e timeline sem depender de varias janelas.
5. **Inteligencia operacional:** o dashboard compara headers/blocos, RPC/ZMQ, mempool e taxa de eventos em uma unica leitura.
6. **Seguranca:** redes publicas recebem restricoes; regtest e o ambiente de laboratorio para comandos de escrita.
7. **Demonstracao:** abrir docs, consultar help real, usar `inspect_tx`, criar/carregar wallet regtest, forjar 1/100 blocos, pingar a faucet Signet, observar saldo, dashboard e timeline.
8. **Proximos passos:** evoluir autenticacao por usuario, auditoria de comandos, testes automatizados e observabilidade.

## Roteiro de Demo em 5 Minutos

1. Abrir `http://localhost:8005`.
2. Informar o token configurado em `APP_AUTH_TOKEN`.
3. Mostrar o seletor de redes e explicar a diferenca entre `mainnet`, `signet` e `regtest`.
4. Em `REGTEST`, demonstrar a wallet padrao usada pela interface:

   ```text
   listwallets
   loadwallet corecraft
   getnewaddress
   getbalance
   ```

5. Usar **Endereco**, **Forjar 1** e **Forjar 100** para mostrar a macro que carrega/cria a wallet `corecraft`, gera endereco e executa `generatetoaddress`.
6. Usar **Taxas (6 blk)** para mostrar uma estimativa operacional de fees.
7. Executar `help` e `help blockchain` para mostrar que a ajuda vem do Bitcoin Core e pode ser filtrada por categoria.
8. Usar o botao **Info** para consultar `getblockchaininfo` e observar o card `rpc.response`.
9. Mostrar o dashboard atualizando blocos, lag, divergencia, mempool e atividade ZMQ.
10. Mostrar a timeline recebendo o evento de bloco via ZMQ/WebSocket.
11. Abrir a aba `docs` pela Activity Bar ou pelo Explorer e mostrar os cards de Arquitetura, Comandos, Fluxos e Operacao.
12. Abrir Ajustes e demonstrar preset, fonte, cores, rodape, modo compacto, terminal fixo e ocultar/mostrar mainnet.
13. Alternar para `SIGNET`, mostrar o botao **Pingar Faucet** e explicar que ele usa a wallet interna `corecraft_faucet` com envio fixo de `0.01 sBTC`.
14. Alternar para `MAINNET` e executar um comando somente leitura, como:

   ```text
   getblockchaininfo
   getmempoolinfo
   ```

15. Explicar que comandos fora da allowlist sao bloqueados em redes publicas.

## Funcoes Visiveis Para o Usuario

| Funcao | Onde aparece | O que faz |
| --- | --- | --- |
| Abas `mainnet/signet/regtest` | Topo do workspace | Selecionam terminal, metricas e timeline da rede ativa. |
| `docs` | Explorer/Activity bar/abas | Abre o viewer de documentacao no painel central. |
| Activity bar | Lateral esquerda | Alterna Explorer, Docs, Busca, Fluxos, Execucao e Ajustes. |
| Indicador de conexao | Cabecalho | Mostra estados como conectando, online, reconectando ou erro. |
| `Node Sync & Divergence` | Dashboard | Mostra blocos, lag e divergencia entre RPC e ultimo bloco ZMQ observado. |
| `Mempool Intelligence` | Dashboard | Mostra total de TXs, fee media em sat/vB e distribuicao Low/Medium/High. |
| `Event Activity (ZMQ)` | Dashboard | Mostra tx/s, txs vistas e blocos vistos pelo listener. |
| `Info` | Toolbar | Executa `getblockchaininfo` na rede ativa. |
| `Peers` | Toolbar | Executa `getpeerinfo` na rede ativa. |
| `Mempool` | Toolbar | Executa `getmempoolinfo` na rede ativa. |
| `Taxas (6 blk)` | Toolbar | Executa `estimatesmartfee 6` na rede ativa. |
| `Endereco` | Toolbar em regtest | Carrega/cria a wallet `corecraft` e executa `getnewaddress`. |
| `Saldo` | Toolbar em regtest | Carrega/cria a wallet `corecraft` e executa `getbalance`. |
| `Pingar Faucet` | Toolbar em signet | Solicita `0.01 sBTC` da wallet interna `corecraft_faucet` e exibe saldo disponivel no badge. |
| `Help` | Terminal | Mostra o help completo real do Bitcoin Core; tambem aceita `help <categoria>` e `help <comando>`. |
| `Forjar 100` | Toolbar em regtest | Gera endereco e executa `generatetoaddress 100 <endereco>` para maturar recompensas anteriores. |
| `Forjar 1` | Toolbar em regtest | Gera endereco e executa `generatetoaddress 1 <endereco>`. |
| `inspect_tx` | Terminal | Decodifica txid ou hexadecimal bruto e retorna resumo estruturado. |
| `Limpar` | Toolbar | Limpa o terminal ativo e recria o prompt. |
| Terminal | Workspace | Recebe comandos RPC digitados pelo usuario. |
| `rpc.response` | Editor central | Exibe o ultimo retorno RPC estruturado. |
| Timeline visual | Sidebar | Mostra cards de blocos com status, hash/resumo, tx, peso, taxas e origem. |
| Ajustes | Activity bar | Permite selecionar tema, fonte, cores, rodape, modo compacto, terminal fixo, mainnet visivel e reset das preferencias. |

## Limites Atuais

- A autenticacao e baseada em token compartilhado, nao em usuarios individuais.
- A interface foi pensada para laboratorio local, nao para exposicao publica.
- A faucet Signet depende da wallet local `corecraft_faucet` existir, estar carregavel e ter saldo.
- Os assets do xterm.js sao versionados em `static/*/vendor/`; para atualizar a versao, rode o script de download e valide o build.
- Mainnet pode demorar para sincronizar e consumir recursos mesmo com `prune`.
- A timeline mostra eventos recebidos enquanto a interface esta aberta; nao e um historico persistente.
- O viewer de Docs exibe resumos operacionais no painel; os documentos completos continuam no diretorio `docs/`.
- Nao ha suite automatizada de testes versionada; a validacao atual depende de `manage.py check`, checagens manuais e smoke tests HTTP/RPC.

## Mensagem Curta de Apresentacao

O coreCraft Multi-Node e um command center local para Bitcoin Core com visual de IDE. Ele permite alternar entre mainnet, signet e regtest, executar comandos RPC em terminais web, consultar o help real do Bitcoin Core, acompanhar metricas dos nodes, abrir documentacao integrada e visualizar eventos de blocos e transacoes em tempo real por ZMQ e WebSocket. O objetivo e reduzir atrito operacional e criar uma base segura para estudo, testes e automacao Bitcoin.
