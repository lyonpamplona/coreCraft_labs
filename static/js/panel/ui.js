import { state, CONSTANTS, root } from './state.js';
import { scheduleTerminalFit, focusTerminal } from './terminal.js';
import { fetchNodeStatus, loadInitialBlocks } from './api.js';

/**
 * Renderizacao e preferencias da interface.
 *
 * O modulo concentra navegacao entre paineis, docs resumidos, JSON viewer,
 * timeline, temas, fonte, toasts e alternancia visual entre redes.
 */

const DOC_DATA = {
    arquitetura: {
        title: 'Arquitetura do Sistema',
        content: `
            <h4>Visão dos Serviços</h4>
            <p>O coreCraft opera com uma arquitetura distribuída e assíncrona:</p>
            <ul>
                <li><strong>Django (Backend):</strong> Motor central que gerencia rotas, autenticação e despacha comandos RPC.</li>
                <li><strong>Daphne & WebSockets:</strong> Mantém conexão persistente com o navegador para streaming em tempo real.</li>
                <li><strong>ZMQ Listener (Redis):</strong> Processo isolado que escuta as portas ZMQ do Bitcoin Core e publica eventos na RAM, eliminando gargalos de I/O.</li>
                <li><strong>Bitcoin Core (Multi-Node):</strong> Três instâncias rodando nativamente (Mainnet Pruned, Signet e Regtest).</li>
            </ul>`
    },
    comandos: {
        title: 'Catálogo de Comandos',
        content: `
            <h4>Macros RPC e Segurança</h4>
            <p>Comandos são filtrados por um gateway de segurança baseado na rede ativa:</p>
            <ul>
                <li><strong>Mainnet:</strong> <code>getblockchaininfo</code>, <code>getmempoolinfo</code>, <code>getpeerinfo</code>. Comandos de wallet são rigidamente bloqueados.</li>
                <li><strong>Signet:</strong> Permite chamadas de hot wallet para dispensar fundos automatizados via <code>sendtoaddress</code>.</li>
                <li><strong>Regtest:</strong> Libera geração de blocos programada (<code>generatetoaddress</code>) e manipulação total.</li>
            </ul>`
    },
    fluxos: {
        title: 'Fluxos de Trabalho',
        content: `
            <h4>Passo a Passo Esperado</h4>
            <ul>
                <li><strong>Sincronização:</strong> Alternar para Mainnet e consultar o estado (Lag e Porcentagem de IBD).</li>
                <li><strong>Regtest Wallet:</strong> Carregar a carteira, gerar endereço de recompensa e minerar blocos.</li>
                <li><strong>Faucet Signet:</strong> Pingar a Faucet Signet, solicitar sBTC e observar os eventos chegarem no terminal e na Timeline ZMQ.</li>
            </ul>`
    },
    operacao: {
        title: 'Operação e Troubleshooting',
        content: `
            <h4>Checklist de Manutenção</h4>
            <ul>
                <li><strong>Auth Token:</strong> Verifique a variável <code>APP_AUTH_TOKEN</code> no arquivo <code>.env</code>.</li>
                <li><strong>Docker:</strong> Utilize <code>docker compose logs -f web-app</code> para auditar requisições e a saúde do container.</li>
                <li><strong>BitcoinD:</strong> Erros de corrupção no <em>chainstate</em> (comum em hard resets) resolvem-se recriando o volume do container.</li>
                <li><strong>Logs ZMQ:</strong> Eventos não chegam? Cheque a integridade do Redis e os bindings <code>zmqpubrawblock</code>.</li>
            </ul>`
    }
};

/** Cria o modal de documentacao resumida sob demanda. */
function initDocModal() {
    if (document.getElementById('ide-doc-modal')) return;
    const style = document.createElement('style');
    style.innerHTML = `
        .ide-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(5px); display: flex; align-items: center; justify-content: center; z-index: 9999; opacity: 0; pointer-events: none; transition: all 0.25s ease; }
        .ide-modal-overlay.active { opacity: 1; pointer-events: auto; }
        .ide-modal { background: var(--ide-bg); border: 1px solid var(--ide-border); border-radius: 12px; width: 90%; max-width: 600px; box-shadow: 0 24px 48px rgba(0,0,0,0.6); transform: translateY(20px); transition: transform 0.25s ease; display: flex; flex-direction: column; max-height: 85vh; }
        .ide-modal-overlay.active .ide-modal { transform: translateY(0); }
        .ide-modal-header { padding: 1.2rem 1.5rem; border-bottom: 1px solid var(--ide-border); display: flex; justify-content: space-between; align-items: center; background: var(--ide-panel); border-radius: 12px 12px 0 0; }
        .ide-modal-header h3 { margin: 0; color: var(--text-primary); font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem; }
        .ide-modal-header .btn-close { background: none; border: none; color: var(--text-muted); font-size: 1.8rem; cursor: pointer; padding: 0; line-height: 1; transition: color 0.2s; }
        .ide-modal-header .btn-close:hover { color: var(--ide-red); }
        .ide-modal-body { padding: 1.5rem; overflow-y: auto; color: var(--text-muted); font-size: 0.95rem; line-height: 1.6; }
        .ide-modal-body h4 { color: var(--accent-main); margin-top: 0; margin-bottom: 0.8rem; font-size: 1rem; text-transform: uppercase; letter-spacing: 0.5px; }
        .ide-modal-body ul { padding-left: 1.2rem; margin-bottom: 1rem; }
        .ide-modal-body li { margin-bottom: 0.5rem; }
        .ide-modal-body code { background: var(--ide-panel); padding: 0.2rem 0.4rem; border-radius: 4px; color: var(--text-primary); border: 1px solid var(--ide-border); }
        .ide-modal-body strong { color: var(--text-primary); }
    `;
    document.head.appendChild(style);

    const modal = document.createElement('div');
    modal.id = 'ide-doc-modal';
    modal.className = 'ide-modal-overlay';
    modal.innerHTML = `
        <div class="ide-modal">
            <div class="ide-modal-header">
                <h3 id="doc-modal-title"></h3>
                <button class="btn-close" onclick="document.getElementById('ide-doc-modal').classList.remove('active')">&times;</button>
            </div>
            <div class="ide-modal-body" id="doc-modal-body"></div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });
}

/** Abre um topico resumido de docs dentro do painel principal. */
export function showDocTopic(topic = 'arquitetura') {
    initDocModal();
    const data = DOC_DATA[topic] || DOC_DATA['arquitetura'];
    const titleEl = document.getElementById('doc-modal-title');
    const bodyEl = document.getElementById('doc-modal-body');
    if (titleEl) titleEl.innerHTML = `<svg class="icon" style="width:18px;height:18px;"><use href="#ico-info"></use></svg>${data.title}`;
    if (bodyEl) bodyEl.innerHTML = data.content;
    document.getElementById('ide-doc-modal').classList.add('active');
}

/** Aplica realce simples de sintaxe a uma linha JSON ja escapada. */
export function highlightJsonLine(line) {
    const escaped = escapeHtml(line);
    return escaped.replace(/(&quot;.*?&quot;)(\s*:)?|\b(true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, function(match, p1, p2, p3) {
        if (p2) return `<span class="prop">${p1}</span>${p2}`;
        if (p1) return `<span class="str">${p1}</span>`;
        if (p3) return `<span class="kw">${match}</span>`;
        return `<span class="num">${match}</span>`;
    });
}

/** Renderiza o ultimo payload RPC no painel `rpc.response`. */
export function renderRpcResponse(net, cmd, data) {
    const target = document.getElementById('rpc-response-lines');
    if (!target) return;
    const payload = data && data.error ? { network: net, command: cmd, error: data.error.message || data.error } : { network: net, command: cmd, result: data ? data.result : null };
    const allLines = JSON.stringify(payload, null, 2).split('\n');
    const MAX_LINES = 3000;
    const lines = allLines.slice(0, MAX_LINES);
    let html = lines.map((line, index) => (`<div class="line"><span class="ln">${index + 1}</span><span>${highlightJsonLine(line)}</span></div>`)).join('');
    if (allLines.length > MAX_LINES) html += `<div class="line"><span class="ln">${MAX_LINES + 1}</span><span class="warn">... [Saida truncada: excedeu ${MAX_LINES} linhas] ...</span></div>`;
    target.innerHTML = html;
}

/** Monta o HTML seguro de um card de bloco/transacao da timeline. */
export function blockCardMarkup({ title, status, hash, tx, size, fees, source, time, icon = 'ico-block' }) {
    const safe = { title: escapeHtml(title), status: escapeHtml(status), hash: escapeHtml(hash), tx: escapeHtml(tx), size: escapeHtml(size), fees: escapeHtml(fees), source: escapeHtml(source), time: escapeHtml(time), icon: String(icon).replace(/[^a-z0-9_-]/gi, '') || 'ico-block' };
    return `<div class="block-visual"><div class="block-head"><div class="block-height"><svg class="icon"><use href="#${safe.icon}"></use></svg><span>${safe.title}</span></div><span class="block-pill">${safe.status}</span></div><div class="block-hash"><label>hash</label><code>${safe.hash}</code></div><div class="block-stats"><div class="block-stat"><label>tx</label><strong>${safe.tx}</strong></div><div class="block-stat"><label>peso</label><strong>${safe.size}</strong></div><div class="block-stat"><label>taxas</label><strong>${safe.fees}</strong></div></div><div class="block-route"><span>${safe.source}</span><strong>${safe.time}</strong></div></div>`;
}

/** Escapa texto antes de interpolar em HTML produzido pelo frontend. */
export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

/** Troca a rede ativa e sincroniza terminal, dashboard, toolbar e timeline. */
export function switchNet(net) {
    state.currentNet = net;
    selectMainView('terminal', net);
    document.querySelectorAll('.net-btn').forEach(b => b.classList.toggle('active', b.dataset.network === net));
    document.querySelectorAll('.ide-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.network === net));

    const color = net === 'mainnet' ? 'var(--accent-main)' : net === 'signet' ? 'var(--accent-sig)' : 'var(--accent-reg)';
    document.querySelectorAll('.metric-card').forEach(c => c.style.borderLeftColor = color);

    const walletGroup = document.getElementById('terminal-wallet-group');
    const walletSep = document.getElementById('wallet-separator');
    const btnAddress = document.getElementById('btn-wallet-address');
    const btnBalance = document.getElementById('btn-wallet-balance');
    const btnFaucet = document.getElementById('btn-faucet');
    const btnForge100 = document.getElementById('btn-forge-100');
    const btnForge1 = document.getElementById('btn-forge-1');

    if (walletGroup) walletGroup.style.display = (net === 'regtest' || net === 'signet') ? 'flex' : 'none';
    if (walletSep) walletSep.style.display = (net === 'regtest' || net === 'signet') ? 'block' : 'none';

    if (btnAddress) btnAddress.style.display = (net === 'regtest' || net === 'signet') ? 'flex' : 'none';
    if (btnBalance) btnBalance.style.display = (net === 'regtest' || net === 'signet') ? 'flex' : 'none';
    if (btnForge100) btnForge100.style.display = net === 'regtest' ? 'flex' : 'none';
    if (btnForge1) btnForge1.style.display = net === 'regtest' ? 'flex' : 'none';
    if (btnFaucet) btnFaucet.style.display = net === 'signet' ? 'flex' : 'none';

    updateCommandAvailability(net);

    const upperNet = net.toUpperCase();
    const activeLabel = document.getElementById('active-network-name');
    const statusLabel = document.getElementById('status-network-name');
    const runLabel = document.getElementById('run-active-network');
    const rpcChainLabel = document.getElementById('rpc-chain-label');
    if (activeLabel) activeLabel.innerText = upperNet;
    if (statusLabel) statusLabel.innerText = upperNet;
    if (runLabel) runLabel.innerText = `${net} ativo`;
    if (rpcChainLabel) rpcChainLabel.innerText = `"${net}"`;

    document.querySelectorAll('.term-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`term-${net}`).classList.add('active');
    focusTerminal(net);
    document.getElementById('block-feed').innerHTML = '';
    fetchNodeStatus({ force: true });
    loadInitialBlocks(net);
}

/** Habilita ou bloqueia opcoes do seletor de macros conforme a rede ativa. */
export function updateCommandAvailability(net) {
    const miningOnlyCommands = new Set(['generatetoaddress 100 [auto]', 'mine-block']);
    const walletCommands = new Set(['getnewaddress', 'getbalance']);
    const macroSelect = document.getElementById('macro-select');
    if (!macroSelect) return;

    [...macroSelect.options].forEach(option => {
        if (miningOnlyCommands.has(option.value)) {
            option.disabled = net !== 'regtest';
        } else if (walletCommands.has(option.value)) {
            option.disabled = net === 'mainnet';
        } else {
            option.disabled = false;
        }
    });
    if (macroSelect.selectedOptions[0] && macroSelect.selectedOptions[0].disabled) macroSelect.value = 'getblockchaininfo';
}

/** Atualiza um valor do dashboard com animacao curta de destaque. */
export function updateDashboardValue(elementId, newValue) {
    const el = document.getElementById(elementId);
    if (el && el.innerText !== String(newValue)) {
        el.innerText = newValue;
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 300);
    }
}

/** Alterna o editor JSON entre layout padrao e modo de auditoria em tela cheia. */
export function toggleJsonView() {
    const mainArea = document.getElementById('ide-main-container');
    if (!mainArea) return;
    if (mainArea.classList.contains('fullscreen-editor')) {
        mainArea.classList.remove('fullscreen-editor');
        showToast('Visualização', 'Modo padrão restaurado', 'success', 2000);
    } else {
        mainArea.classList.add('fullscreen-editor');
        showToast('Visualização', 'Tela cheia ativada para auditoria', 'success', 2000);
    }
}

/** Exibe uma mensagem temporaria no canto da interface. */
export function showToast(title, message, type = 'warn', timeout = 4200) {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<div class="toast-title">${title}</div><div class="toast-message">${message}</div>`;
    stack.prepend(toast);
    setTimeout(() => toast.remove(), timeout);
}

/** Mostra o overlay de login e pausa conexoes dependentes de autenticacao. */
export function showLogin(message) {
    if (message) showToast('Acesso necessário', message, 'warn');
    state.authReady = !CONSTANTS.REQUIRE_AUTH;
    state.authToken = "";
    if (state.statusTimer) { clearInterval(state.statusTimer); state.statusTimer = null; }
    if (state.socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(state.socket.readyState)) state.socket.close();
    const overlay = document.getElementById('login-overlay');
    const input = document.getElementById('login-token');
    if (overlay) overlay.classList.remove('hidden');
    if (input) { input.value = ""; setTimeout(() => input.focus(), 50); }
    setConnectionStatus('BLOQUEADO', '#ef4444');
}

/** Oculta o overlay de login apos autenticacao bem-sucedida. */
export function hideLogin() {
    const overlay = document.getElementById('login-overlay');
    if (overlay) overlay.classList.add('hidden');
}

/** Atualiza rotulos visuais de estado do WebSocket. */
export function setConnectionStatus(label, color) {
    const el = document.getElementById('conn-status');
    const wsLabel = document.getElementById('ws-status-label');
    if (el) { el.innerText = label; el.style.color = color; }
    if (wsLabel) wsLabel.innerText = `WebSocket ${label.toLowerCase()}`;
}

/** Atualiza o rotulo de estado das APIs/RPC na statusbar. */
export function setRpcStatus(text) {
    const rpcStatus = document.getElementById('rpc-status-label');
    if (rpcStatus) rpcStatus.innerText = text;
}

/** Alterna a area central entre terminal e viewer de documentacao. */
export function selectMainView(view, tabName = state.currentNet) {
    state.activeMainView = view;
    document.querySelectorAll('[data-editor-view]').forEach(panel => panel.classList.toggle('active', panel.dataset.editorView === view));
    document.querySelectorAll('.ide-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === tabName));
    document.querySelectorAll('[data-open-tab]').forEach(item => item.classList.toggle('active', item.dataset.openTab === tabName));
    const command = document.querySelector('.ide-command span');
    if (command) command.textContent = view === 'docs' ? 'docs viewer' : `${tabName} getblockchaininfo`;
    const title = document.getElementById('editor-title');
    const status = document.getElementById('editor-status');
    if (title) title.textContent = view === 'docs' ? 'docs.viewer' : 'rpc.response';
    if (status) status.textContent = view === 'docs' ? 'preview' : (tabName === 'mainnet' ? 'sync' : 'online');
    document.body.classList.toggle('docs-active', view === 'docs');
    if (view === 'terminal' && state.terminals[tabName]) focusTerminal(tabName);
    else scheduleTerminalFit();
}

/** Alterna o painel lateral ativo na Activity Bar. */
export function selectSidePanel(view) {
    document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    document.querySelectorAll('[data-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === view));
    const sideTitle = document.getElementById('side-title');
    if (sideTitle) sideTitle.textContent = CONSTANTS.panelNames[view] || 'Painel';
    if (view === 'docs') selectMainView('docs', 'docs');
    if (window.matchMedia('(max-width: 860px)').matches) document.querySelector('.ide-workspace').classList.add('mobile-sidebar-open');
}

/** Alterna a secao ativa dentro de Ajustes. */
export function selectSettingsSection(section) {
    document.querySelectorAll('[data-settings-section]').forEach(group => group.classList.toggle('active', group.dataset.settingsSection === section));
    document.querySelectorAll('[data-settings-target]').forEach(button => button.classList.toggle('active', button.dataset.settingsTarget === section));
}

/** Aplica variaveis CSS de tema e sincroniza inputs/presets. */
export function applyTheme(values, presetName = '') {
    Object.entries(values).forEach(([property, value]) => root.style.setProperty(property, value));
    document.querySelectorAll('[data-theme-var]').forEach(input => {
        const value = values[input.dataset.themeVar] || getComputedStyle(root).getPropertyValue(input.dataset.themeVar).trim();
        if (value) input.value = value;
    });
    document.querySelectorAll('[data-theme-preset]').forEach(button => button.classList.toggle('active', button.dataset.themePreset === presetName));
}

/** Persiste o tema customizado montado pelos controles de cor. */
export function saveCustomTheme() {
    const values = {};
    document.querySelectorAll('[data-theme-var]').forEach(input => { values[input.dataset.themeVar] = input.value; });
    localStorage.setItem(CONSTANTS.THEME_KEY, JSON.stringify({ preset: 'custom', values }));
}

/** Restaura o tema salvo ou aplica o preset padrao. */
export function loadTheme() {
    const saved = localStorage.getItem(CONSTANTS.THEME_KEY);
    if (!saved) return applyTheme(CONSTANTS.themePresets.corecraft, 'corecraft');
    try {
        const data = JSON.parse(saved);
        if (data.preset && CONSTANTS.themePresets[data.preset]) return applyTheme(CONSTANTS.themePresets[data.preset], data.preset);
        if (data.values) return applyTheme(data.values, '');
    } catch (err) {
        /* Preferencia corrompida volta ao tema padrao. */
    }
    applyTheme(CONSTANTS.themePresets.corecraft, 'corecraft');
}

/** Aplica uma fonte mono ao terminal e ao preview de ajustes. */
export function updateTerminalFont(fontFamily) {
    root.style.setProperty('--font-mono', fontFamily);
    const preview = document.querySelector('.font-preview');
    if (preview) preview.style.fontFamily = fontFamily;
    Object.values(state.terminals).forEach(t => {
        t.options.fontFamily = fontFamily;
        if (typeof t.refresh === 'function') t.refresh(0, t.rows - 1);
    });
    focusTerminal(state.currentNet);
}

/** Restaura a fonte salva no navegador. */
export function loadFont() {
    const savedFont = localStorage.getItem(CONSTANTS.FONT_KEY) || CONSTANTS.DEFAULT_FONT;
    updateTerminalFont(savedFont);
    const fontSelect = document.getElementById('font-select');
    if (fontSelect) {
        const hasOption = [...fontSelect.options].some(option => option.value === savedFont);
        fontSelect.value = hasOption ? savedFont : CONSTANTS.DEFAULT_FONT;
    }
}

/** Restaura preferencias de interface salvas no navegador. */
export function loadUiPrefs() {
    let prefs = { statusbar: true, compact: false, fixedTerminal: false, mainnet: true };
    try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(CONSTANTS.UI_PREFS_KEY) || '{}') }; } catch (err) { /* Usa preferencias padrao. */ }
    applyStatusbarPreference(prefs.statusbar !== false);
    applyCompactPreference(prefs.compact === true);
    applyFixedTerminalPreference(prefs.fixedTerminal === true);
    applyMainnetPreference(prefs.mainnet !== false);
}

/** Persiste preferencias parciais de interface. */
export function saveUiPrefs(nextPrefs) {
    let prefs = {};
    try { prefs = JSON.parse(localStorage.getItem(CONSTANTS.UI_PREFS_KEY) || '{}'); } catch (err) { /* Sobrescreve preferencia invalida. */ }
    localStorage.setItem(CONSTANTS.UI_PREFS_KEY, JSON.stringify({ ...prefs, ...nextPrefs }));
}

/** Mostra ou oculta a statusbar inferior. */
export function applyStatusbarPreference(visible) {
    const shell = document.querySelector('.ide-shell');
    const toggle = document.getElementById('toggle-statusbar');
    if (shell) shell.classList.toggle('statusbar-hidden', !visible);
    if (toggle) toggle.classList.toggle('active', visible);
    scheduleTerminalFit();
}

/** Aplica densidade compacta na timeline. */
export function applyCompactPreference(active) {
    const shell = document.querySelector('.ide-shell');
    const toggle = document.getElementById('toggle-compact');
    if (shell) shell.classList.toggle('compact-timeline', active);
    if (toggle) toggle.classList.toggle('active', active);
}

/** Alterna o modo visual de terminal fixo. */
export function applyFixedTerminalPreference(active) {
    const shell = document.querySelector('.ide-shell');
    const toggle = document.getElementById('toggle-fixed-terminal');
    if (shell) shell.classList.toggle('fixed-terminal', active);
    if (toggle) toggle.classList.toggle('active', active);
}

/** Mostra/oculta mainnet da navegacao visual e volta para regtest se necessario. */
export function applyMainnetPreference(active) {
    const shell = document.querySelector('.ide-shell');
    const toggle = document.getElementById('toggle-mainnet');
    if (shell) shell.classList.toggle('hide-mainnet', !active);
    if (toggle) toggle.classList.toggle('active', active);
    if (!active && state.currentNet === 'mainnet') switchNet('regtest');
}
