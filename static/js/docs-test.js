import { CONSTANTS, root } from './panel/state.js';

const body = document.body;
const PREFS_KEY = 'corecraft.docsTestPrefs';
const fonts = {
    mono: CONSTANTS.DEFAULT_FONT,
    system: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    compact: '"Arial Narrow", "Roboto Condensed", system-ui, sans-serif'
};
const defaultPrefs = {
    sidebar: true,
    network: true,
    technical: true,
    code: true,
    tables: true
};

function readJson(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (err) {
        return fallback;
    }
}

function applyThemeByName(name) {
    const preset = CONSTANTS.themePresets[name] ? name : 'corecraft';
    Object.entries(CONSTANTS.themePresets[preset]).forEach(([property, value]) => root.style.setProperty(property, value));
    document.querySelectorAll('[data-docs-theme]').forEach(button => button.classList.toggle('active', button.dataset.docsTheme === preset));
}

function applyStoredTheme() {
    const saved = readJson(CONSTANTS.THEME_KEY, { preset: 'corecraft' });
    applyThemeByName(saved.preset || 'corecraft');
}

function applyFontByName(name) {
    const fontName = fonts[name] ? name : 'mono';
    root.style.setProperty('--font-mono', fonts[fontName]);
    document.querySelectorAll('[data-docs-font]').forEach(button => button.classList.toggle('active', button.dataset.docsFont === fontName));
}

function applyStoredFont() {
    const saved = readJson(CONSTANTS.FONT_KEY, { name: 'mono' });
    applyFontByName(saved.name || 'mono');
}

function readPrefs() {
    return { ...defaultPrefs, ...readJson(PREFS_KEY, {}) };
}

function savePrefs(prefs) {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function applyPrefs(prefs) {
    body.classList.toggle('docs-test-hide-sidebar', !prefs.sidebar);
    body.classList.toggle('docs-test-hide-network', !prefs.network);
    body.classList.toggle('docs-test-hide-technical', !prefs.technical);
    body.classList.toggle('docs-test-hide-code', !prefs.code);
    body.classList.toggle('docs-test-hide-tables', !prefs.tables);
    document.querySelectorAll('[data-docs-toggle]').forEach(button => {
        const key = button.dataset.docsToggle;
        button.classList.toggle('active', Boolean(prefs[key]));
    });
}

document.querySelectorAll('[data-docs-theme]').forEach(button => {
    button.addEventListener('click', () => {
        const preset = button.dataset.docsTheme;
        localStorage.setItem(CONSTANTS.THEME_KEY, JSON.stringify({ preset }));
        applyThemeByName(preset);
    });
});

document.querySelectorAll('[data-docs-font]').forEach(button => {
    button.addEventListener('click', () => {
        const name = button.dataset.docsFont;
        localStorage.setItem(CONSTANTS.FONT_KEY, JSON.stringify({ name }));
        applyFontByName(name);
    });
});

document.querySelectorAll('[data-docs-toggle]').forEach(button => {
    button.addEventListener('click', () => {
        const prefs = readPrefs();
        const key = button.dataset.docsToggle;
        prefs[key] = !prefs[key];
        savePrefs(prefs);
        applyPrefs(prefs);
    });
});

const menuButton = document.querySelector('[data-docs-menu]');
if (menuButton) {
    menuButton.addEventListener('click', () => {
        const prefs = readPrefs();
        prefs.sidebar = !prefs.sidebar;
        savePrefs(prefs);
        applyPrefs(prefs);
    });
}

window.addEventListener('storage', event => {
    if (event.key === CONSTANTS.THEME_KEY) applyStoredTheme();
    if (event.key === CONSTANTS.FONT_KEY) applyStoredFont();
    if (event.key === PREFS_KEY) applyPrefs(readPrefs());
});

applyStoredTheme();
applyStoredFont();
applyPrefs(readPrefs());
