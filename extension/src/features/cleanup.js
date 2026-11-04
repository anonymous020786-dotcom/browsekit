(() => {
  const { register, command, addStyle, toast, watchDom } = globalThis.Browsekit;

  // Lets the page scroll again after an overlay locked it.
  function unlockScrolling() {
    let changed = false;
    for (const element of [document.documentElement, document.body]) {
      const style = getComputedStyle(element);
      if (style.overflow === 'hidden' || style.overflowY === 'hidden') {
        element.style.setProperty('overflow', 'auto', 'important');
        changed = true;
      }
      if (element === document.body && style.position === 'fixed') {
        element.style.setProperty('position', 'static', 'important');
        changed = true;
      }
    }
    return changed;
  }

  const COOKIE_BANNERS = [
    '#onetrust-banner-sdk', '#onetrust-consent-sdk', '#CybotCookiebotDialog', '#cookie-law-info-bar',
    '.cc-window', '#cookie-banner', '.cookie-banner', '#cookieConsent', '.cookie-consent', '#gdpr-cookie-message',
    '.qc-cmp2-container', '#truste-consent-track', '.osano-cm-window', '#usercentrics-root', '.fc-consent-root',
    '#didomi-host', '[aria-label="cookieconsent"]',
  ].join(',');

  register({
    id: 'hide-cookie-banners',
    name: 'Hide cookie banners',
    category: 'cleanup',
    description: 'Hides consent pop-ups from common providers (OneTrust, Cookiebot, Quantcast, Didomi and more) without accepting them.',
    run() {
      addStyle(`${COOKIE_BANNERS} { display: none !important; }`);
      // Some consent tools lock scrolling until you answer; undo that once their banner is hidden.
      const unlockIfBanner = () => {
        if (document.querySelector(COOKIE_BANNERS)) unlockScrolling();
      };
      setTimeout(unlockIfBanner, 1500);
      setTimeout(unlockIfBanner, 4000);
    },
  });

  register({
    id: 'hide-sticky-elements',
    name: 'Hide sticky headers & bars',
    category: 'cleanup',
    shortcut: 'Alt+Shift+H',
    description: 'Toggles hiding of fixed and sticky elements (headers, chat bubbles, "subscribe" bars).',
    run() {
      const hidden = new Map();
      command('Toggle sticky headers & bars', 'alt+shift+h', () => {
        if (hidden.size) {
          for (const [element, previous] of hidden) {
            if (previous) element.style.setProperty('display', previous.value, previous.priority);
            else element.style.removeProperty('display');
          }
          hidden.clear();
          toast('Sticky elements restored');
          return;
        }
        for (const element of document.body.querySelectorAll('*')) {
          const { position } = getComputedStyle(element);
          if (position !== 'fixed' && position !== 'sticky') continue;
          const value = element.style.getPropertyValue('display');
          hidden.set(element, value ? { value, priority: element.style.getPropertyPriority('display') } : null);
          element.style.setProperty('display', 'none', 'important');
        }
        toast(hidden.size ? `Hid ${hidden.size} sticky element(s)` : 'No sticky elements found');
      });
    },
  });

  register({
    id: 'unblock-copy',
    name: 'Unblock selecting, copying & right-click',
    category: 'cleanup',
    defaultEnabled: false,
    description: 'Re-enables text selection, copy and the context menu on sites that disable them.',
    run() {
      addStyle('*, *::before, *::after { user-select: text !important; -webkit-user-select: text !important; }');
      for (const type of ['copy', 'cut', 'contextmenu', 'selectstart']) {
        document.addEventListener(type, event => event.stopImmediatePropagation(), true);
      }
    },
  });

  // Returns a function that adds or removes `css` each time it is called, reporting whether it is now on.
  function cssToggle(css) {
    let style = null;
    return () => {
      if (style) {
        style.remove();
        style = null;
      } else {
        style = addStyle(css);
      }
      return Boolean(style);
    };
  }

  register({
    id: 'text-only-mode',
    name: 'Text-only mode',
    category: 'cleanup',
    description: 'Hides images, videos, embeds and background images so you can focus on the text. Toggle it from the command palette.',
    run() {
      const toggle = cssToggle(`
        img, picture, video, iframe, canvas, embed, object { visibility: hidden !important; }
        * { background-image: none !important; }`);
      command('Toggle text-only mode', null, () => {
        toast(toggle() ? 'Text-only mode on' : 'Text-only mode off');
      });
    },
  });

  register({
    id: 'stop-animations',
    name: 'Stop animations',
    category: 'cleanup',
    description: 'Skips CSS animations and transitions straight to their end state — calmer pages and fewer distractions. Toggle from the command palette.',
    run() {
      const toggle = cssToggle(`
        *, *::before, *::after {
          animation-duration: 0s !important; animation-delay: 0s !important; animation-iteration-count: 1 !important;
          transition-duration: 0s !important; transition-delay: 0s !important; scroll-behavior: auto !important;
        }`);
      command('Toggle animations', null, () => {
        toast(toggle() ? 'Animations stopped' : 'Animations restored');
      });
    },
  });

  register({
    id: 'unlock-scrolling',
    name: 'Unlock page scrolling',
    category: 'cleanup',
    description: 'Makes the page scroll again when a pop-up or paywall overlay has frozen it. Run it from the command palette.',
    run() {
      command('Unlock page scrolling', null, () => {
        toast(unlockScrolling() ? 'Scrolling unlocked' : 'Scrolling was not locked');
      });
    },
  });

  register({
    id: 'hide-comment-sections',
    name: 'Hide comment sections',
    category: 'cleanup',
    description: 'Hides comment sections on blogs and news sites (Disqus, WordPress and common layouts). Toggle from the command palette.',
    run() {
      const toggle = cssToggle(`
        #comments, #disqus_thread, .comments-area, .comment-list, #comment-section, .comments-section,
        section.comments, #respond, .fb-comments { display: none !important; }`);
      command('Toggle comment sections', null, () => {
        toast(toggle() ? 'Comment sections hidden' : 'Comment sections shown');
      });
    },
  });

  register({
    id: 'hide-newsletter-popups',
    name: 'Hide newsletter pop-ups',
    category: 'cleanup',
    defaultEnabled: false,
    description: 'Hides pop-ups that appear on their own, cover the page and ask for your email address, then lets the page scroll again.',
    run() {
      // Pop-ups that appear right after you click (a login form you opened, say) are left alone.
      let lastInteraction = 0;
      for (const type of ['pointerdown', 'keydown']) {
        addEventListener(type, () => { lastInteraction = Date.now(); }, true);
      }
      const handled = new WeakSet();
      watchDom(() => {
        for (const input of document.querySelectorAll('input[type="email"]')) {
          let overlay = null;
          for (let element = input.parentElement; element && element !== document.body; element = element.parentElement) {
            if (getComputedStyle(element).position === 'fixed') overlay = element; // Keep the outermost one.
          }
          if (!overlay || handled.has(overlay)) continue;
          handled.add(overlay);
          if (Date.now() - lastInteraction < 1500 || overlay.querySelector('input[type="password"]')) continue;
          const rect = overlay.getBoundingClientRect();
          if (rect.width * rect.height < innerWidth * innerHeight * 0.15) continue;
          overlay.style.setProperty('display', 'none', 'important');
          unlockScrolling();
          toast('Hid a newsletter pop-up');
        }
      }, 500);
    },
  });
})();
