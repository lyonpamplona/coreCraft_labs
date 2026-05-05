import { state, CONSTANTS } from './state.js';
import { showToast, showLogin, hideLogin, setConnectionStatus, setRpcStatus, renderRpcResponse, updateDashboardValue, blockCardMarkup, switchNet } from './ui.js';
import { writePrompt, scrollTerminalToBottom, buildLocalHelpOutput, formatHelpOutput, extractHelpCategoryOutput, focusTerminal } from './terminal.js';

/** Monta headers JSON; o navegador autenticado usa cookie HttpOnly. */
export function authHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (state.authToken) headers['X-CoreCraft-Token'] = state.authToken;
    return headers;
}

/** Calcula a URL WebSocket equivalente ao protocolo HTTP atual. */
export function websocketUrl() {
    return (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host + '/ws/btc/';
}

/** Agenda reconexao WebSocket sem criar multiplos timers simultaneos. */
export function scheduleSocketReconnect() {
    if (CONSTANTS.REQUIRE_AUTH && !state.authReady) {
        showLogin('Entre novamente para reconectar o WebSocket.');
        return;
    }
    if (state.wsReconnectTimer) return;
    setConnectionStatus('RECONECTANDO', 'var(--accent-main)');
    state.wsReconnectTimer = setTimeout(() => {
        state.wsReconnectTimer = null;
        connectSocket();
    }, 3000);
}

/** Abre o WebSocket de eventos BTC quando a autenticacao esta pronta. */
export function connectSocket() {
    if (CONSTANTS.REQUIRE_AUTH && !state.authReady) {
        showLogin('Informe o token para iniciar o WebSocket.');
        return;
    }
    if (state.socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(state.socket.readyState)) return;
    setConnectionStatus('CONECTANDO', 'var(--accent-main)');
    state.socket = new WebSocket(websocketUrl());
    state.socket.onopen = function() { setConnectionStatus('ONLINE', 'var(--green)'); };
    state.socket.onclose = function(e) {
        if (e.code === 4401) {
            localStorage.removeItem(CONSTANTS.AUTH_TOKEN_KEY);
            state.authToken = "";
            state.authReady = false;
            showLogin('Token recusado pelo WebSocket.');
            return;
        }
        scheduleSocketReconnect();
    };
    state.socket.onerror = function() {
        setConnectionStatus('ERRO', '#ef4444');
        showToast('WebSocket', 'Nao foi possivel manter a conexao em tempo real.', 'error');
        try { state.socket.close(); } catch (err) {}
    };
    state.socket.onmessage = handleSocketMessage;
}

/** Processa mensagens ZMQ recebidas via WebSocket e atualiza terminal/timeline. */
export function handleSocketMessage(e) {
    let d;
    try { d = JSON.parse(e.data); } catch (err) { showToast('WebSocket', 'Evento recebido em formato invalido.', 'error'); return; }
    const ts = new Date().toLocaleTimeString();
    const t = state.terminals[d.network];
    if (!t) return;
    if (d.topic === 'rawblock' || d.topic === 'block_rich') {
        t.writeln(`\r\n\x1b[1;32m[${ts}] ZMQ: BLOCO MINERADO | Seq: ${d.sequence}\x1b[0m`);
        writePrompt(t, d.network);
        t.write(state.inputs[d.network]);
        scrollTerminalToBottom(t);
        if (d.network === state.currentNet) addBlockToFeed(d, ts);
    } else if (d.topic === 'rawtx') {
        const valorAproximado = d.total_out_sats ? ` | Valor: ${(d.total_out_sats / 100000000).toFixed(4)} BTC` : '';
        t.writeln(`\r\n\x1b[38;5;242m[${ts}] ZMQ: TX RECEBIDA  | Size: ${d.size}b${valorAproximado}\x1b[0m`);
        writePrompt(t, d.network);
        t.write(state.inputs[d.network]);
        scrollTerminalToBottom(t);
    }
}

/** Adiciona um card de bloco ao feed lateral e respeita o limite visual. */
export function addBlockToFeed(d, time) {
    const feed = document.getElementById('block-feed');
    const item = document.createElement('div');
    item.className = 'block-card';
    const size = Number(d.size || 0);
    const fees = Number(d.fees || 0);
    const sizeFormatted = size > 1024 ? (size/1024).toFixed(1) + ' KB' : `${size || 0} B`;
    const feesFormatted = fees ? `${(fees / 100000000).toFixed(4)} BTC` : '0 sats';
    item.innerHTML = blockCardMarkup({
        title: `Bloco ${d.height ? `#${d.height}` : `Seq ${d.sequence}`}`,
        status: d.topic === 'block_rich' ? 'enriquecido' : 'novo',
        hash: d.hash || d.block_hash || d.bestblockhash || `seq-${d.sequence || 'unknown'}-${state.currentNet}`,
        tx: d.tx_count || d.txCount || '-',
        size: sizeFormatted,
        fees: feesFormatted,
        source: d.topic || 'rawblock',
        time
    });
    feed.prepend(item);
    while (feed.children.length > CONSTANTS.MAX_TIMELINE_ITEMS) feed.lastElementChild.remove();
}

/** Detecta respostas normalizadas que representam timeout RPC. */
export function isRpcTimeout(payload) {
    const message = payload?.error?.message || payload?.error || '';
    return String(message).toLowerCase().includes('timeout');
}

/** Envia comando para `/terminal/` e envia objetos grandes ao viewer JSON. */
export async function processCommand(net, cmd, silent = false) {
    const t = state.terminals[net];
    const parts = cmd.toLowerCase().split(' ');
    const rpcStatus = document.getElementById('rpc-status-label');
    if (CONSTANTS.REQUIRE_AUTH && !state.authReady) {
        if (!silent) { t.writeln('\x1b[31m[SISTEMA] Acesso bloqueado. Informe o token no login.\x1b[0m\r\n'); writePrompt(t, net); }
        showLogin('Informe o token antes de executar comandos RPC.');
        return { error: { message: 'Token ausente' } };
    }
    try {
        const helpCategory = parts[0] === 'help' && parts[1] ? parts.slice(1).join(' ') : '';
        const commandForBackend = helpCategory ? 'help' : cmd;
        const response = await fetch('/terminal/', { method: 'POST', body: JSON.stringify({ command: commandForBackend, network: net }), headers: authHeaders(), credentials: 'same-origin' });
        if (response.status === 401) {
            localStorage.removeItem(CONSTANTS.AUTH_TOKEN_KEY);
            state.authToken = "";
            state.authReady = false;
            showLogin('Token invalido ou expirado. Informe o token novamente.');
            if (!silent) { t.writeln('\x1b[31m[SISTEMA] Token invalido ou ausente.\x1b[0m\r\n'); writePrompt(t, net); focusTerminal(net); }
            return { error: { message: 'Token invalido ou ausente' } };
        }
        const d = await response.json();
        if (rpcStatus) rpcStatus.innerText = d.error ? 'RPC com erro' : `RPC ${net} online`;
        if (!silent) {
            if (d.error) {
                t.writeln(`\x1b[31m[ERRO] ${d.error.message || JSON.stringify(d.error)}\x1b[0m`);
                if (parts[0] === 'help') {
                    const output = buildLocalHelpOutput(parts.slice(1).join(' '));
                    t.writeln('\x1b[33m[SISTEMA] Exibindo ajuda local de contingencia.\x1b[0m');
                    formatHelpOutput(t, output);
                }
            } else {
                let output = d.result;
                if (helpCategory && typeof output === 'string') {
                    const filtered = extractHelpCategoryOutput(output, helpCategory);
                    let usedLocalHelp = false;
                    if (!filtered) {
                        const commandHelp = await fetch('/terminal/', { method: 'POST', body: JSON.stringify({ command: cmd, network: net }), headers: authHeaders(), credentials: 'same-origin' });
                        const commandHelpData = await commandHelp.json();
                        if (!commandHelpData.error) { output = commandHelpData.result; Object.assign(d, commandHelpData); }
                        else { output = buildLocalHelpOutput(helpCategory); usedLocalHelp = true; }
                    } else { output = filtered; }
                    d.result = output; d.local = usedLocalHelp; d.category = helpCategory;
                    if (rpcStatus) rpcStatus.innerText = `Ajuda ${helpCategory}`;
                }

                if (typeof output === 'string' && output.includes('==')) {
                    formatHelpOutput(t, output);
                } else if (output !== null && typeof output === 'object') {
                    t.writeln(`\x1b[32m[SUCESSO]\x1b[0m Comando executado. Dados enviados para o painel \x1b[36mrpc.response\x1b[0m.`);
                } else {
                    t.writeln(`\x1b[38;5;250m${output}\x1b[0m`);
                }
            }

            t.write('\r\n'); writePrompt(t, net);
            if (parts[0] !== 'help' && parts[0] !== 'clear') { renderRpcResponse(net, cmd, d); }
            focusTerminal(net);
        }
        return d;
    } catch (err) {
        if (rpcStatus) rpcStatus.innerText = 'RPC indisponivel';
        showToast('Conexao', 'Falha ao comunicar com o backend.', 'error');
        if (!silent) { t.writeln('\x1b[31m[SISTEMA] Falha de conexao.\x1b[0m\r\n'); writePrompt(t, net); focusTerminal(net); }
        return { error: err };
    }
}

/** Atualiza o dashboard chamando os endpoints agregados `/api/*`. */
export async function fetchNodeStatus(options = {}) {
    const { force = false } = options;
    const net = state.currentNet;
    const now = Date.now();
    if (!state.authReady || document.hidden || state.activeMainView !== 'terminal') return;
    if (state.statusInFlight && !force) return;
    if (!force && now < (state.statusBackoffUntil[net] || 0)) return;
    state.statusInFlight = true;
    try {
        setRpcStatus(`API ${net} consultando`);
        const headers = authHeaders();
        const [lagRes, mempoolRes, evSummaryRes, evCompRes] = await Promise.all([
            fetch(`/api/blockchain/lag/?network=${net}`, { headers }),
            fetch(`/api/mempool/summary/?network=${net}`, { headers }),
            fetch(`/api/events/summary/?network=${net}`, { headers }),
            fetch(`/api/events/state-comparison/?network=${net}`, { headers })
        ]);

        if (lagRes.ok) {
            const lagData = await lagRes.json();
            if (lagData.error) {
                updateDashboardValue('v-blocks', 'ERR');
                updateDashboardValue('rpc-blocks-label', 'ERR');
                const lagVal = document.getElementById('v-lag');
                if (lagVal) { lagVal.innerText = '-'; lagVal.style.color = 'var(--text-muted)'; }
            } else {
                updateDashboardValue('v-blocks', lagData.blocks ?? 0);
                updateDashboardValue('rpc-blocks-label', lagData.blocks ?? 0);
                const lagVal = document.getElementById('v-lag');
                if (lagVal) {
                    lagVal.innerText = lagData.lag ?? 0;
                    lagVal.style.color = (lagData.lag > 0) ? 'var(--ide-yellow)' : 'var(--green)';
                }
            }
        }

        if (mempoolRes.ok) {
            const mpData = await mempoolRes.json();
            if (mpData.error) {
                updateDashboardValue('v-mempool-tx', 'ERR');
                updateDashboardValue('v-mempool-fee', '-');
                updateDashboardValue('v-mempool-dist', '-/-/-');
            } else {
                updateDashboardValue('v-mempool-tx', mpData.tx_count ?? 0);
                if (mpData.warning) {
                    updateDashboardValue('v-mempool-fee', 'N/A');
                    updateDashboardValue('v-mempool-dist', 'Omitido');
                } else {
                    updateDashboardValue('v-mempool-fee', mpData.avg_fee_rate ?? 0);
                    if (mpData.fee_distribution) {
                        updateDashboardValue('v-mempool-dist', `${mpData.fee_distribution.low}/${mpData.fee_distribution.medium}/${mpData.fee_distribution.high}`);
                    }
                }
            }
        }

        if (evSummaryRes.ok) {
            const evData = await evSummaryRes.json();
            if (evData.error) {
                updateDashboardValue('v-events-txs', 'ERR');
                updateDashboardValue('v-events-obs', 'ERR');
                updateDashboardValue('v-events-blocks', 'ERR');
            } else {
                updateDashboardValue('v-events-txs', evData.tx_per_second ?? 0);
                updateDashboardValue('v-events-obs', evData.tx_observed ?? 0);
                updateDashboardValue('v-events-blocks', evData.blocks_observed ?? 0);
            }
        }

        if (evCompRes.ok) {
            const compData = await evCompRes.json();
            const divVal = document.getElementById('v-divergence');
            if (compData.error) {
                if (divVal) { divVal.innerText = 'ERR'; divVal.style.color = 'var(--text-muted)'; }
            } else {
                if (divVal) {
                    divVal.innerText = compData.divergence ? 'SIM' : 'NAO';
                    divVal.style.color = compData.divergence ? 'var(--ide-red)' : 'var(--green)';
                }
            }
        }

        setRpcStatus(`API ${net} online`);
    } catch (err) {
        setRpcStatus(`API ${net} indisponivel`);
        state.statusBackoffUntil[net] = Date.now() + CONSTANTS.RPC_BACKOFF_MS;
    } finally {
        state.statusInFlight = false;
    }
}

/** Carrega os blocos recentes persistidos pelo listener ZMQ no Redis. */
export async function loadInitialBlocks(net = state.currentNet) {
    if (net !== 'regtest' || state.initialBlocksLoaded[net]) return;
    state.initialBlocksLoaded[net] = true;
    try {
        const headers = authHeaders();
        const res = await fetch(`/api/events/latest/?network=${net}`, { headers });
        if (res.ok) {
            const data = await res.json();
            if (data.blocks && data.blocks.length > 0) {
                const latest = data.blocks[0];
                addBlockToFeed({ topic: 'block_rich', hash: latest.hash }, new Date(latest.ts * 1000).toLocaleTimeString());
            }
        }
    } catch (err) {}
}

/** Garante que a wallet regtest exista e esteja carregada antes de macros. */
export async function ensureRegtestWallet() {
    const loaded = await processCommand('regtest', 'listwallets', true);
    if (loaded && Array.isArray(loaded.result) && loaded.result.includes(CONSTANTS.REGTEST_WALLET)) return true;
    const load = await processCommand('regtest', `loadwallet ${CONSTANTS.REGTEST_WALLET}`, true);
    if (load && load.result) { showToast('Wallet carregada', `Carteira ${CONSTANTS.REGTEST_WALLET} pronta para uso.`, 'success'); return true; }
    const created = await processCommand('regtest', `createwallet ${CONSTANTS.REGTEST_WALLET}`, true);
    if (created && created.result) { showToast('Wallet criada', `Carteira ${CONSTANTS.REGTEST_WALLET} criada no regtest.`, 'success'); return true; }
    const retryLoad = await processCommand('regtest', `loadwallet ${CONSTANTS.REGTEST_WALLET}`, true);
    if (retryLoad && retryLoad.result) return true;
    showToast('Wallet indisponivel', 'Nao foi possivel carregar ou criar a carteira regtest.', 'error');
    return false;
}

/** Executa um comando rapido no terminal ativo com protecoes por rede e macros regtest. */
export async function executeMacro(cmd) {
    if (state.currentNet !== 'regtest' && ['getnewaddress', 'getbalance', 'generatetoaddress'].some(w => cmd.includes(w))) {
        showToast('Comando bloqueado', 'Operacoes de wallet/mineracao ficam restritas ao regtest.', 'warn');
        return;
    }
    state.terminals[state.currentNet].write(cmd + '\r\n');
    state.cmdHistory[state.currentNet].unshift(cmd);

    // Macro inteligente de 100 blocos para maturar recompensas anteriores.
    if (cmd === 'generatetoaddress 100 [auto]') {
        const t = state.terminals['regtest'];
        t.writeln('\x1b[36m[SISTEMA] Maturando recompensas... Gerando endereco...\x1b[0m');
        const walletReady = await ensureRegtestWallet();
        if (walletReady) {
            const addrData = await processCommand('regtest', 'getnewaddress', true);
            if (addrData && addrData.result) {
                t.writeln(`\x1b[36m[SISTEMA] Forjando 100 blocos para ${addrData.result}...\x1b[0m`);
                await processCommand('regtest', `generatetoaddress 100 ${addrData.result}`, true);
                t.write('\r\n'); writePrompt(t, 'regtest');
            }
        }
        return;
    }

    if (state.currentNet === 'regtest' && ['getnewaddress', 'getbalance'].includes(cmd)) {
        const ready = await ensureRegtestWallet();
        if (!ready) {
            state.terminals[state.currentNet].writeln('\x1b[31m[ERRO] Wallet regtest indisponivel.\x1b[0m\r\n');
            writePrompt(state.terminals[state.currentNet], state.currentNet);
            return;
        }
    }
    processCommand(state.currentNet, cmd);
}

/** Minera um bloco em regtest criando ou carregando a wallet padrao antes da chamada RPC. */
export async function mineBlockMacro() {
    if (state.currentNet !== 'regtest') {
        showToast('Comando bloqueado', 'Operacoes de mineracao ficam restritas ao regtest.', 'warn');
        return;
    }
    const t = state.terminals['regtest'];
    t.write('generatetoaddress 1 [auto]\r\n');
    state.cmdHistory.regtest.unshift('generatetoaddress 1 [auto]');
    t.writeln('\x1b[36m[SISTEMA] Preparando wallet regtest...\x1b[0m');
    const walletReady = await ensureRegtestWallet();
    if (!walletReady) { t.writeln('\x1b[31m[ERRO] Wallet regtest indisponivel.\x1b[0m\r\n'); writePrompt(t, 'regtest'); return; }
    t.writeln('\x1b[36m[SISTEMA] Gerando endereco de recompensa...\x1b[0m');
    const addrData = await processCommand('regtest', 'getnewaddress', true);
    if (addrData && addrData.result) {
        t.writeln('\x1b[36m[SISTEMA] Forjando bloco na rede...\x1b[0m');
        await processCommand('regtest', `generatetoaddress 1 ${addrData.result}`, true);
        t.write('\r\n'); writePrompt(t, 'regtest');
    } else {
        t.writeln('\x1b[31m[ERRO] Nao foi possivel gerar endereco na wallet regtest.\x1b[0m\r\n');
        writePrompt(t, 'regtest');
    }
}

/** Valida token inicial ou cookie HttpOnly em `/auth/verify/`. */
export async function verifyToken(token = "") {
    if (!CONSTANTS.REQUIRE_AUTH) return true;
    const headers = authHeaders();
    if (token) headers['X-CoreCraft-Token'] = token;
    const response = await fetch('/auth/verify/', { method: 'POST', headers, credentials: 'same-origin' });
    return response.ok;
}

/** Trata o submit do overlay de login e inicia a aplicacao autenticada. */
export async function submitLogin(e) {
    e.preventDefault();
    const input = document.getElementById('login-token');
    const button = document.getElementById('login-submit');
    const token = (input ? input.value : "").trim();
    if (!token) { showToast('Token vazio', 'Cole o valor de APP_AUTH_TOKEN para continuar.', 'warn'); return; }
    if (button) button.disabled = true;
    try {
        const ok = CONSTANTS.REQUIRE_AUTH ? await verifyToken(token) : true;
        if (!ok) { showToast('Token invalido', 'O backend recusou o token informado.', 'error'); return; }
        state.authToken = "";
        state.authReady = true;
        localStorage.removeItem(CONSTANTS.AUTH_TOKEN_KEY);
        hideLogin();
        showToast('Acesso liberado', 'Painel autenticado com sucesso.', 'success');
        startApp();
    } catch (err) { showToast('Login indisponivel', 'Nao foi possivel validar o token agora.', 'error'); }
    finally { if (button) button.disabled = false; }
}

/** Inicializa ou reativa WebSocket, rede padrao e polling do dashboard. */
export function startApp() {
    if (state.appStarted) {
        connectSocket();
        fetchNodeStatus({ force: true });
        if (!state.statusTimer) state.statusTimer = setInterval(fetchNodeStatus, CONSTANTS.STATUS_INTERVAL_MS);
        return;
    }
    state.appStarted = true;
    connectSocket();
    switchNet('regtest');
    if (!state.statusTimer) state.statusTimer = setInterval(fetchNodeStatus, CONSTANTS.STATUS_INTERVAL_MS);
}
