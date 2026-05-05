import { state, CONSTANTS, root } from './state.js';
import { selectSidePanel, selectMainView, selectSettingsSection, applyTheme, saveCustomTheme, updateTerminalFont, loadTheme, loadFont, loadUiPrefs, applyStatusbarPreference, applyCompactPreference, applyFixedTerminalPreference, applyMainnetPreference, saveUiPrefs, showDocTopic, toggleJsonView, switchNet, showLogin, hideLogin } from './ui.js';
import { initTerminals, scheduleTerminalFit, clearActiveTerminal, clamp } from './terminal.js';
import { submitLogin, startApp, fetchNodeStatus, executeMacro, mineBlockMacro, verifyToken } from './api.js';

/**
 * Bootstrap do painel.
 *
 * Este modulo conecta os componentes HTML aos modulos de estado, UI, terminal
 * e API. Ele tambem expoe alguns handlers em `window` para preservar os
 * atributos `onclick` existentes no template.
 */
window.switchNet = switchNet;
window.executeMacro = executeMacro;
window.mineBlockMacro = mineBlockMacro;
window.clearActiveTerminal = clearActiveTerminal;
window.toggleJsonView = toggleJsonView;

document.querySelectorAll('[data-view]').forEach(button => {
    button.addEventListener('click', () => selectSidePanel(button.dataset.view));
});

document.querySelectorAll('[data-open-view]').forEach(item => {
    item.addEventListener('click', () => {
        if (item.dataset.openView === 'docs') {
            if (item.dataset.docTopic) showDocTopic(item.dataset.docTopic);
            selectMainView('docs', 'docs');
            return;
        }
        selectMainView('terminal', item.dataset.openTab || state.currentNet);
    });
});

document.querySelectorAll('[data-settings-target]').forEach(button => {
    button.addEventListener('click', () => selectSettingsSection(button.dataset.settingsTarget));
});

document.querySelectorAll('.toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
        const nextActive = !toggle.classList.contains('active');
        const toggleType = toggle.dataset.uiToggle;
        if (toggleType === 'statusbar') { applyStatusbarPreference(nextActive); saveUiPrefs({ statusbar: nextActive }); }
        else if (toggleType === 'compact') { applyCompactPreference(nextActive); saveUiPrefs({ compact: nextActive }); }
        else if (toggleType === 'fixed-terminal') { applyFixedTerminalPreference(nextActive); saveUiPrefs({ fixedTerminal: nextActive }); }
        else if (toggleType === 'mainnet') { applyMainnetPreference(nextActive); saveUiPrefs({ mainnet: nextActive }); }
        else toggle.classList.toggle('active', nextActive);
    });
});

document.querySelectorAll('[data-terminal-command]').forEach(button => {
    button.addEventListener('click', () => {
        const command = button.dataset.terminalCommand;
        if (command === 'mine-block') { mineBlockMacro(); return; }
        executeMacro(command);
    });
});

document.querySelectorAll('[data-doc-topic]').forEach(item => {
    item.addEventListener('click', () => showDocTopic(item.dataset.docTopic));
});

document.querySelectorAll('[data-theme-preset]').forEach(button => {
    button.addEventListener('click', () => {
        const preset = button.dataset.themePreset;
        applyTheme(CONSTANTS.themePresets[preset], preset);
        localStorage.setItem(CONSTANTS.THEME_KEY, JSON.stringify({ preset }));
    });
});

document.querySelectorAll('[data-theme-var]').forEach(input => {
    input.addEventListener('input', () => {
        root.style.setProperty(input.dataset.themeVar, input.value);
        document.querySelectorAll('[data-theme-preset]').forEach(button => button.classList.remove('active'));
        saveCustomTheme();
    });
});

document.getElementById('font-select').addEventListener('change', (event) => {
    root.style.setProperty('--font-mono', event.target.value);
    updateTerminalFont(event.target.value);
    localStorage.setItem(CONSTANTS.FONT_KEY, event.target.value);
});

document.getElementById('reset-theme').addEventListener('click', () => {
    localStorage.removeItem(CONSTANTS.THEME_KEY);
    localStorage.removeItem(CONSTANTS.FONT_KEY);
    localStorage.removeItem(CONSTANTS.UI_PREFS_KEY);
    document.getElementById('font-select').value = CONSTANTS.DEFAULT_FONT;
    updateTerminalFont(CONSTANTS.DEFAULT_FONT);
    applyStatusbarPreference(true);
    applyCompactPreference(false);
    applyFixedTerminalPreference(false);
    applyMainnetPreference(true);
    applyTheme(CONSTANTS.themePresets.corecraft, 'corecraft');
});

document.getElementById('run-selected').addEventListener('click', () => {
    executeMacro(document.getElementById('macro-select').value);
});

document.getElementById('search-input').addEventListener('input', (event) => {
    const term = event.target.value.trim().toLowerCase();
    document.querySelectorAll('[data-panel="search"] .tool-item').forEach(item => {
        item.style.display = item.textContent.toLowerCase().includes(term) ? 'grid' : 'none';
    });
});

document.addEventListener('click', (event) => {
    if (!window.matchMedia('(max-width: 860px)').matches) return;
    const clickedSidebar = event.target.closest('.ide-sidebar');
    const clickedActivity = event.target.closest('.ide-activitybar');
    if (!clickedSidebar && !clickedActivity) document.querySelector('.ide-workspace').classList.remove('mobile-sidebar-open');
});

document.querySelectorAll('.resize-handle').forEach(handle => {
    handle.addEventListener('pointerdown', (event) => {
        if (window.matchMedia('(max-width: 860px)').matches) return;
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        document.body.classList.add('resizing');
        const type = handle.dataset.resize;
        const startX = event.clientX;
        const startY = event.clientY;
        const styles = getComputedStyle(root);
        const startSidebar = parseFloat(styles.getPropertyValue('--sidebar-width')) || 236;
        const startRight = parseFloat(styles.getPropertyValue('--rightbar-width')) || 300;
        const startTerminal = document.getElementById('workspace').getBoundingClientRect().height;
        
        function move(pointerEvent) {
            if (type === 'sidebar') root.style.setProperty('--sidebar-width', `${clamp(startSidebar + pointerEvent.clientX - startX, 176, 420)}px`);
            if (type === 'right') root.style.setProperty('--rightbar-width', `${clamp(startRight - (pointerEvent.clientX - startX), 220, 460)}px`);
            if (type === 'terminal') {
                const mainHeight = document.querySelector('.ide-main')?.getBoundingClientRect().height || window.innerHeight;
                const maxHeight = Math.max(260, mainHeight * 0.48);
                const next = clamp(startTerminal - (pointerEvent.clientY - startY), 220, maxHeight);
                root.style.setProperty('--terminal-height', `${next}px`);
            }
            scheduleTerminalFit();
        }
        function stop() {
            document.body.classList.remove('resizing');
            handle.releasePointerCapture(event.pointerId);
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', stop);
            scheduleTerminalFit();
        }
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', stop);
    });
});

window.addEventListener('resize', () => scheduleTerminalFit());
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { scheduleTerminalFit(); fetchNodeStatus({ force: true }); }
});

initTerminals();
loadTheme();
loadFont();
loadUiPrefs();

document.getElementById('login-form').addEventListener('submit', submitLogin);

if (CONSTANTS.REQUIRE_AUTH) {
    verifyToken().then(ok => {
        if (ok) {
            state.authReady = true;
            localStorage.removeItem(CONSTANTS.AUTH_TOKEN_KEY);
            hideLogin();
            startApp();
        } else if (state.legacyStoredToken) {
            verifyToken(state.legacyStoredToken).then(legacyOk => {
                if (legacyOk) {
                    state.authReady = true;
                    localStorage.removeItem(CONSTANTS.AUTH_TOKEN_KEY);
                    hideLogin();
                    startApp();
                } else {
                    localStorage.removeItem(CONSTANTS.AUTH_TOKEN_KEY);
                    showLogin('Informe o token atual para liberar o painel.');
                }
            }).catch(() => showLogin('Nao foi possivel validar o token salvo.'));
        } else {
            localStorage.removeItem(CONSTANTS.AUTH_TOKEN_KEY);
            showLogin();
        }
    }).catch(() => showLogin('Nao foi possivel validar a sessao do painel.'));
} else {
    hideLogin();
    startApp();
}
