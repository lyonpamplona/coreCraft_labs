import { state, CONSTANTS } from './state.js';
import { processCommand } from './api.js';

/** Remove do xterm os caracteres digitados na linha atual. */
export function clearLine(t, currentInput) {
    t.write('\b \b'.repeat(currentInput.length));
}

/** Escreve o prompt padrao para a rede informada e rola o terminal ao final. */
export function writePrompt(t, net) {
    t.write(`\x1b[1;32mdeveloper@${net}\x1b[0m:\x1b[1;34m~\x1b[0m$ `);
    scrollTerminalToBottom(t);
}

/** Limita um numero ao intervalo informado. */
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/** Rola um terminal xterm ate a ultima linha, quando a API esta disponivel. */
export function scrollTerminalToBottom(t) {
    if (t && typeof t.scrollToBottom === 'function') t.scrollToBottom();
}

/** Ajusta, rola e foca o terminal da rede ativa ou informada. */
export function focusTerminal(net = state.currentNet) {
    const t = state.terminals[net];
    if (!t) return;
    scheduleTerminalFit(net);
    setTimeout(() => { scrollTerminalToBottom(t); t.focus(); }, 40);
}

/** Recalcula colunas/linhas do xterm usando FitAddon ou fallback manual. */
export function fitTerminal(net = state.currentNet) {
    const t = state.terminals[net];
    const panel = document.getElementById(`term-${net}`);
    if (!t || !panel || !panel.classList.contains('active')) return;
    const rect = panel.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80) return;
    if (state.fitAddons[net]) {
        try { state.fitAddons[net].fit(); scrollTerminalToBottom(t); return; } catch (err) {}
    }
    const fontSize = Number(t.options.fontSize) || 14;
    const lineHeight = Number(t.options.lineHeight) || 1.4;
    const cols = Math.floor(rect.width / Math.max(7, fontSize * 0.62));
    const rows = Math.floor((rect.height - 14) / Math.max(16, fontSize * lineHeight));
    t.resize(clamp(cols, 40, 220), clamp(rows, 8, 80));
    scrollTerminalToBottom(t);
}

/** Agenda um resize do terminal com debounce curto. */
export function scheduleTerminalFit(net = state.currentNet) {
    if (state.fitTimer) window.clearTimeout(state.fitTimer);
    state.fitTimer = window.setTimeout(() => { state.fitTimer = null; fitTerminal(net); }, 80);
}

/** Limpa o terminal ativo e recria o cabecalho da sessao. */
export function clearActiveTerminal() {
    const t = state.terminals[state.currentNet];
    t.clear();
    t.writeln('\x1b[1;33mdeveloper corecraft | v3.0 Multi-Node\x1b[0m');
    t.writeln(`\x1b[38;5;242mInstancia Conectada: \x1b[1;36m${state.currentNet.toUpperCase()}\x1b[0m\r\n`);
    state.inputs[state.currentNet] = "";
    writePrompt(t, state.currentNet);
    focusTerminal(state.currentNet);
}

/** Formata a saida textual do `help` do Bitcoin Core no xterm. */
export function formatHelpOutput(t, text) {
    const lines = text.split('\n');
    lines.forEach(line => {
        if (line.startsWith('==')) {
            t.writeln(`\r\n\x1b[1;35m${line}\x1b[0m`);
        } else if (line.trim().length === 0) {
            t.writeln('');
        } else if (/^\s/.test(line)) {
            t.writeln(`\x1b[38;5;250m${line}\x1b[0m`);
        } else if (line.trim().length > 0) {
            const parts = line.split(' ');
            const cmd = parts.shift();
            const rest = parts.join(' ');
            t.writeln(`  \x1b[1;36m${cmd}\x1b[0m \x1b[38;5;242m${rest}\x1b[0m`);
        }
    });
}

/** Escreve saida RPC no terminal, truncando respostas longas por padrao. */
export function writeTerminalOutput(t, output, options = {}) {
    const { truncate = true } = options;
    const lines = String(output ?? '').split('\n');
    const visibleLines = truncate ? lines.slice(0, CONSTANTS.MAX_TERMINAL_OUTPUT_LINES) : lines;
    visibleLines.forEach(line => t.writeln(`\x1b[38;5;250m${line}\x1b[0m`));
    if (truncate && lines.length > visibleLines.length) {
        t.writeln(`\x1b[33m[SAIDA TRUNCADA] ${lines.length - visibleLines.length} linhas ocultadas para manter o terminal responsivo.\x1b[0m`);
    }
}

/** Monta ajuda local de contingencia quando o RPC `help` nao entrega a secao. */
export function buildLocalHelpOutput(topic = '') {
    const normalized = topic.trim().toLowerCase();
    const sections = normalized && CONSTANTS.LOCAL_HELP_SECTIONS[normalized] ? { [normalized]: CONSTANTS.LOCAL_HELP_SECTIONS[normalized] } : CONSTANTS.LOCAL_HELP_SECTIONS;
    if (normalized && !CONSTANTS.LOCAL_HELP_SECTIONS[normalized]) return `Ajuda local: categoria "${topic}" nao encontrada.\n\nCategorias: ${Object.keys(CONSTANTS.LOCAL_HELP_SECTIONS).join(', ')}\nUse: help blockchain, help mempool, help network, help wallet.`;
    return Object.entries(sections).map(([section, commands]) => `== ${section} ==\n${commands.join('\n')}`).join('\n\n');
}

/** Normaliza nomes e aliases de categorias do `help`. */
export function normalizeHelpCategory(category = '') {
    const normalized = category.trim().toLowerCase().replace(/[\s_-]+/g, '');
    const aliases = { blockchain: 'blockchain', block: 'blockchain', blocks: 'blockchain', chain: 'blockchain', control: 'control', generating: 'generating', generation: 'generating', mempool: 'mempool', mining: 'mining', mineracao: 'mining', network: 'network', peer: 'network', peers: 'network', rawtransaction: 'rawtransactions', rawtransactions: 'rawtransactions', rawtx: 'rawtransactions', signer: 'signer', sign: 'signer', util: 'util', utility: 'util', wallet: 'wallet', wallets: 'wallet', zmq: 'zmq', laboratorio: 'mining' };
    return aliases[normalized] || normalized;
}

/** Extrai uma secao completa do texto retornado por `help`. */
export function extractHelpCategoryOutput(fullHelp, category) {
    const target = normalizeHelpCategory(category);
    const lines = String(fullHelp || '').split('\n');
    const selected = [];
    let capturing = false;
    for (const line of lines) {
        const section = line.match(/^==\s*(.*?)\s*==\s*$/);
        if (section) {
            const current = normalizeHelpCategory(section[1]);
            if (capturing && current !== target) break;
            capturing = current === target;
        }
        if (capturing) selected.push(line);
    }
    return selected.length ? selected.join('\n').trimEnd() : '';
}

/** Cria e registra uma instancia xterm.js para cada rede suportada. */
export function initTerminals() {
    CONSTANTS.networks.forEach(net => {
        const t = new Terminal({
            cursorBlink: true,
            theme: { background: 'transparent', foreground: '#e2e8f0', cursor: '#f7931a', selectionBackground: 'rgba(247, 147, 26, 0.3)' },
            fontFamily: CONSTANTS.DEFAULT_FONT,
            fontSize: 14,
            lineHeight: 1.4,
            convertEol: true
        });
        const termMount = document.getElementById(`term-${net}`);
        t.open(termMount);
        if (window.FitAddon?.FitAddon) {
            const fitAddon = new FitAddon.FitAddon();
            t.loadAddon(fitAddon);
            state.fitAddons[net] = fitAddon;
        }
        t.writeln('\x1b[1;33mdeveloper corecraft | v3.0 Multi-Node\x1b[0m');
        t.writeln(`\x1b[38;5;242mInstancia Conectada: \x1b[1;36m${net.toUpperCase()}\x1b[0m\r\n`);
        writePrompt(t, net);

        t.onData(e => {
            if (state.currentNet !== net) return;
            if (e === '\r') {
                const cmd = state.inputs[net].trim();
                if (cmd) {
                    t.write('\r\n');
                    state.cmdHistory[net].unshift(cmd);
                    if (state.cmdHistory[net].length > 50) state.cmdHistory[net].pop();
                    state.historyIdx[net] = -1;
                    if (cmd === 'clear') {
                        t.clear();
                        t.writeln('\x1b[1;33mdeveloper corecraft | v3.0 Multi-Node\x1b[0m');
                        t.writeln(`\x1b[38;5;242mInstancia Conectada: \x1b[1;36m${net.toUpperCase()}\x1b[0m\r\n`);
                        writePrompt(t, net);
                    } else {
                        processCommand(net, cmd);
                    }
                    state.inputs[net] = "";
                } else {
                    t.write('\r\n');
                    writePrompt(t, net);
                }
            } else if (e === '\u007F') {
                if (state.inputs[net].length > 0) {
                    state.inputs[net] = state.inputs[net].slice(0, -1);
                    t.write('\b \b');
                }
            } else if (e === '\x1b[A') {
                if (state.cmdHistory[net].length > 0 && state.historyIdx[net] < state.cmdHistory[net].length - 1) {
                    state.historyIdx[net]++;
                    clearLine(t, state.inputs[net]);
                    state.inputs[net] = state.cmdHistory[net][state.historyIdx[net]];
                    t.write(state.inputs[net]);
                }
            } else if (e === '\x1b[B') {
                if (state.historyIdx[net] > 0) {
                    state.historyIdx[net]--;
                    clearLine(t, state.inputs[net]);
                    state.inputs[net] = state.cmdHistory[net][state.historyIdx[net]];
                    t.write(state.inputs[net]);
                } else if (state.historyIdx[net] === 0) {
                    state.historyIdx[net] = -1;
                    clearLine(t, state.inputs[net]);
                    state.inputs[net] = "";
                }
            } else if (e === '\t') {
                const matches = CONSTANTS.autoCommands.filter(c => c.startsWith(state.inputs[net]));
                if (matches.length === 1) {
                    clearLine(t, state.inputs[net]);
                    state.inputs[net] = matches[0] + " ";
                    t.write(state.inputs[net]);
                } else if (matches.length > 1) {
                    t.write('\r\n' + matches.join('  ') + '\r\n');
                    writePrompt(t, net);
                    t.write(state.inputs[net]);
                }
            } else if (e >= " " && e <= "~") {
                state.inputs[net] += e;
                t.write(e);
            }
        });
        state.terminals[net] = t;
    });
    scheduleTerminalFit();
}
