/**
 * Estado compartilhado e constantes do painel.
 *
 * Os demais modulos importam este arquivo para manter um unico contrato de
 * redes, preferencias, limites de UI e referencias mutaveis da sessao.
 */
export const root = document.documentElement;

/** Constantes de configuracao usadas pelo frontend inteiro. */
export const CONSTANTS = {
    REQUIRE_AUTH: document.body.dataset.requireAuth === 'true',
    AUTH_TOKEN_KEY: 'corecraft.authToken',
    REGTEST_WALLET: 'corecraft',
    THEME_KEY: 'corecraft.uiTheme',
    FONT_KEY: 'corecraft.uiFont',
    UI_PREFS_KEY: 'corecraft.uiPrefs',
    DEFAULT_FONT: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    MAX_TERMINAL_OUTPUT_LINES: 260,
    MAX_TIMELINE_ITEMS: 18,
    STATUS_INTERVAL_MS: 15000,
    RPC_BACKOFF_MS: 30000,
    networks: ['mainnet', 'signet', 'regtest'],
    autoCommands: ['getblockchaininfo', 'getmempoolinfo', 'estimatesmartfee', 'getnewaddress', 'getbalance', 'generatetoaddress', 'sendtoaddress', 'getblock', 'getblockhash', 'inspect_tx', 'help', 'clear'],
    panelNames: { explorer: 'Redes', docs: 'Docs', search: 'Busca', flows: 'Fluxos', run: 'Execucao', settings: 'Ajustes' },
    docTopics: {
        arquitetura: { title: 'Arquitetura', description: 'Camada Django/ASGI entrega a interface, o endpoint /terminal/ executa RPC por rede, e o WebSocket recebe eventos ZMQ enriquecidos para atualizar terminal e timeline.' },
        comandos: { title: 'Comandos', description: 'Os comandos rapidos chamam getblockchaininfo, getpeerinfo, getmempoolinfo, estimatesmartfee 6, wallet regtest, faucet Signet e mineracao regtest. Mainnet continua protegida por allowlist somente leitura.' },
        fluxos: { title: 'Fluxos', description: 'Fluxos esperados: escolher rede, consultar estado, carregar wallet regtest, minerar bloco, pingar a faucet Signet e observar eventos no terminal e na timeline.' },
        operacao: { title: 'Operacao', description: 'Checklist operacional: validar token, confirmar credenciais RPC no .env, subir os servicos Docker, observar logs e limpar o terminal quando a sessao ficar extensa.' }
    },
    themePresets: {
        corecraft: { '--ide-bg': '#0d1117', '--ide-top': '#0a0f16', '--ide-panel': '#161b22', '--ide-panel-soft': '#111722', '--ide-border': '#30363d', '--ide-blue': '#58a6ff', '--ide-hover': '#182130', '--ide-tab-bg': '#0f141b', '--ide-terminal-bg': '#05080d', '--ide-status-bg': '#0e639c', '--text-primary': '#d6dee7', '--text-muted': '#7d8590', '--accent-reg': '#39d0d8', '--green': '#3fb950', '--scroll-track': '#0a0f16', '--scroll-thumb': '#30363d', '--scroll-thumb-hover': '#58a6ff' },
        contrast: { '--ide-bg': '#050505', '--ide-top': '#000000', '--ide-panel': '#101010', '--ide-panel-soft': '#161616', '--ide-border': '#6b7280', '--ide-blue': '#60a5fa', '--ide-hover': '#1f2937', '--ide-tab-bg': '#0a0a0a', '--ide-terminal-bg': '#000000', '--ide-status-bg': '#075985', '--text-primary': '#f8fafc', '--text-muted': '#cbd5e1', '--accent-reg': '#22d3ee', '--green': '#4ade80', '--scroll-track': '#000000', '--scroll-thumb': '#64748b', '--scroll-thumb-hover': '#22d3ee' },
        amber: { '--ide-bg': '#11100c', '--ide-top': '#0b0a08', '--ide-panel': '#191711', '--ide-panel-soft': '#211d13', '--ide-border': '#4b3b22', '--ide-blue': '#7dd3fc', '--ide-hover': '#2b2418', '--ide-tab-bg': '#15120c', '--ide-terminal-bg': '#070604', '--ide-status-bg': '#92400e', '--text-primary': '#eee7d2', '--text-muted': '#a99b82', '--accent-reg': '#f59e0b', '--green': '#84cc16', '--scroll-track': '#0b0a08', '--scroll-thumb': '#4b3b22', '--scroll-thumb-hover': '#f59e0b' }
    },
    LOCAL_HELP_SECTIONS: {
        blockchain: ['getblockchaininfo        Mostra cadeia, altura, progresso e modo de sincronizacao', 'getblockcount            Retorna a altura atual do node', 'getbestblockhash         Retorna o hash do melhor bloco', 'getblockhash <height>    Retorna o hash de uma altura especifica', 'getblock <hash>          Mostra detalhes de um bloco'],
        mempool: ['getmempoolinfo           Resume transacoes pendentes, uso de memoria e taxas', 'getrawmempool            Lista transacoes atualmente na mempool', 'estimatesmartfee 6       Estima taxa para confirmacao em cerca de 6 blocos'],
        network: ['getnetworkinfo           Mostra versao, subversao, relay e redes ativas', 'getconnectioncount       Retorna a quantidade de conexoes', 'getpeerinfo              Lista peers conectados'],
        wallet: ['getnewaddress            Gera endereco na wallet regtest', 'getbalance               Consulta saldo da wallet regtest', 'listwallets              Lista wallets carregadas'],
        laboratorio: ['generatetoaddress 1 <address>    Minera bloco em regtest', 'generatetoaddress 100 <address>  Minera lote para maturar recompensas', 'clear                           Limpa o terminal ativo']
    }
};

/** Estado mutavel da sessao do navegador e das instancias xterm. */
export const state = {
    currentNet: 'regtest',
    terminals: {},
    fitAddons: {},
    inputs: { mainnet: "", signet: "", regtest: "" },
    cmdHistory: { mainnet: [], signet: [], regtest: [] },
    historyIdx: { mainnet: -1, signet: -1, regtest: -1 },
    authToken: "",
    authReady: !CONSTANTS.REQUIRE_AUTH,
    socket: null,
    wsReconnectTimer: null,
    statusTimer: null,
    statusInFlight: false,
    appStarted: false,
    activeMainView: 'terminal',
    statusBackoffUntil: { mainnet: 0, signet: 0, regtest: 0 },
    initialBlocksLoaded: { mainnet: false, signet: false, regtest: false },
    fitTimer: null,
    legacyStoredToken: localStorage.getItem('corecraft.authToken') || ""
};
