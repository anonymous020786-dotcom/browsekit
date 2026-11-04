(() => {
  const { register, onKey, command, formatCombo, toast, togglePanel, isTyping } = globalThis.Browsekit;

  const SEARCH_INPUT = [
    'input[type="search"]', 'input[name="q"]', 'input[name="query"]', 'input[name="search"]',
    'input[role="searchbox"]', 'input[aria-label*="search" i]', 'input[placeholder*="search" i]',
  ].join(',');

  register({
    id: 'slash-focuses-search',
    name: '/ focuses search',
    category: 'keyboard',
    shortcut: '/',
    description: 'Press / to jump to the search box on sites that do not already have that shortcut.',
    run() {
      onKey('/', () => {
        const input = [...document.querySelectorAll(SEARCH_INPUT)].find(el => el.offsetParent !== null && !el.disabled);
        if (!input) return false;
        input.focus();
        input.select();
      }, { capture: false });
    },
  });

  register({
    id: 'vim-scroll',
    name: 'j / k scrolling',
    category: 'keyboard',
    shortcut: 'J / K',
    defaultEnabled: false,
    description: 'Scroll down with j and up with k, unless the site already uses those keys.',
    run() {
      onKey('j', () => scrollBy({ top: 80 }), { capture: false });
      onKey('k', () => scrollBy({ top: -80 }), { capture: false });
    },
  });

  register({
    id: 'escape-blurs-field',
    name: 'Esc leaves text fields',
    category: 'keyboard',
    shortcut: 'Esc',
    defaultEnabled: false,
    description: 'Pressing Esc in a text field removes focus so page shortcuts work again.',
    run() {
      onKey('escape', () => {
        if (!isTyping(document.activeElement)) return false;
        document.activeElement.blur();
      }, { allowInInputs: true, capture: false });
    },
  });

  const NEXT_TEXT = /^(next( page)?|older( posts?)?|[›»→]|next\s*[›»→])$/i;
  const PREV_TEXT = /^(prev(ious)?( page)?|newer( posts?)?|[‹«←]|[‹«←]\s*prev(ious)?)$/i;

  function findPagerLink(rel, textPattern) {
    const byRel = document.querySelector(`a[rel~="${rel}"][href], link[rel~="${rel}"][href]`);
    if (byRel) return byRel.href;
    const byText = [...document.querySelectorAll('a[href]')].find(link =>
      link.offsetParent !== null && textPattern.test((link.textContent.trim() || link.getAttribute('aria-label') || '')));
    return byText?.href ?? null;
  }

  register({
    id: 'next-prev-page',
    name: 'Next / previous page',
    category: 'keyboard',
    shortcut: 'Alt+Shift+→ / ←',
    description: 'Follows the page\'s "next" or "previous" link in paginated lists, search results and articles.',
    run() {
      const go = (rel, pattern) => () => {
        const href = findPagerLink(rel, pattern);
        if (href) location.href = href;
        else toast(`No ${rel} page link found`);
      };
      command('Next page', 'alt+shift+arrowright', go('next', NEXT_TEXT));
      command('Previous page', 'alt+shift+arrowleft', go('prev', PREV_TEXT));
    },
  });

  register({
    id: 'shortcut-cheatsheet',
    name: 'Shortcut cheat sheet',
    category: 'keyboard',
    shortcut: 'Alt+Shift+K',
    description: 'Shows every Browsekit shortcut that is active on the current page.',
    run() {
      command('Show shortcut cheat sheet', 'alt+shift+k', () => {
        const withShortcuts = globalThis.Browsekit.active.filter(feature => feature.shortcut);
        togglePanel('cheatsheet', 'Browsekit shortcuts', panel => {
          for (const feature of withShortcuts) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:space-between;gap:12px;padding:3px 0;border-bottom:1px solid #0001';
            const name = document.createElement('span');
            name.textContent = feature.name;
            const keys = document.createElement('kbd');
            keys.textContent = feature.shortcut;
            keys.style.cssText = 'font:12px ui-monospace,monospace;background:#f1f1f4;border-radius:4px;padding:1px 6px;white-space:nowrap';
            row.append(name, keys);
            panel.append(row);
          }
        });
      });
    },
  });

  const PALETTE_CSS = `
    .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.35); }
    .box { position: fixed; top: 12vh; left: 50%; transform: translateX(-50%); width: min(560px, calc(100vw - 32px));
      overflow: hidden; background: #fff; color: #1a1b1e; border-radius: 12px; box-shadow: 0 16px 48px rgba(0,0,0,.35);
      font: 14px/1.4 system-ui, sans-serif; }
    input { box-sizing: border-box; width: 100%; padding: 14px 16px; border: none; border-bottom: 1px solid #e3e4e8;
      outline: none; font: inherit; font-size: 16px; color: inherit; background: transparent; }
    ul { list-style: none; margin: 0; padding: 6px; max-height: 50vh; overflow: auto; }
    li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 10px; border-radius: 8px; cursor: pointer; }
    li[aria-selected="true"] { background: #e8efff; }
    kbd { font: 12px ui-monospace, Consolas, monospace; color: #5d6068; white-space: nowrap; }
    .empty { color: #7a7d85; cursor: default; }
    @media (prefers-color-scheme: dark) {
      .box { background: #212328; color: #e8e9ec; }
      input { border-color: #33363d; }
      li[aria-selected="true"] { background: #2f3a55; }
      kbd, .empty { color: #9a9ea8; }
    }`;

  function togglePalette() {
    const existing = document.querySelector('browsekit-palette');
    if (existing) {
      existing.remove();
      return;
    }

    const previousFocus = document.activeElement;
    // Read live on every keystroke: features that start a moment later still show up.
    const allCommands = () => [...globalThis.Browsekit.commands].sort((a, b) => a.name.localeCompare(b.name));
    let matches = allCommands();
    let selected = 0;

    const host = document.createElement('browsekit-palette');
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:block';
    const style = document.createElement('style');
    style.textContent = PALETTE_CSS;
    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    const box = document.createElement('div');
    box.className = 'box';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Browsekit commands');
    const input = document.createElement('input');
    input.placeholder = 'Type a command…';
    input.setAttribute('aria-label', 'Command');
    const list = document.createElement('ul');
    list.setAttribute('role', 'listbox');
    box.append(input, list);
    host.attachShadow({ mode: 'open' }).append(style, backdrop, box);

    const close = () => {
      host.remove();
      previousFocus?.focus?.({ preventScroll: true });
    };
    // Focus goes back to the page first, so commands like the password generator act on the field you were in.
    const runCommand = item => {
      close();
      Promise.resolve()
        .then(() => item.handler())
        .then(result => {
          if (result === false) toast(`“${item.name}” is not available on this page`);
        })
        .catch(error => toast(`Failed: ${error.message}`));
    };
    const highlight = () => {
      [...list.children].forEach((item, index) => item.setAttribute('aria-selected', String(index === selected)));
      list.children[selected]?.scrollIntoView({ block: 'nearest' });
    };
    const render = () => {
      list.replaceChildren();
      if (!matches.length) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = 'No matching commands';
        list.append(empty);
        return;
      }
      matches.forEach((item, index) => {
        const row = document.createElement('li');
        row.setAttribute('role', 'option');
        const name = document.createElement('span');
        name.textContent = item.name;
        row.append(name);
        if (item.combo) {
          const keys = document.createElement('kbd');
          keys.textContent = formatCombo(item.combo);
          row.append(keys);
        }
        row.addEventListener('click', () => runCommand(item));
        row.addEventListener('mousemove', () => {
          if (selected === index) return;
          selected = index;
          highlight();
        });
        list.append(row);
      });
      highlight();
    };

    input.addEventListener('input', () => {
      const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      matches = allCommands().filter(item => words.every(word => item.name.toLowerCase().includes(word)));
      selected = 0;
      render();
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!matches.length) return;
        selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
        highlight();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (matches[selected]) runCommand(matches[selected]);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    });
    // Keep keystrokes typed into the palette away from the page's own keyboard shortcuts.
    for (const type of ['keydown', 'keyup', 'keypress']) input.addEventListener(type, event => event.stopPropagation());
    backdrop.addEventListener('click', close);

    document.documentElement.append(host);
    render();
    input.focus();
  }

  register({
    id: 'command-palette',
    name: 'Command palette',
    category: 'keyboard',
    shortcut: 'Alt+Shift+X',
    description: 'Search and run every Browsekit action available on the page, including ones without a shortcut.',
    run() {
      // Works inside text fields too, so field commands (password generator, test data) are reachable.
      onKey('alt+shift+x', togglePalette, { allowInInputs: true });
      globalThis.Browsekit.togglePalette = togglePalette; // For the browser-level shortcut.
    },
  });

  const TEXT_FIELD = [
    'input:not([type])', 'input[type="text"]', 'input[type="search"]', 'input[type="email"]', 'input[type="url"]',
    'input[type="tel"]', 'input[type="password"]', 'input[type="number"]', 'textarea', '[contenteditable="true"]',
  ].join(',');

  register({
    id: 'focus-first-field',
    name: 'Jump to first text field',
    category: 'keyboard',
    shortcut: 'Alt+Shift+1',
    description: 'Puts the cursor in the first visible text field on the page.',
    run() {
      command('Focus first text field', 'alt+shift+1', () => {
        const field = [...document.querySelectorAll(TEXT_FIELD)]
          .find(element => element.offsetParent !== null && !element.disabled && !element.readOnly);
        if (!field) return false;
        field.focus();
        field.scrollIntoView({ block: 'center' });
      });
    },
  });
})();
