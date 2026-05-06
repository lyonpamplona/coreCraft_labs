import { state, CONSTANTS, root } from './state.js';
import { scheduleTerminalFit, focusTerminal } from './terminal.js';
import { fetchNodeStatus, loadInitialBlocks } from './api.js';

/** Aplica destaque simples de sintaxe JSON em uma linha ja serializada. */
export function highlightJsonLine(line) {
    const escaped = escapeHtml(line);
    return escaped.replace(/(&quot;.*?&quot;)(\s*:)?|\b(true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, function(match, p1, p2, p3) {
        if (p2) return `<span class="prop">${p1}</span>${p2}`;
        if (p1) return `<span class="str">${p1}</span>`;
        if (p3) return `<span class="kw">${match}</span>`;
        return `<span class="num">${match}</span>`;
    });
}

/** Renderiza a ultima resposta RPC no painel `rpc.response` com limite de linhas. */
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

/** Abre um topico resumido no viewer de documentacao integrado. */
export function showDocTopic(topic = 'arquitetura') {
    const data = CONSTANTS.docTopics[topic] || CONSTANTS.docTopics.arquitetura;
    const title = document.getElementById('doc-title');
    const description = document.getElementById('doc-description');
    if (title) title.textContent = data.title;
    if (description) description.textContent = data.description;
    selectMainView('docs', 'docs');
}

/** Monta o HTML de um card visual da timeline com campos escapados. */
export function blockCardMarkup({ title, status, hash, tx, size, fees, source, time, icon = 'ico-block' }) {
    const safe = { title: escapeHtml(title), status: escapeHtml(status), hash: escapeHtml(hash), tx: escapeHtml(tx), size: escapeHtml(size), fees: escapeHtml(fees), source: escapeHtml(source), time: escapeHtml(time), icon: String(icon).replace(/[^a-z0-9_-]/gi, '') || 'ico-block' };
    return `<div class="block-visual"><div class="block-head"><div class="block-height"><svg class="icon"><use href="#${safe.icon}"></use></svg><span>${safe.title}</span></div><span class="block-pill">${safe.status}</span></div><div class="block-hash"><label>hash</label><code>${safe.hash}</code></div><div class="block-stats"><div class="block-stat"><label>tx</label><strong>${safe.tx}</strong></div><div class="block-stat"><label>peso</label><strong>${safe.size}</strong></div><div class="block-stat"><label>taxas</label><strong>${safe.fees}</strong></div></div><div class="block-route"><span>${safe.source}</span><strong>${safe.time}</strong></div></div>`;
}

/** Escapa texto antes de inserir conteudo em trechos HTML controlados. */
export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

/** Troca a rede ativa, sincroniza a UI e exibe comandos permitidos por rede. */
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

    // Regtest mostra wallet/mineracao; Signet mostra apenas a faucet.
    if (walletGroup) walletGroup.style.display = (net === 'regtest' || net === 'signet') ? 'flex' : 'none';
    if (walletSep) walletSep.style.display = (net === 'regtest' || net === 'signet') ? 'block' : 'none';

    // Liga e desliga botoes especificos por rede.
    if (btnAddress) btnAddress.style.display = net === 'regtest' ? 'flex' : 'none';
    if (btnBalance) btnBalance.style.display = net === 'regtest' ? 'flex' : 'none';
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

/** Desabilita macros de wallet/mineracao no seletor quando a rede nao e regtest. */
export function updateCommandAvailability(net) {
    const walletOnlyCommands = new Set(['getnewaddress', 'getbalance', 'generatetoaddress 100 [auto]']);
    const macroSelect = document.getElementById('macro-select');
    if (!macroSelect) return;
    [...macroSelect.options].forEach(option => { option.disabled = walletOnlyCommands.has(option.value) && net !== 'regtest'; });
    if (macroSelect.selectedOptions[0] && macroSelect.selectedOptions[0].disabled) macroSelect.value = 'getblockchaininfo';
}

/** Atualiza um valor numerico/textual do dashboard com animacao curta. */
export function updateDashboardValue(elementId, newValue) {
    const el = document.getElementById(elementId);
    if (el && el.innerText !== String(newValue)) {
        el.innerText = newValue;
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 300);
    }
}

/** Alterna o viewer JSON entre modo normal e modo expandido para auditoria. */
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

/** Exibe um toast temporario na pilha visual do painel. */
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

/** Esconde o overlay de login depois de sessao validada. */
export function hideLogin() {
    const overlay = document.getElementById('login-overlay');
    if (overlay) overlay.classList.add('hidden');
}

/** Atualiza indicadores de estado do WebSocket. */
export function setConnectionStatus(label, color) {
    const el = document.getElementById('conn-status');
    const wsLabel = document.getElementById('ws-status-label');
    if (el) { el.innerText = label; el.style.color = color; }
    if (wsLabel) wsLabel.innerText = `WebSocket ${label.toLowerCase()}`;
}

/** Atualiza o texto de estado RPC/API no cabecalho do painel. */
export function setRpcStatus(text) {
    const rpcStatus = document.getElementById('rpc-status-label');
    if (rpcStatus) rpcStatus.innerText = text;
}

/** Alterna a area central entre terminal, docs e a aba visual ativa. */
export function selectMainView(view, tabName = state.currentNet) {
    state.activeMainView = view;
    document.querySelectorAll('[data-editor-view]').forEach(panel => panel.classList.toggle('active', panel.dataset.editorView === view));
    document.querySelectorAll('.ide-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === tabName));
    document.querySelectorAll('[data-open-tab]').forEach(item => item.classList.toggle('active', item.dataset.openTab === tabName));
    const command = document.querySelector('.ide-command span');
    if (command) command.textContent = view === 'docs' ? 'docs arquitetura' : `${tabName} getblockchaininfo`;
    const title = document.getElementById('editor-title');
    const status = document.getElementById('editor-status');
    if (title) title.textContent = view === 'docs' ? 'docs.viewer' : 'rpc.response';
    if (status) status.textContent = view === 'docs' ? 'preview' : (tabName === 'mainnet' ? 'sync' : 'online');
    document.body.classList.toggle('docs-active', view === 'docs');
    if (view === 'terminal' && state.terminals[tabName]) focusTerminal(tabName);
    else scheduleTerminalFit();
}

/** Seleciona o painel lateral ativo e ajusta o drawer em telas pequenas. */
export function selectSidePanel(view) {
    document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    document.querySelectorAll('[data-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === view));
    const sideTitle = document.getElementById('side-title');
    if (sideTitle) sideTitle.textContent = CONSTANTS.panelNames[view] || 'Painel';
    if (view === 'docs') selectMainView('docs', 'docs');
    if (window.matchMedia('(max-width: 860px)').matches) document.querySelector('.ide-workspace').classList.add('mobile-sidebar-open');
}

/** Seleciona uma secao da tela de ajustes. */
export function selectSettingsSection(section) {
    document.querySelectorAll('[data-settings-section]').forEach(group => group.classList.toggle('active', group.dataset.settingsSection === section));
    document.querySelectorAll('[data-settings-target]').forEach(button => button.classList.toggle('active', button.dataset.settingsTarget === section));
}

/** Aplica variaveis CSS de tema e marca o preset ativo quando houver. */
export function applyTheme(values, presetName = '') {
    Object.entries(values).forEach(([property, value]) => root.style.setProperty(property, value));
    document.querySelectorAll('[data-theme-var]').forEach(input => {
        const value = values[input.dataset.themeVar] || getComputedStyle(root).getPropertyValue(input.dataset.themeVar).trim();
        if (value) input.value = value;
    });
    document.querySelectorAll('[data-theme-preset]').forEach(button => button.classList.toggle('active', button.dataset.themePreset === presetName));
}

/** Persiste as variaveis CSS editadas manualmente como tema customizado. */
export function saveCustomTheme() {
    const values = {};
    document.querySelectorAll('[data-theme-var]').forEach(input => { values[input.dataset.themeVar] = input.value; });
    localStorage.setItem(CONSTANTS.THEME_KEY, JSON.stringify({ preset: 'custom', values }));
}

/** Carrega tema salvo ou aplica o preset padrao. */
export function loadTheme() {
    const saved = localStorage.getItem(CONSTANTS.THEME_KEY);
    if (!saved) return applyTheme(CONSTANTS.themePresets.corecraft, 'corecraft');
    try {
        const data = JSON.parse(saved);
        if (data.preset && CONSTANTS.themePresets[data.preset]) return applyTheme(CONSTANTS.themePresets[data.preset], data.preset);
        if (data.values) return applyTheme(data.values, '');
    } catch (err) {}
    applyTheme(CONSTANTS.themePresets.corecraft, 'corecraft');
}

/** Atualiza a fonte mono do terminal, preview e instancias xterm. */
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

/** Restaura a fonte persistida no navegador. */
export function loadFont() {
    const savedFont = localStorage.getItem(CONSTANTS.FONT_KEY) || CONSTANTS.DEFAULT_FONT;
    updateTerminalFont(savedFont);
    const fontSelect = document.getElementById('font-select');
    if (fontSelect) {
        const hasOption = [...fontSelect.options].some(option => option.value === savedFont);
        fontSelect.value = hasOption ? savedFont : CONSTANTS.DEFAULT_FONT;
    }
}

/** Carrega preferencias visuais persistidas no navegador. */
export function loadUiPrefs() {
    let prefs = { statusbar: true, compact: false, fixedTerminal: false, mainnet: true };
    try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(CONSTANTS.UI_PREFS_KEY) || '{}') }; } catch (err) {}
    applyStatusbarPreference(prefs.statusbar !== false);
    applyCompactPreference(prefs.compact === true);
    applyFixedTerminalPreference(prefs.fixedTerminal === true);
    applyMainnetPreference(prefs.mainnet !== false);
}

/** Mescla e salva preferencias visuais do shell. */
export function saveUiPrefs(nextPrefs) {
    let prefs = {};
    try { prefs = JSON.parse(localStorage.getItem(CONSTANTS.UI_PREFS_KEY) || '{}'); } catch (err) {}
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

/** Alterna o modo compacto da timeline. */
export function applyCompactPreference(active) {
    const shell = document.querySelector('.ide-shell');
    const toggle = document.getElementById('toggle-compact');
    if (shell) shell.classList.toggle('compact-timeline', active);
    if (toggle) toggle.classList.toggle('active', active);
}

/** Alterna o modo de terminal fixo. */
export function applyFixedTerminalPreference(active) {
    const shell = document.querySelector('.ide-shell');
    const toggle = document.getElementById('toggle-fixed-terminal');
    if (shell) shell.classList.toggle('fixed-terminal', active);
    if (toggle) toggle.classList.toggle('active', active);
}

/** Mostra ou oculta mainnet e volta para regtest se necessario. */
export function applyMainnetPreference(active) {
    const shell = document.querySelector('.ide-shell');
    const toggle = document.getElementById('toggle-mainnet');
    if (shell) shell.classList.toggle('hide-mainnet', !active);
    if (toggle) toggle.classList.toggle('active', active);
    if (!active && state.currentNet === 'mainnet') switchNet('regtest');
}
