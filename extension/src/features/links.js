(() => {
  const { register, command, addStyle, toast, copyText, isTyping, selectedText } = globalThis.Browsekit;

  const TRACKING_PARAM = /^(utm_[a-z_]+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|yclid|mc_cid|mc_eid|igshid|_hsenc|_hsmi|mkt_tok)$/i;

  // Returns the URL without tracking parameters, or null when there was nothing to remove.
  function withoutTracking(href) {
    let url;
    try {
      url = new URL(href, location.href);
    } catch {
      return null;
    }
    if (!/^https?:$/.test(url.protocol)) return null;
    const trackingKeys = [...url.searchParams.keys()].filter(key => TRACKING_PARAM.test(key));
    if (!trackingKeys.length) return null;
    for (const key of trackingKeys) url.searchParams.delete(key);
    return url.href;
  }

  const cleanLocation = () => withoutTracking(location.href) ?? location.href;

  register({
    id: 'strip-tracking-params',
    name: 'Strip tracking parameters',
    category: 'links',
    description: 'Removes utm_*, fbclid, gclid and similar parameters from the address bar and from links you click.',
    run() {
      const cleaned = withoutTracking(location.href);
      if (cleaned) history.replaceState(history.state, '', cleaned);
      const cleanLink = event => {
        const link = event.target.closest?.('a[href]');
        const href = link instanceof HTMLAnchorElement && withoutTracking(link.href);
        if (href) link.href = href;
      };
      document.addEventListener('click', cleanLink, true);
      document.addEventListener('auxclick', cleanLink, true);
    },
  });

  register({
    id: 'external-links-new-tab',
    name: 'Open external links in a new tab',
    category: 'links',
    defaultEnabled: false,
    description: 'Links to other websites open in a new tab; links within the same site behave normally.',
    run() {
      document.addEventListener('click', event => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const link = event.target.closest?.('a[href]');
        if (!(link instanceof HTMLAnchorElement)) return;
        if (!/^https?:$/.test(link.protocol) || link.hostname === location.hostname) return;
        link.target = '_blank';
        link.relList.add('noopener', 'noreferrer');
      }, true);
    },
  });

  register({
    id: 'mark-external-links',
    name: 'Mark external links',
    category: 'links',
    defaultEnabled: false,
    description: 'Adds a small ↗ after links that lead to a different website.',
    run() {
      addStyle(`a[href^="http"]:not([href*="//${location.host}"])::after { content: "\\2197"; font-size: .75em; margin-left: 2px; opacity: .6; }`);
    },
  });

  register({
    id: 'copy-markdown-link',
    name: 'Copy page as Markdown link',
    category: 'links',
    shortcut: 'Alt+Shift+C',
    description: 'Copies the page as [Title](URL), with tracking parameters removed.',
    run() {
      command('Copy page as Markdown link', 'alt+shift+c', async () => {
        // Escape backslashes as well as brackets, or a title ending in "\" would escape the closing bracket.
        const title = document.title.replace(/[\\[\]]/g, '\\$&');
        // Parentheses would end the Markdown link early, so percent-encode them.
        const url = cleanLocation().replace(/\(/g, '%28').replace(/\)/g, '%29');
        const copied = await copyText(`[${title}](${url})`);
        toast(copied ? 'Copied Markdown link' : 'Copy failed');
      });
    },
  });

  register({
    id: 'copy-clean-url',
    name: 'Copy clean URL',
    category: 'links',
    shortcut: 'Alt+Shift+U',
    description: 'Copies the current URL with tracking parameters removed.',
    run() {
      command('Copy clean URL', 'alt+shift+u', async () => {
        const copied = await copyText(cleanLocation());
        toast(copied ? 'Copied clean URL' : 'Copy failed');
      });
    },
  });

  register({
    id: 'go-up-url',
    name: 'Go up one level',
    category: 'links',
    shortcut: 'Alt+Shift+↑',
    description: 'Navigates to the parent path, e.g. /docs/guide/intro → /docs/guide/.',
    run() {
      command('Go up one URL level', 'alt+shift+arrowup', () => {
        const segments = location.pathname.split('/').filter(Boolean);
        if (!segments.length) {
          toast('Already at the top level');
          return;
        }
        segments.pop();
        location.href = `${location.origin}/${segments.join('/')}${segments.length ? '/' : ''}`;
      });
    },
  });

  const HINT_TARGETS = [
    'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea', 'summary',
    '[role="button"]', '[role="link"]', '[role="tab"]', '[onclick]', '[contenteditable="true"]',
  ].join(',');
  const HINT_KEYS = 'sadfjklewcmpgh';

  // Clickable elements that are actually visible in the viewport (not scrolled away or covered).
  function hintTargets() {
    const targets = [];
    for (const element of document.querySelectorAll(HINT_TARGETS)) {
      const rect = element.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2 || rect.bottom < 0 || rect.right < 0 || rect.top > innerHeight || rect.left > innerWidth) continue;
      const x = Math.min(Math.max(rect.left + rect.width / 2, 0), innerWidth - 1);
      const y = Math.min(Math.max(rect.top + rect.height / 2, 0), innerHeight - 1);
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === element || element.contains(hit))) targets.push({ element, rect });
    }
    return targets.slice(0, HINT_KEYS.length ** 2);
  }

  function hintLabel(index, count) {
    const n = HINT_KEYS.length;
    return count <= n ? HINT_KEYS[index] : HINT_KEYS[Math.floor(index / n)] + HINT_KEYS[index % n];
  }

  function activate(element, inNewTab) {
    if (inNewTab && element instanceof HTMLAnchorElement) {
      window.open(element.href, '_blank', 'noopener');
    } else if (isTyping(element)) {
      element.focus();
    } else {
      element.focus({ preventScroll: true });
      element.click();
    }
  }

  function showLinkHints() {
    const targets = hintTargets();
    if (!targets.length) {
      toast('No clickable elements in view');
      return;
    }
    const layer = document.createElement('div');
    layer.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none';
    const hints = targets.map(({ element, rect }, index) => {
      const label = hintLabel(index, targets.length);
      const badge = document.createElement('span');
      badge.textContent = label.toUpperCase();
      badge.style.cssText = `position:fixed;left:${Math.max(rect.left, 0)}px;top:${Math.max(rect.top, 0)}px;padding:0 3px;border:1px solid #c9a400;border-radius:3px;background:#ffd84d;color:#000;font:bold 11px/1.4 ui-monospace,Consolas,monospace;box-shadow:0 1px 3px rgba(0,0,0,.3)`;
      layer.append(badge);
      return { element, label, badge };
    });
    document.documentElement.append(layer);

    let typed = '';
    const finish = () => {
      layer.remove();
      removeEventListener('keydown', onHintKey, true);
      removeEventListener('scroll', finish, true);
    };
    function onHintKey(event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const key = event.key.toLowerCase();
      if (key === 'escape') {
        finish();
        return;
      }
      if (key === 'backspace') typed = typed.slice(0, -1);
      else if (key.length === 1 && HINT_KEYS.includes(key)) typed += key;
      else return;

      const matching = hints.filter(hint => hint.label.startsWith(typed));
      for (const hint of hints) hint.badge.style.display = matching.includes(hint) ? '' : 'none';
      const exact = matching.find(hint => hint.label === typed);
      if (exact) {
        finish();
        activate(exact.element, event.shiftKey);
      } else if (!matching.length) {
        finish();
      }
    }
    addEventListener('keydown', onHintKey, true);
    addEventListener('scroll', finish, { capture: true, once: true });
  }

  register({
    id: 'link-hints',
    name: 'Link hints',
    category: 'links',
    shortcut: 'Alt+Shift+F',
    description: 'Labels every visible link and button with letters; type a label to click it (hold Shift to open a link in a new tab).',
    run() {
      command('Show link hints', 'alt+shift+f', showLinkHints);
    },
  });

  register({
    id: 'copy-all-links',
    name: 'Copy all links',
    category: 'links',
    description: 'Copies every unique web link on the page, one per line. Run it from the command palette.',
    run() {
      command('Copy all links on page', null, async () => {
        const urls = [...new Set([...document.querySelectorAll('a[href]')]
          .map(link => link.href)
          .filter(href => /^https?:/.test(href)))];
        if (!urls.length) {
          toast('No links found');
          return;
        }
        toast((await copyText(urls.join('\n'))) ? `Copied ${urls.length} links` : 'Copy failed');
      });
    },
  });

  register({
    id: 'wayback-machine',
    name: 'Open in Wayback Machine',
    category: 'links',
    description: 'Opens the archived copies of the current page on web.archive.org — handy for dead or changed pages.',
    run() {
      command('Open in Wayback Machine', null, () => {
        window.open(`https://web.archive.org/web/*/${location.href}`, '_blank', 'noopener');
      });
    },
  });

  register({
    id: 'open-selection-as-link',
    name: 'Open selected address',
    category: 'links',
    description: 'Opens a web address you selected in plain text (e.g. "example.com/page") in a new tab. Run it from the command palette.',
    run() {
      command('Open selected text as a link', null, () => {
        const text = selectedText().replace(/\s+/g, '');
        if (!/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(text)) {
          toast('The selection is not a web address');
          return;
        }
        window.open(/^https?:\/\//i.test(text) ? text : `https://${text}`, '_blank', 'noopener');
      });
    },
  });

  // Outbound "you are leaving this site" wrappers, and the query parameter holding the real address.
  const REDIRECT_WRAPPERS = [
    { host: /(^|\.)google\.[a-z.]+$/, path: /^\/url$/, params: ['q', 'url'] },
    { host: /^l\.(facebook|messenger)\.com$/, path: /^\/l\.php$/, params: ['u'] },
    { host: /^l\.instagram\.com$/, path: /^\/$/, params: ['u'] },
    { host: /^(www\.)?youtube\.com$/, path: /^\/redirect$/, params: ['q'] },
    { host: /^steamcommunity\.com$/, path: /^\/linkfilter\/?$/, params: ['url', 'u'] },
    { host: /^out\.reddit\.com$/, path: /./, params: ['url'] },
    { host: /^t\.umblr\.com$/, path: /^\/redirect$/, params: ['z'] },
    { host: /^(www\.)?linkedin\.com$/, path: /^\/redir\/redirect/, params: ['url'] },
    { host: /^slack-redir\.net$/, path: /^\/link$/, params: ['url'] },
  ];
  const URL_SHORTENERS = /^(t\.co|bit\.ly|lnkd\.in|buff\.ly|ow\.ly|tinyurl\.com|goo\.gl|youtu\.be|amzn\.to|amzn\.eu|fb\.me|trib\.al|dlvr\.it|rebrand\.ly)$/;

  // The real destination behind a redirect wrapper, or null when `href` is not one.
  function unwrapRedirect(href) {
    let url;
    try {
      url = new URL(href);
    } catch {
      return null;
    }
    const wrapper = REDIRECT_WRAPPERS.find(candidate => candidate.host.test(url.hostname) && candidate.path.test(url.pathname));
    for (const param of wrapper?.params ?? []) {
      const target = url.searchParams.get(param);
      if (target && /^https?:\/\//i.test(target)) return target;
    }
    return null;
  }

  register({
    id: 'skip-redirect-pages',
    name: 'Skip redirect pages',
    category: 'links',
    description: 'Links that pass through tracking redirects (Google, Facebook, YouTube, Reddit, LinkedIn, Steam, Slack…) go straight to their destination.',
    run() {
      const rewrite = event => {
        const link = event.target.closest?.('a[href]');
        const target = link instanceof HTMLAnchorElement && unwrapRedirect(link.href);
        if (target) link.href = target;
      };
      // Some sites swap the address in on mousedown, so rewrite at every step of a click.
      for (const type of ['mousedown', 'click', 'auxclick']) document.addEventListener(type, rewrite, true);
    },
  });

  register({
    id: 'link-mismatch-warning',
    name: 'Deceptive link warning',
    category: 'links',
    description: 'Warns you when a link shows one web address but actually leads to a different site — a common phishing trick.',
    run() {
      const warned = new WeakSet();
      const bareHost = host => host.toLowerCase().replace(/^www\./, '');
      document.addEventListener('mouseover', event => {
        const link = event.target.closest?.('a[href]');
        if (!(link instanceof HTMLAnchorElement) || warned.has(link) || !/^https?:$/.test(link.protocol)) return;
        const shown = link.textContent.trim().match(/^(?:https?:\/\/)?((?:[\w-]+\.)+[a-z]{2,})(?:[/:?#]\S*)?$/i)?.[1];
        if (!shown) return;
        const destination = new URL(unwrapRedirect(link.href) ?? link.href);
        const shownHost = bareHost(shown);
        const realHost = bareHost(destination.hostname);
        if (URL_SHORTENERS.test(realHost) || realHost === shownHost || realHost.endsWith(`.${shownHost}`) || shownHost.endsWith(`.${realHost}`)) return;
        warned.add(link);
        toast(`⚠ This link shows ${shownHost} but goes to ${realHost}`, 5000);
      });
    },
  });

  register({
    id: 'highlight-visited-links',
    name: 'Highlight visited links',
    category: 'links',
    defaultEnabled: false,
    description: 'Colours links you have already visited purple, even on sites that hide the difference.',
    run() {
      addStyle('a:visited, a:visited * { color: #8e44ad !important; }');
    },
  });
})();
