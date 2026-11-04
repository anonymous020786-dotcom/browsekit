(() => {
  const {
    register, command, onKey, addStyle, toast, togglePanel, selectedText, debounce, mainContent: findMainContent,
  } = globalThis.Browsekit;

  register({
    id: 'reading-progress-bar',
    name: 'Reading progress bar',
    category: 'reading',
    description: 'A thin bar at the top of the page shows how far you have scrolled.',
    run() {
      const bar = document.createElement('div');
      bar.style.cssText = 'position:fixed;top:0;left:0;height:3px;width:0;background:#4f8cff;z-index:2147483647;pointer-events:none;transition:width .1s linear';
      document.documentElement.append(bar);
      const update = () => {
        const scrollable = document.documentElement.scrollHeight - innerHeight;
        bar.style.width = scrollable > 0 ? `${(scrollY / scrollable) * 100}%` : '0';
      };
      addEventListener('scroll', update, { passive: true });
      addEventListener('resize', update);
      update();
    },
  });

  register({
    id: 'scroll-to-top',
    name: 'Scroll-to-top button',
    category: 'reading',
    description: 'Shows a ↑ button in the corner after you scroll down two screens.',
    run() {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '↑';
      button.title = 'Back to top';
      button.style.cssText = 'position:fixed;right:20px;bottom:20px;width:40px;height:40px;padding:0;border:none;border-radius:50%;background:rgba(30,30,36,.8);color:#fff;font:20px/40px system-ui;cursor:pointer;z-index:2147483646;display:none';
      button.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
      document.documentElement.append(button);
      addEventListener('scroll', () => {
        button.style.display = scrollY > innerHeight * 2 ? 'block' : 'none';
      }, { passive: true });
    },
  });

  register({
    id: 'reading-time',
    name: 'Reading time estimate',
    category: 'reading',
    description: 'On article pages, briefly shows the word count and an estimated reading time (230 wpm).',
    run() {
      const article = document.querySelector('article');
      if (!article) return;
      const words = article.innerText.trim().split(/\s+/).length;
      if (words < 300) return;
      toast(`≈ ${Math.ceil(words / 230)} min read · ${words.toLocaleString()} words`, 4000);
    },
  });

  register({
    id: 'dark-mode-toggle',
    name: 'Quick dark mode',
    category: 'reading',
    shortcut: 'Alt+Shift+D',
    description: 'Inverts page colours while keeping images and video natural. Remembered per site.',
    async run() {
      const storageKey = `dark:${location.hostname}`;
      const css = `
        html { filter: invert(1) hue-rotate(180deg) !important; background: #fff !important; }
        img, video, picture, canvas, iframe, [style*="background-image"] { filter: invert(1) hue-rotate(180deg) !important; }`;
      let style = null;
      const apply = on => {
        if (on && !style) style = addStyle(css);
        if (!on && style) {
          style.remove();
          style = null;
        }
      };
      // Register before awaiting storage, so the command exists the moment the page is ready.
      command('Toggle dark mode', 'alt+shift+d', async () => {
        const on = !style;
        apply(on);
        await chrome.storage.local.set({ [storageKey]: on });
        toast(on ? 'Dark mode on for this site' : 'Dark mode off');
      });
      if ((await chrome.storage.local.get(storageKey))[storageKey]) apply(true);
    },
  });

  register({
    id: 'page-outline',
    name: 'Page outline',
    category: 'reading',
    shortcut: 'Alt+Shift+O',
    description: 'Opens a clickable table of contents built from the page headings.',
    run() {
      command('Show page outline', 'alt+shift+o', () => {
        const headings = [...document.querySelectorAll('h1, h2, h3, h4')]
          .filter(heading => heading.offsetParent !== null && heading.textContent.trim());
        if (!headings.length) {
          toast('No headings on this page');
          return;
        }
        togglePanel('outline', 'Page outline', panel => {
          for (const heading of headings) {
            const item = document.createElement('a');
            const level = Number(heading.tagName[1]);
            item.href = '#';
            item.textContent = heading.textContent.trim().slice(0, 120);
            item.style.cssText = `display:block;padding:3px 0 3px ${(level - 1) * 12}px;color:inherit;text-decoration:none;font-weight:${level === 1 ? 600 : 400}`;
            item.addEventListener('click', event => {
              event.preventDefault();
              heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            panel.append(item);
          }
        });
      });
    },
  });

  const READER_CSS = `
    .page { position: fixed; inset: 0; overflow: auto; background: #faf8f3; color: #1d1d1f; outline: none; }
    article { max-width: 680px; margin: 0 auto; padding: 56px 24px 96px; font: 19px/1.7 Georgia, 'Iowan Old Style', serif; }
    h1 { font: 700 32px/1.25 system-ui, sans-serif; margin: 0 0 28px; }
    h2, h3, h4 { font-family: system-ui, sans-serif; line-height: 1.3; margin: 1.6em 0 .6em; }
    img, video, figure { max-width: 100%; height: auto; }
    figure { margin: 1.5em 0; }
    figcaption { font-size: 14px; color: #6b6b70; }
    pre { overflow: auto; padding: 12px; background: rgba(0,0,0,.05); border-radius: 6px; font-size: 14px; }
    code { font-family: ui-monospace, Consolas, monospace; font-size: .9em; }
    a { color: #2457c5; }
    blockquote { margin: 1em 0; padding-left: 1em; border-left: 3px solid #ccc; color: #555; }
    .close { position: fixed; top: 16px; right: 20px; padding: 6px 12px; font: 600 13px system-ui, sans-serif; color: inherit;
      background: #fff; border: 1px solid rgba(0,0,0,.15); border-radius: 6px; cursor: pointer; }
    @media (prefers-color-scheme: dark) {
      .page { background: #1b1c1f; color: #e6e6e8; }
      a { color: #8fb1ff; }
      .close { background: #2a2c31; border-color: rgba(255,255,255,.15); }
      figcaption, blockquote { color: #a0a0a6; }
      pre { background: rgba(255,255,255,.07); }
    }`;

  const READER_JUNK = 'script, style, link, iframe, form, button, input, nav, aside, footer, noscript, [aria-hidden="true"], [hidden]';

  register({
    id: 'reader-mode',
    name: 'Reader mode',
    category: 'reading',
    shortcut: 'Alt+Shift+R',
    description: 'Shows the main article in a clean, distraction-free view that follows your light/dark setting. Esc closes it.',
    run() {
      let host = null;
      let previousOverflow = '';
      const close = () => {
        host?.remove();
        host = null;
        document.documentElement.style.overflow = previousOverflow;
      };

      command('Toggle reader mode', 'alt+shift+r', () => {
        if (host) {
          close();
          return;
        }
        const content = findMainContent();
        if (!content) {
          toast('Could not find the main text on this page');
          return;
        }

        const title = document.createElement('h1');
        title.textContent = document.querySelector('h1')?.textContent.trim() || document.title;
        const body = content.cloneNode(true);
        body.querySelectorAll(READER_JUNK).forEach(element => element.remove());
        for (const element of [body, ...body.querySelectorAll('*')]) {
          for (const attribute of ['style', 'class', 'id']) element.removeAttribute(attribute);
        }
        for (const image of body.querySelectorAll('img')) {
          const lazySource = image.dataset.src || image.dataset.lazySrc;
          if (lazySource) image.src = lazySource;
        }
        const duplicateHeading = body.querySelector('h1');
        if (duplicateHeading?.textContent.trim() === title.textContent) duplicateHeading.remove();

        const article = document.createElement('article');
        article.append(title, body);
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'close';
        closeButton.textContent = 'Close (Esc)';
        closeButton.addEventListener('click', close);
        const page = document.createElement('div');
        page.className = 'page';
        page.tabIndex = -1;
        page.append(closeButton, article);
        const style = document.createElement('style');
        style.textContent = READER_CSS;

        host = document.createElement('browsekit-reader');
        host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:block';
        host.attachShadow({ mode: 'open' }).append(style, page);
        previousOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        document.documentElement.append(host);
        page.focus(); // So Space and the arrow keys scroll the reader.
      });

      onKey('escape', () => {
        if (!host) return false;
        close();
      });
    },
  });

  // Chrome cuts off very long utterances, so speech is queued in sentence-sized chunks.
  function speechChunks(text) {
    const sentences = text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*\s*/g) ?? [];
    const chunks = [];
    let current = '';
    for (const sentence of sentences) {
      if (current && (current + sentence).length > 220) {
        chunks.push(current);
        current = '';
      }
      current += sentence;
    }
    if (current.trim()) chunks.push(current);
    return chunks;
  }

  register({
    id: 'read-aloud',
    name: 'Read aloud',
    category: 'reading',
    shortcut: 'Alt+Shift+V',
    description: 'Reads the selected text, or the main article, aloud with your system voice. Press again to stop.',
    run() {
      command('Read aloud / stop reading', 'alt+shift+v', () => {
        if (speechSynthesis.speaking) {
          speechSynthesis.cancel();
          toast('Stopped reading');
          return;
        }
        const text = selectedText() || findMainContent()?.innerText.trim();
        if (!text) {
          toast('Nothing to read on this page');
          return;
        }
        for (const chunk of speechChunks(text)) {
          const utterance = new SpeechSynthesisUtterance(chunk);
          utterance.lang = document.documentElement.lang || navigator.language;
          speechSynthesis.speak(utterance);
        }
        toast('Reading aloud — press Alt+Shift+V to stop');
      });
    },
  });

  register({
    id: 'auto-scroll',
    name: 'Auto-scroll',
    category: 'reading',
    shortcut: 'Alt+Shift+J',
    description: 'Scrolls the page slowly and steadily for hands-free reading. Press again, or Esc, to stop.',
    run() {
      const PIXELS_PER_SECOND = 40;
      let frame = null;
      const stop = message => {
        cancelAnimationFrame(frame);
        frame = null;
        toast(message);
      };

      command('Toggle auto-scroll', 'alt+shift+j', () => {
        if (frame !== null) {
          stop('Auto-scroll off');
          return;
        }
        let last = performance.now();
        let pending = 0;
        const step = now => {
          pending += ((now - last) / 1000) * PIXELS_PER_SECOND;
          last = now;
          if (pending >= 1) {
            scrollBy(0, Math.floor(pending));
            pending -= Math.floor(pending);
          }
          if (innerHeight + scrollY >= document.documentElement.scrollHeight - 1) {
            stop('Reached the end of the page');
            return;
          }
          frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
        toast('Auto-scroll on');
      });

      onKey('escape', () => {
        if (frame === null) return false;
        stop('Auto-scroll off');
      }, { capture: false });
    },
  });

  register({
    id: 'comfortable-line-width',
    name: 'Comfortable line width',
    category: 'reading',
    description: 'Narrows very wide article text to about 75 characters per line. Toggle it from the command palette.',
    run() {
      let content = null;
      let previousStyle = '';
      command('Toggle comfortable line width', null, () => {
        if (content) {
          content.style.cssText = previousStyle;
          content = null;
          toast('Line width restored');
          return;
        }
        content = findMainContent();
        if (!content) return false;
        previousStyle = content.style.cssText;
        content.style.setProperty('max-width', '75ch', 'important');
        content.style.setProperty('margin-inline', 'auto', 'important');
        toast('Comfortable line width on');
      });
    },
  });

  register({
    id: 'readable-font',
    name: 'Readable font',
    category: 'reading',
    description: 'Switches page text to a plain, highly legible font with a little extra spacing. Toggle it from the command palette.',
    run() {
      let style = null;
      command('Toggle readable font', null, () => {
        if (style) {
          style.remove();
          style = null;
          toast('Original fonts restored');
          return;
        }
        // Icon fonts, code and SVG text keep their own fonts.
        style = addStyle(`
          body :not(i):not(code):not(pre):not(kbd):not(samp):not(pre *):not(code *):not(svg *)
            :not([class*="icon"]):not([class*="fa-"]):not([class*="material"]) {
            font-family: Verdana, 'Segoe UI', system-ui, sans-serif !important;
            letter-spacing: .02em !important;
            word-spacing: .08em !important;
          }`);
        toast('Readable font on');
      });
    },
  });

  register({
    id: 'footnote-preview',
    name: 'Footnote previews',
    category: 'reading',
    description: 'Hover a footnote or in-page link to read what it points to without jumping away.',
    run() {
      const tip = document.createElement('div');
      tip.style.cssText = 'position:fixed;z-index:2147483647;max-width:380px;padding:8px 10px;border-radius:8px;background:#fff;color:#1a1a1a;font:13px/1.5 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25);pointer-events:none;display:none';
      document.documentElement.append(tip);

      document.addEventListener('mouseover', event => {
        const link = event.target.closest?.('a[href^="#"]');
        const hash = link?.getAttribute('href');
        if (!hash || hash.length < 2) return;
        let target;
        try {
          target = document.getElementById(decodeURIComponent(hash.slice(1)));
        } catch {
          return;
        }
        if (!target || /^H[1-6]$/.test(target.tagName)) return;
        const targetRect = target.getBoundingClientRect();
        if (targetRect.top >= 0 && targetRect.bottom <= innerHeight) return; // Already on screen.
        const text = (target.closest('li, p, dd, td') ?? target).innerText.trim();
        if (!text) return;

        tip.textContent = text.length > 400 ? `${text.slice(0, 400)}…` : text;
        tip.style.display = 'block';
        const linkRect = link.getBoundingClientRect();
        tip.style.left = `${Math.max(8, Math.min(linkRect.left, innerWidth - tip.offsetWidth - 8))}px`;
        const below = linkRect.bottom + 8;
        tip.style.top = `${below + tip.offsetHeight > innerHeight ? linkRect.top - tip.offsetHeight - 8 : below}px`;
        link.addEventListener('mouseleave', () => { tip.style.display = 'none'; }, { once: true });
      });
    },
  });

  const SCROLL_MEMORY_MS = 30 * 24 * 60 * 60 * 1000;

  register({
    id: 'resume-reading',
    name: 'Resume reading position',
    category: 'reading',
    description: 'Remembers how far you scrolled on long pages (for 30 days) and offers to take you back there.',
    async run() {
      const storageKey = `scroll:${location.origin}${location.pathname}`;
      // Read once and shared, so the command can be registered before the read finishes.
      const savedPosition = chrome.storage.local.get(storageKey).then(result => {
        const saved = result[storageKey];
        return saved && Date.now() - saved.savedAt < SCROLL_MEMORY_MS ? saved : null;
      });

      command('Resume reading position', null, async () => {
        const saved = await savedPosition;
        if (!saved) return false;
        scrollTo({ top: saved.y, behavior: 'smooth' });
      });

      addEventListener('scroll', debounce(() => {
        if (document.documentElement.scrollHeight < innerHeight * 4) return; // Only long pages are worth remembering.
        chrome.storage.local.set({ [storageKey]: { y: scrollY, savedAt: Date.now() } });
      }, 1000), { passive: true });

      const saved = await savedPosition;

      if (saved && saved.y > innerHeight * 2 && scrollY < innerHeight && !location.hash) {
        toast('You were further down this page — run "Resume reading position" from the palette (Alt+Shift+X)', 5000);
      }

      // Now and then, forget positions older than 30 days so storage does not grow forever.
      if (Math.random() < 0.05) {
        const everything = await chrome.storage.local.get(null);
        const expired = Object.keys(everything)
          .filter(key => key.startsWith('scroll:') && Date.now() - everything[key].savedAt > SCROLL_MEMORY_MS);
        if (expired.length) await chrome.storage.local.remove(expired);
      }
    },
  });
})();
