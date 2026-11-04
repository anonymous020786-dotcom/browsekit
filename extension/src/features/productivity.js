(() => {
  const {
    register, command, addStyle, toast, copyText, selectedText, watchDom, debounce, togglePanel, mainContent, downloadFile,
  } = globalThis.Browsekit;

  register({
    id: 'copy-code-button',
    name: 'Copy button on code blocks',
    category: 'productivity',
    description: 'Adds a "Copy" button when you hover a code block, unless the site already has one.',
    match: () => !/json/.test(document.contentType), // The JSON viewer has its own Copy button.
    run() {
      addStyle(`
        .browsekit-copy { position: absolute; top: 6px; right: 6px; z-index: 1; padding: 2px 8px; opacity: 0;
          font: 12px system-ui, sans-serif; color: #222; background: rgba(255,255,255,.9);
          border: 1px solid rgba(128,128,128,.4); border-radius: 4px; cursor: pointer; transition: opacity .15s; }
        .browsekit-copy-host:hover > .browsekit-copy, .browsekit-copy:focus { opacity: 1; }`);
      const seen = new WeakSet();
      watchDom(() => {
        for (const pre of document.querySelectorAll('pre')) {
          if (seen.has(pre)) continue;
          seen.add(pre);
          if (pre.textContent.trim().length < 20) continue;
          if (pre.parentElement?.querySelector('clipboard-copy, button[aria-label*="copy" i], button[title*="copy" i]')) continue;

          if (getComputedStyle(pre).position === 'static') pre.style.position = 'relative';
          pre.classList.add('browsekit-copy-host');
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'browsekit-copy';
          button.textContent = 'Copy';
          button.addEventListener('click', async () => {
            const code = [...pre.childNodes].filter(node => node !== button).map(node => node.textContent).join('');
            button.textContent = (await copyText(code)) ? 'Copied' : 'Failed';
            setTimeout(() => { button.textContent = 'Copy'; }, 1200);
          });
          pre.append(button);
        }
      });
    },
  });

  register({
    id: 'search-selection',
    name: 'Search selected text',
    category: 'productivity',
    shortcut: 'Alt+Shift+G',
    description: 'Searches the web for the selected text in a new tab.',
    run() {
      command('Search selected text', 'alt+shift+g', () => {
        const text = selectedText();
        if (!text) {
          toast('Select some text first');
          return;
        }
        window.open(`https://www.google.com/search?q=${encodeURIComponent(text)}`, '_blank', 'noopener');
      });
    },
  });

  register({
    id: 'translate-selection',
    name: 'Translate selected text',
    category: 'productivity',
    shortcut: 'Alt+Shift+W',
    description: 'Opens the selected text in Google Translate, translated into your browser language.',
    run() {
      command('Translate selected text', 'alt+shift+w', () => {
        const text = selectedText();
        if (!text) {
          toast('Select some text first');
          return;
        }
        const target = navigator.language.split('-')[0];
        window.open(`https://translate.google.com/?sl=auto&tl=${target}&op=translate&text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      });
    },
  });

  register({
    id: 'timestamp-converter',
    name: 'Unix timestamp converter',
    category: 'productivity',
    description: 'Select a Unix timestamp (10 or 13 digits) to see it as a readable local and UTC date.',
    run() {
      document.addEventListener('selectionchange', debounce(() => {
        const text = selectedText();
        if (!/^(\d{10}|\d{13})$/.test(text)) return;
        const date = new Date(text.length === 10 ? Number(text) * 1000 : Number(text));
        toast(`${date.toLocaleString()}  ·  ${date.toISOString()}`, 5000);
      }, 300));
    },
  });

  // Splits pretty-printed JSON into coloured spans. Strings are matched first, so digits inside them stay strings.
  const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  const JSON_COLORS = { key: '#0451a5', string: '#a31515', literal: '#7b30d0', number: '#098658' };

  function highlightJson(text) {
    const fragment = document.createDocumentFragment();
    let last = 0;
    for (const match of text.matchAll(JSON_TOKEN)) {
      fragment.append(text.slice(last, match.index));
      const kind = match[1] ? (match[2] ? 'key' : 'string') : match[3] ? 'literal' : 'number';
      const span = document.createElement('span');
      span.style.color = JSON_COLORS[kind];
      span.textContent = match[1] ?? match[0];
      fragment.append(span);
      if (match[2]) fragment.append(match[2]);
      last = match.index + match[0].length;
    }
    fragment.append(text.slice(last));
    return fragment;
  }

  register({
    id: 'json-viewer',
    name: 'JSON viewer',
    category: 'productivity',
    description: 'Pretty-prints and colours raw JSON responses opened in the browser, with Raw and Copy buttons.',
    match: () => /^application\/([\w.+-]+\+)?json$/.test(document.contentType),
    run() {
      // Read only the page's own text nodes, never anything another feature added to the <pre>.
      const container = document.body.querySelector('pre') ?? document.body;
      const source = [...container.childNodes]
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent)
        .join('');
      let data;
      try {
        data = JSON.parse(source);
      } catch {
        return;
      }
      const pretty = JSON.stringify(data, null, 2);

      const toolbar = document.createElement('div');
      toolbar.style.cssText = 'position:sticky;top:0;display:flex;gap:8px;padding:8px 0;background:#fff';
      const output = document.createElement('pre');
      output.style.cssText = 'margin:0;font:13px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-word';
      output.append(highlightJson(pretty));

      const makeButton = (label, onClick) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', onClick);
        toolbar.append(button);
        return button;
      };
      let raw = false;
      const rawButton = makeButton('Raw', () => {
        raw = !raw;
        output.replaceChildren(raw ? source : highlightJson(pretty));
        rawButton.textContent = raw ? 'Pretty' : 'Raw';
      });
      makeButton('Copy', async () => toast((await copyText(raw ? source : pretty)) ? 'Copied JSON' : 'Copy failed'));

      document.body.replaceChildren(toolbar, output);
      document.body.style.cssText = 'margin:0 16px;background:#fff;color:#1a1a1a';
    },
  });

  register({
    id: 'edit-page',
    name: 'Edit any page',
    category: 'productivity',
    shortcut: 'Alt+Shift+E',
    description: 'Toggles editing mode so you can change any text on the page (useful for mock-ups and screenshots).',
    run() {
      command('Toggle page editing', 'alt+shift+e', () => {
        document.designMode = document.designMode === 'on' ? 'off' : 'on';
        toast(document.designMode === 'on' ? 'Page editing on' : 'Page editing off');
      }, { allowInInputs: true });
    },
  });

  register({
    id: 'image-alt-tooltip',
    name: 'Image alt text on hover',
    category: 'productivity',
    defaultEnabled: false,
    description: 'Shows an image\'s alt text as a tooltip when it has no tooltip of its own.',
    run() {
      document.addEventListener('mouseover', event => {
        const image = event.target;
        if (image instanceof HTMLImageElement && image.alt && !image.title) image.title = image.alt;
      }, true);
    },
  });

  register({
    id: 'color-picker',
    name: 'Colour picker',
    category: 'productivity',
    shortcut: 'Alt+Shift+Q',
    description: 'Pick any colour on screen with an eyedropper and copy its hex code (Chromium browsers).',
    run() {
      command('Pick a colour from the screen', 'alt+shift+q', async () => {
        if (!('EyeDropper' in globalThis)) {
          toast('The colour picker needs Chrome, Edge or another Chromium browser');
          return;
        }
        try {
          const { sRGBHex } = await new globalThis.EyeDropper().open();
          toast((await copyText(sRGBHex)) ? `Copied ${sRGBHex}` : sRGBHex, 3000);
        } catch {
          // The user cancelled with Esc.
        }
      });
    },
  });

  register({
    id: 'page-notes',
    name: 'Page notes',
    category: 'productivity',
    shortcut: 'Alt+Shift+N',
    description: 'Keep a private note for any page, saved on this device. A reminder appears when you come back.',
    async run() {
      const storageKey = `note:${location.origin}${location.pathname}`;
      const savedNote = async () => (await chrome.storage.local.get(storageKey))[storageKey] ?? '';

      command('Page notes', 'alt+shift+n', async () => {
        const note = await savedNote();
        togglePanel('notes', 'Notes for this page', panel => {
          const area = document.createElement('textarea');
          area.value = note;
          area.placeholder = 'Saved automatically, only on this device.';
          area.style.cssText = 'display:block;width:100%;min-height:160px;box-sizing:border-box;padding:8px;font:13px/1.5 system-ui,sans-serif;color:inherit;background:#fff;border:1px solid #ccd;border-radius:6px;resize:vertical';
          area.addEventListener('input', debounce(() => {
            if (area.value.trim()) chrome.storage.local.set({ [storageKey]: area.value });
            else chrome.storage.local.remove(storageKey);
          }, 400));
          panel.append(area);
          setTimeout(() => area.focus());
        });
      });

      if (await savedNote()) toast('You have a note for this page — Alt+Shift+N', 4000);
    },
  });

  // Converts a DOM fragment to Markdown. Covers the common inline and block elements; anything else keeps its text.
  function toMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent.replace(/\s+/g, ' ');
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return '';
    const inner = () => [...node.childNodes].map(toMarkdown).join('');
    switch (node.nodeName) {
      case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6':
        return `\n\n${'#'.repeat(Number(node.nodeName[1]))} ${inner().trim()}\n\n`;
      case 'P': case 'DIV': case 'SECTION': case 'ARTICLE':
        return `\n\n${inner().trim()}\n\n`;
      case 'BR':
        return '  \n';
      case 'STRONG': case 'B':
        return `**${inner()}**`;
      case 'EM': case 'I':
        return `*${inner()}*`;
      case 'CODE':
        return `\`${inner()}\``;
      case 'PRE':
        return `\n\n\`\`\`\n${node.textContent.replace(/\n$/, '')}\n\`\`\`\n\n`;
      case 'A': {
        const href = node.getAttribute('href');
        return href ? `[${inner().trim()}](${new URL(href, location.href).href})` : inner();
      }
      case 'IMG':
        return `![${node.getAttribute('alt') ?? ''}](${node.src})`;
      case 'UL': case 'OL':
        return `\n${inner()}\n`;
      case 'LI': {
        const list = node.parentElement;
        const marker = list?.nodeName === 'OL' ? `${[...list.children].indexOf(node) + 1}.` : '-';
        return `\n${marker} ${inner().trim()}`;
      }
      case 'BLOCKQUOTE':
        return `\n\n${inner().trim().split('\n').map(line => `> ${line}`).join('\n')}\n\n`;
      case 'SCRIPT': case 'STYLE': case 'NOSCRIPT':
        return '';
      default:
        return inner();
    }
  }

  register({
    id: 'selection-to-markdown',
    name: 'Copy selection as Markdown',
    category: 'productivity',
    shortcut: 'Alt+Shift+M',
    description: 'Copies the selected part of the page as Markdown, keeping headings, links, lists, emphasis and code.',
    run() {
      command('Copy selection as Markdown', 'alt+shift+m', async () => {
        const selection = getSelection();
        if (!selection?.rangeCount || selection.isCollapsed) {
          toast('Select some text first');
          return;
        }
        const fragment = document.createDocumentFragment();
        for (let index = 0; index < selection.rangeCount; index++) fragment.append(selection.getRangeAt(index).cloneContents());
        const markdown = toMarkdown(fragment).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        toast((await copyText(markdown)) ? 'Copied selection as Markdown' : 'Copy failed');
      });
    },
  });

  register({
    id: 'page-info',
    name: 'Page info',
    category: 'productivity',
    description: 'Shows word, link, image and heading counts, language, encoding and last-modified date. Run it from the command palette.',
    run() {
      command('Show page info', null, () => {
        const rows = [
          ['Title', document.title || '—'],
          ['Words', (document.body.innerText.match(/\S+/g)?.length ?? 0).toLocaleString()],
          ['Links', document.links.length.toLocaleString()],
          ['Images', document.images.length.toLocaleString()],
          ['Headings', document.querySelectorAll('h1, h2, h3, h4, h5, h6').length.toLocaleString()],
          ['Language', document.documentElement.lang || '—'],
          ['Encoding', document.characterSet],
          ['Content type', document.contentType],
          ['Last modified', document.lastModified],
        ];
        togglePanel('info', 'Page info', panel => {
          for (const [label, value] of rows) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:space-between;gap:16px;padding:3px 0;border-bottom:1px solid rgba(0,0,0,.06)';
            const name = document.createElement('span');
            name.style.color = '#666';
            name.textContent = label;
            const content = document.createElement('span');
            content.style.cssText = 'text-align:right;overflow-wrap:anywhere';
            content.textContent = value;
            row.append(name, content);
            panel.append(row);
          }
        });
      });
    },
  });

  // A tiny arithmetic parser (+ - * / ^ and brackets). Extension pages may not use eval.
  function calculate(expression) {
    const tokens = expression.replace(/(\d),(?=\d{3}\b)/g, '$1').match(/\d*\.?\d+|[-+*/^()]/g) ?? [];
    let position = 0;
    const peek = () => tokens[position];
    const next = () => tokens[position++];

    function atom() {
      const token = next();
      if (token === '(') {
        const value = sum();
        if (next() !== ')') throw new Error('Unbalanced brackets');
        return value;
      }
      const value = Number(token);
      if (token === undefined || Number.isNaN(value)) throw new Error('Expected a number');
      return value;
    }
    function unary() {
      if (peek() === '-') { next(); return -unary(); }
      if (peek() === '+') { next(); return unary(); }
      const base = atom();
      if (peek() === '^') { next(); return base ** unary(); }
      return base;
    }
    function product() {
      let value = unary();
      while (peek() === '*' || peek() === '/') value = next() === '*' ? value * unary() : value / unary();
      return value;
    }
    function sum() {
      let value = product();
      while (peek() === '+' || peek() === '-') value = next() === '+' ? value + product() : value - product();
      return value;
    }

    const result = sum();
    if (position !== tokens.length) throw new Error('Unexpected input');
    return result;
  }

  register({
    id: 'selection-calculator',
    name: 'Calculate selected maths',
    category: 'productivity',
    description: 'Select a sum like "(1,200 + 350) * 1.2" to see the result instantly.',
    run() {
      document.addEventListener('selectionchange', debounce(() => {
        const text = selectedText();
        // Needs an operator and a digit; skips dates and phone numbers (digits and dashes only).
        if (text.length > 200 || !/^[\d\s+\-*/^().,]+$/.test(text) || !/\d/.test(text) || !/[+\-*/^]/.test(text) || /^[\d-]+$/.test(text)) return;
        try {
          const result = calculate(text);
          if (Number.isFinite(result)) toast(`= ${result.toLocaleString(undefined, { maximumFractionDigits: 10 })}`, 4000);
        } catch {
          // Not a valid expression; stay quiet.
        }
      }, 300));
    },
  });

  const SKIP_TEXT_IN = /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT|SELECT|OPTION)$/;

  function wrapInMark(textNode, className, group) {
    const mark = document.createElement('mark');
    mark.className = className;
    mark.dataset.group = group;
    textNode.parentNode.insertBefore(mark, textNode);
    mark.append(textNode);
    return mark;
  }

  // Wraps the text covered by `range` in <mark> elements, splitting text nodes at the range's ends.
  function markRange(range, className, group) {
    const { startContainer, startOffset, endContainer, endOffset, commonAncestorContainer: root } = range;
    const textNodes = [];
    if (root.nodeType === Node.TEXT_NODE) {
      textNodes.push(root);
    } else {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: node => range.intersectsNode(node) && node.textContent.trim() && !SKIP_TEXT_IN.test(node.parentNode.nodeName)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
      });
      while (walker.nextNode()) textNodes.push(walker.currentNode);
    }
    return textNodes.map(node => {
      let text = node;
      if (node === endContainer) node.splitText(endOffset); // `node` keeps the part before the end.
      if (node === startContainer && startOffset > 0) text = node.splitText(startOffset);
      return wrapInMark(text, className, group);
    });
  }

  function removeMarks(className) {
    const marks = document.querySelectorAll(`mark.${className}`);
    for (const mark of marks) {
      const parent = mark.parentNode;
      mark.replaceWith(...mark.childNodes);
      parent.normalize();
    }
    return marks.length;
  }

  register({
    id: 'highlighter',
    name: 'Highlighter',
    category: 'productivity',
    shortcut: 'Alt+Shift+Z',
    description: 'Highlight selected text in yellow while you read, then copy all your highlights at once. Highlights last until you leave the page.',
    run() {
      addStyle('mark.browsekit-highlight { background: #ffe066 !important; color: inherit !important; border-radius: 2px; }');
      let nextGroup = 1;
      command('Highlight selection', 'alt+shift+z', () => {
        const selection = getSelection();
        if (!selection?.rangeCount || selection.isCollapsed) {
          toast('Select some text to highlight');
          return;
        }
        markRange(selection.getRangeAt(0), 'browsekit-highlight', nextGroup++);
        selection.removeAllRanges();
      });
      command('Copy all highlights', null, async () => {
        const groups = new Map();
        for (const mark of document.querySelectorAll('mark.browsekit-highlight')) {
          groups.set(mark.dataset.group, (groups.get(mark.dataset.group) ?? '') + mark.textContent);
        }
        if (!groups.size) return false;
        const text = [...groups.values()].map(highlight => `> ${highlight.trim()}`).join('\n\n');
        toast((await copyText(`${text}\n\n— ${document.title}\n${location.href}`)) ? `Copied ${groups.size} highlight(s)` : 'Copy failed');
      });
      command('Clear highlights', null, () => {
        if (!removeMarks('browsekit-highlight')) return false;
        toast('Highlights cleared');
      });
    },
  });

  const MAX_MATCHES = 1000;

  register({
    id: 'highlight-matches',
    name: 'Highlight all matches',
    category: 'productivity',
    description: 'Select a word or phrase and highlight every place it appears on the page. Run again to clear.',
    run() {
      addStyle('mark.browsekit-match { background: #9fe0ff !important; color: inherit !important; border-radius: 2px; }');
      command('Highlight all matches of selection', null, () => {
        if (removeMarks('browsekit-match')) {
          toast('Match highlights cleared');
          return;
        }
        const term = selectedText();
        if (term.length < 2 || term.length > 100) {
          toast('Select a word or phrase first');
          return;
        }
        getSelection().removeAllRanges();
        const needle = term.toLowerCase();
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
          acceptNode: node => SKIP_TEXT_IN.test(node.parentNode.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
        });
        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);

        let count = 0;
        for (const node of textNodes) {
          const haystack = node.textContent.toLowerCase();
          const positions = [];
          for (let index = haystack.indexOf(needle); index !== -1 && count + positions.length < MAX_MATCHES; index = haystack.indexOf(needle, index + needle.length)) {
            positions.push(index);
          }
          // Work backwards so splitting a later match never shifts an earlier one.
          for (const index of positions.reverse()) {
            node.splitText(index + needle.length);
            wrapInMark(node.splitText(index), 'browsekit-match', 0);
          }
          count += positions.length;
        }
        toast(`${count.toLocaleString()} match(es)${count >= MAX_MATCHES ? ' (stopped at 1,000)' : ''} — run again to clear`);
        document.querySelector('mark.browsekit-match')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    },
  });

  register({
    id: 'define-word',
    name: 'Define selected word',
    category: 'productivity',
    description: 'Shows dictionary definitions for the selected English word (sends only that word to dictionaryapi.dev). Run it from the command palette.',
    run() {
      command('Define selected word', null, async () => {
        const word = selectedText();
        if (!/^[\p{L}'-]{2,40}$/u.test(word)) {
          toast('Select a single word first');
          return;
        }
        let entry;
        try {
          const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`);
          if (response.ok) [entry] = await response.json();
        } catch {
          // Network error or blocked by the page; reported below.
        }
        if (!entry) {
          toast(`No definition found for “${word}”`);
          return;
        }
        togglePanel('define', `${entry.word}${entry.phonetic ? `  ${entry.phonetic}` : ''}`, panel => {
          for (const meaning of entry.meanings.slice(0, 3)) {
            const partOfSpeech = document.createElement('div');
            partOfSpeech.style.cssText = 'margin-top:6px;font-style:italic;color:#666';
            partOfSpeech.textContent = meaning.partOfSpeech;
            const list = document.createElement('ol');
            list.style.cssText = 'margin:4px 0;padding-left:20px';
            for (const definition of meaning.definitions.slice(0, 3)) {
              const item = document.createElement('li');
              item.textContent = definition.definition;
              list.append(item);
            }
            panel.append(partOfSpeech, list);
          }
        });
      });
    },
  });

  register({
    id: 'article-to-markdown',
    name: 'Copy article as Markdown',
    category: 'productivity',
    description: 'Copies the page\'s main article as clean Markdown with its title and source link — great for notes apps. Run it from the command palette.',
    run() {
      command('Copy article as Markdown', null, async () => {
        const content = mainContent();
        if (!content) return false;
        const clone = content.cloneNode(true);
        clone.querySelectorAll('script, style, nav, aside, footer, form, button, iframe, noscript, [aria-hidden="true"]').forEach(element => element.remove());
        const body = toMarkdown(clone).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        const markdown = `# ${document.title}\n\nSource: ${location.href}\n\n${body}`;
        toast((await copyText(markdown)) ? `Copied article (${body.split(/\s+/).length.toLocaleString()} words)` : 'Copy failed');
      });
    },
  });

  register({
    id: 'print-friendly',
    name: 'Print without clutter',
    category: 'productivity',
    description: 'Prints the page without menus, sidebars, footers, ads or share buttons, and with link addresses written out.',
    run() {
      command('Print without clutter', null, () => {
        const style = addStyle(`
          @media print {
            nav, aside, footer, [role="banner"], [role="navigation"], [role="complementary"], [role="contentinfo"],
            iframe, [class*="advert"], [id*="cookie"], [class*="share"], [class*="social"], [class*="newsletter"] { display: none !important; }
            a[href^="http"]::after { content: " (" attr(href) ")"; font-size: .8em; color: #555; }
          }`);
        addEventListener('afterprint', () => style.remove(), { once: true });
        print();
      });
    },
  });

  register({
    id: 'list-images',
    name: 'List all images',
    category: 'productivity',
    description: 'Shows a grid of every image on the page; click one to open it full size. Run it from the command palette.',
    run() {
      command('List all images', null, () => {
        const sources = [...new Set([...document.images]
          .map(image => image.currentSrc || image.src)
          .filter(source => source && !source.startsWith('data:')))];
        if (!sources.length) {
          toast('No images on this page');
          return;
        }
        togglePanel('images', `${sources.length} image(s)`, panel => {
          const grid = document.createElement('div');
          grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px';
          for (const source of sources.slice(0, 200)) {
            const link = document.createElement('a');
            link.href = source;
            link.target = '_blank';
            link.rel = 'noopener';
            link.title = source;
            const image = document.createElement('img');
            image.src = source;
            image.loading = 'lazy';
            image.alt = '';
            image.style.cssText = 'display:block;width:100%;aspect-ratio:1;object-fit:cover;border-radius:4px;background:#eee';
            link.append(image);
            grid.append(link);
          }
          panel.append(grid);
        });
      });
    },
  });

  function decodeText(text) {
    if (/%[0-9a-f]{2}/i.test(text)) {
      try {
        return decodeURIComponent(text.replace(/\+/g, ' '));
      } catch {
        // Not valid URL encoding; try Base64 next.
      }
    }
    if (/^[A-Za-z0-9+/_-]{8,}={0,2}$/.test(text)) {
      try {
        const standard = text.replace(/-/g, '+').replace(/_/g, '/');
        const binary = atob(standard.padEnd(Math.ceil(standard.length / 4) * 4, '='));
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
        if (!/[\x00-\x08\x0e-\x1f]/.test(decoded)) return decoded;
      } catch {
        // Not Base64 text.
      }
    }
    return null;
  }

  register({
    id: 'decode-selection',
    name: 'Decode selected text',
    category: 'productivity',
    description: 'Decodes selected URL-encoded (%20…) or Base64 text and copies the result. Run it from the command palette.',
    run() {
      command('Decode selected text (URL / Base64)', null, async () => {
        const text = selectedText();
        if (!text) {
          toast('Select some text first');
          return;
        }
        const decoded = decodeText(text);
        if (decoded === null) {
          toast('The selection is not URL-encoded or Base64 text');
          return;
        }
        const preview = decoded.length > 120 ? `${decoded.slice(0, 120)}…` : decoded;
        toast(`${(await copyText(decoded)) ? 'Copied: ' : ''}${preview}`, 5000);
      });
    },
  });

  register({
    id: 'format-json-selection',
    name: 'Format selected JSON',
    category: 'productivity',
    description: 'Pretty-prints the selected JSON and copies it. Run it from the command palette.',
    run() {
      command('Format selected JSON', null, async () => {
        let pretty;
        try {
          pretty = JSON.stringify(JSON.parse(selectedText()), null, 2);
        } catch {
          toast('The selection is not valid JSON');
          return;
        }
        toast((await copyText(pretty)) ? 'Copied formatted JSON' : 'Copy failed');
      });
    },
  });

  register({
    id: 'save-page-html',
    name: 'Save page as HTML',
    category: 'productivity',
    description: 'Downloads a snapshot of the page as it looks now (without scripts) as a single HTML file. Run it from the command palette.',
    run() {
      command('Save page as HTML file', null, () => {
        const snapshot = document.documentElement.cloneNode(true);
        snapshot.querySelectorAll('script, noscript, browsekit-palette, browsekit-reader, #browsekit-panel').forEach(element => element.remove());
        if (!snapshot.querySelector('base')) {
          const base = document.createElement('base');
          base.href = location.href; // Keeps relative images, styles and links working offline.
          snapshot.querySelector('head')?.prepend(base);
        }
        const html = `<!doctype html>\n<!-- Saved by Browsekit from ${location.href} on ${new Date().toISOString()} -->\n${snapshot.outerHTML}`;
        downloadFile(html, `${(document.title || location.hostname).slice(0, 80)}.html`, 'text/html');
      });
    },
  });
})();
