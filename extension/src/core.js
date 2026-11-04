// Browsekit core: the feature registry plus small DOM helpers shared by every feature.
// Loaded first in the content script and on the options page.
(() => {
  if (globalThis.Browsekit) return;

  const CATEGORIES = {
    reading: 'Reading',
    links: 'Links & URLs',
    media: 'Video & media',
    forms: 'Forms & text',
    keyboard: 'Keyboard',
    cleanup: 'Annoyances',
    productivity: 'Productivity',
    tables: 'Tables',
    sites: 'Site packs',
  };

  const features = [];

  function register(feature) {
    for (const key of ['id', 'name', 'description', 'category', 'run']) {
      if (!feature[key]) throw new Error(`Browsekit feature is missing "${key}": ${feature.id ?? '(no id)'}`);
    }
    if (!(feature.category in CATEGORIES)) throw new Error(`Unknown category "${feature.category}" in ${feature.id}`);
    if (features.some(existing => existing.id === feature.id)) throw new Error(`Duplicate feature id: ${feature.id}`);
    features.push({ defaultEnabled: true, shortcut: null, ...feature });
  }

  function isTyping(target) {
    if (!(target instanceof Element)) return false;
    return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
  }

  const PUNCTUATION_CODES = {
    ',': 'comma', '.': 'period', '=': 'equal', '-': 'minus', '/': 'slash', ';': 'semicolon',
    '[': 'bracketleft', ']': 'bracketright', '\\': 'backslash',
  };

  // `combo` looks like "alt+shift+d" or "[". Modifiers must match exactly.
  function matchesCombo(event, combo) {
    const parts = combo.toLowerCase().split('+');
    const key = parts.pop();
    const modifiers = { alt: event.altKey, ctrl: event.ctrlKey, shift: event.shiftKey, meta: event.metaKey };
    for (const [name, pressed] of Object.entries(modifiers)) {
      if (pressed !== parts.includes(name)) return false;
    }
    if (event.key.toLowerCase() === key) return true;
    // With modifiers held, event.key changes (Shift+1 is "!", Alt+letter differs on macOS and AltGr layouts),
    // so fall back to the physical key.
    if (!parts.length) return false;
    const code = event.code.toLowerCase();
    return code === `key${key}` || code === `digit${key}` || code === PUNCTUATION_CODES[key];
  }

  // Handlers that return `false` mean "not handled" and leave the key to the page.
  // `capture: false` listens after the page's own handlers, so site shortcuts win.
  function onKey(combo, handler, { allowInInputs = false, capture = true } = {}) {
    const target = capture ? document : window;
    target.addEventListener('keydown', event => {
      if (event.repeat || event.defaultPrevented) return;
      if (!allowInInputs && isTyping(event.composedPath()[0])) return;
      if (!matchesCombo(event, combo)) return;
      if (handler(event) !== false) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, capture);
  }

  const commands = [];

  // A named action: bound to `combo` when given, and always listed in the command palette.
  function command(name, combo, handler, keyOptions) {
    commands.push({ name, combo, handler });
    if (combo) onKey(combo, handler, keyOptions);
  }

  const KEY_LABELS = { arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', escape: 'Esc' };
  function formatCombo(combo) {
    return combo.split('+')
      .map(part => KEY_LABELS[part] ?? (part.length === 1 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
      .join('+');
  }

  function addStyle(css) {
    const style = document.createElement('style');
    style.textContent = css;
    (document.head ?? document.documentElement).append(style);
    return style;
  }

  let toastElement;
  let toastTimer;
  function toast(message, duration = 1800) {
    if (!toastElement) {
      toastElement = document.createElement('div');
      toastElement.setAttribute('role', 'status');
      toastElement.style.cssText = [
        'position:fixed', 'left:50%', 'bottom:32px', 'transform:translateX(-50%)', 'z-index:2147483647',
        'max-width:80vw', 'padding:8px 14px', 'border-radius:8px', 'background:rgba(20,20,24,.92)', 'color:#fff',
        'font:500 13px/1.4 system-ui,sans-serif', 'box-shadow:0 4px 16px rgba(0,0,0,.3)', 'pointer-events:none',
        'transition:opacity .2s', 'opacity:0',
      ].join(';');
      document.documentElement.append(toastElement);
    }
    toastElement.textContent = message;
    toastElement.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastElement.style.opacity = '0'; }, duration);
  }

  // A dismissible floating card. Calling it again with the same `kind` closes it (toggle).
  function togglePanel(kind, title, buildBody) {
    const existing = document.getElementById('browsekit-panel');
    existing?.remove();
    if (existing?.dataset.kind === kind) return null;

    const panel = document.createElement('div');
    panel.id = 'browsekit-panel';
    panel.dataset.kind = kind;
    panel.style.cssText = [
      'position:fixed', 'top:16px', 'right:16px', 'width:320px', 'max-height:70vh', 'overflow:auto',
      'z-index:2147483647', 'padding:12px 14px', 'border-radius:10px', 'background:#fff', 'color:#1a1a1a',
      'font:13px/1.5 system-ui,sans-serif', 'box-shadow:0 8px 32px rgba(0,0,0,.25)', 'text-align:left',
    ].join(';');

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-weight:600;margin-bottom:8px';
    header.textContent = title;
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.title = 'Close';
    close.style.cssText = 'border:none;background:none;font-size:18px;line-height:1;cursor:pointer;color:inherit;padding:0 4px';
    close.addEventListener('click', () => panel.remove());
    header.append(close);

    panel.append(header);
    buildBody(panel);
    document.documentElement.append(panel);
    return panel;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.documentElement.append(area);
      area.select();
      const copied = document.execCommand('copy');
      area.remove();
      return copied;
    }
  }

  // The element holding the page's main text: the best article-like container,
  // or failing that, the parent element with the most paragraph text.
  function mainContent() {
    const paragraphText = element => [...element.querySelectorAll('p')].reduce((sum, p) => sum + p.textContent.trim().length, 0);
    let best = null;
    let bestScore = 0;
    for (const candidate of document.querySelectorAll('article, main, [role="main"], .post-content, .entry-content, .article-body')) {
      const score = paragraphText(candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (bestScore >= 500) return best;

    const textByParent = new Map();
    for (const paragraph of document.querySelectorAll('p')) {
      const parent = paragraph.parentElement;
      textByParent.set(parent, (textByParent.get(parent) ?? 0) + paragraph.textContent.trim().length);
    }
    let fallback = null;
    let fallbackScore = 0;
    for (const [parent, score] of textByParent) {
      if (score > fallbackScore) {
        fallback = parent;
        fallbackScore = score;
      }
    }
    return fallbackScore >= 300 ? fallback : best;
  }

  // Saves text as a file through a temporary download link.
  function downloadFile(content, filename, type) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type }));
    link.download = filename.replace(/[\\/:*?"<>|]/g, '_');
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  }

  function selectedText() {
    return String(getSelection() ?? '').trim();
  }

  // Runs `callback` now and again (debounced) whenever the DOM changes. Callbacks must be idempotent.
  function watchDom(callback, delay = 300) {
    let timer;
    callback();
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(callback, delay);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  function debounce(callback, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => callback(...args), delay);
    };
  }

  globalThis.Browsekit = {
    CATEGORIES,
    features,
    commands,
    active: [],
    register,
    isTyping,
    onKey,
    command,
    formatCombo,
    addStyle,
    toast,
    togglePanel,
    copyText,
    mainContent,
    downloadFile,
    selectedText,
    watchDom,
    debounce,
  };
})();
