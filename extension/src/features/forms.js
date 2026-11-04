(() => {
  const { register, command, onKey, toast, copyText, selectedText, debounce } = globalThis.Browsekit;

  // The form you are working in, or the first form on the page.
  const currentForm = () => document.activeElement?.closest?.('form') ?? document.forms[0] ?? null;

  function setFieldValue(field, value) {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }

  register({
    id: 'allow-paste',
    name: 'Allow pasting into fields',
    category: 'forms',
    defaultEnabled: false,
    description: 'Stops sites from blocking paste in text fields (e.g. "confirm your email" inputs).',
    run() {
      document.addEventListener('paste', event => {
        if (/^(INPUT|TEXTAREA)$/.test(event.target.tagName)) event.stopImmediatePropagation();
      }, true);
    },
  });

  register({
    id: 'reveal-password',
    name: 'Reveal password on double-click',
    category: 'forms',
    description: 'Double-click a password field to show what you typed; it hides again when you leave the field.',
    run() {
      document.addEventListener('dblclick', event => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || input.type !== 'password') return;
        input.type = 'text';
        input.addEventListener('blur', () => { input.type = 'password'; }, { once: true });
      }, true);
    },
  });

  register({
    id: 'selection-word-count',
    name: 'Selection word count',
    category: 'forms',
    defaultEnabled: false,
    description: 'Shows the number of words and characters in the text you select.',
    run() {
      document.addEventListener('selectionchange', debounce(() => {
        const text = selectedText();
        const words = text ? text.split(/\s+/).length : 0;
        if (words >= 2) toast(`${words.toLocaleString()} words · ${text.length.toLocaleString()} characters`, 1500);
      }, 400));
    },
  });

  register({
    id: 'textarea-autosize',
    name: 'Auto-growing text boxes',
    category: 'forms',
    defaultEnabled: false,
    description: 'Text boxes grow as you type (up to 70% of the window) instead of making you scroll inside them.',
    run() {
      document.addEventListener('input', event => {
        const area = event.target;
        if (!(area instanceof HTMLTextAreaElement)) return;
        const style = getComputedStyle(area);
        const extra = style.boxSizing === 'border-box'
          ? parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
          : -(parseFloat(style.paddingTop) + parseFloat(style.paddingBottom));
        area.style.height = 'auto';
        area.style.height = `${Math.min(area.scrollHeight + extra, innerHeight * 0.7)}px`;
      }, true);
    },
  });

  const DRAFT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

  register({
    id: 'textarea-drafts',
    name: 'Save text drafts',
    category: 'forms',
    defaultEnabled: false,
    description: 'Keeps what you type in text boxes on this device for 7 days, so a crash or accidental close does not lose it. Restore from the command palette.',
    async run() {
      const storageKey = `draft:${location.origin}${location.pathname}`;
      const fieldKey = area => area.name || area.id || `#${[...document.querySelectorAll('textarea')].indexOf(area)}`;
      const loadDrafts = async () => {
        const drafts = (await chrome.storage.local.get(storageKey))[storageKey] ?? {};
        const cutoff = Date.now() - DRAFT_LIFETIME_MS;
        return Object.fromEntries(Object.entries(drafts).filter(([, draft]) => draft.savedAt > cutoff));
      };
      const restorable = drafts => [...document.querySelectorAll('textarea')]
        .map(area => ({ area, draft: drafts[fieldKey(area)] }))
        .filter(({ area, draft }) => draft && !area.value.trim());

      const save = debounce(async area => {
        const drafts = await loadDrafts();
        if (area.value.trim()) drafts[fieldKey(area)] = { text: area.value, savedAt: Date.now() };
        else delete drafts[fieldKey(area)];
        if (Object.keys(drafts).length) await chrome.storage.local.set({ [storageKey]: drafts });
        else await chrome.storage.local.remove(storageKey);
      }, 800);
      document.addEventListener('input', event => {
        if (event.target instanceof HTMLTextAreaElement) save(event.target);
      }, true);
      document.addEventListener('submit', () => chrome.storage.local.remove(storageKey), true);

      command('Restore text drafts', null, async () => {
        const matches = restorable(await loadDrafts());
        if (!matches.length) {
          toast('No drafts to restore here');
          return;
        }
        for (const { area, draft } of matches) {
          area.value = draft.text;
          area.dispatchEvent(new Event('input', { bubbles: true }));
        }
        toast(`Restored ${matches.length} draft(s)`);
      });

      if (restorable(await loadDrafts()).length) {
        toast('Unsaved draft found — open the command palette (Alt+Shift+X) to restore it', 5000);
      }
    },
  });

  const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+?';

  function generatePassword(length = 20) {
    const randomValues = crypto.getRandomValues(new Uint32Array(length));
    return Array.from(randomValues, value => PASSWORD_CHARS[value % PASSWORD_CHARS.length]).join('');
  }

  register({
    id: 'password-generator',
    name: 'Password generator',
    category: 'forms',
    description: 'Generates a strong 20-character password, copies it, and fills the focused password field. Run it from the command palette.',
    run() {
      command('Generate strong password', null, async () => {
        const password = generatePassword();
        const field = document.activeElement;
        const filled = field instanceof HTMLInputElement && field.type === 'password';
        if (filled) setFieldValue(field, password);
        const copied = await copyText(password);
        if (filled) toast(copied ? 'Password filled and copied' : 'Password filled');
        else toast(copied ? 'Password copied to clipboard' : 'Could not copy the password');
      });
    },
  });

  register({
    id: 'maxlength-counter',
    name: 'Character limit counter',
    category: 'forms',
    description: 'Fields with a character limit show how much you have used, e.g. "112 / 280", turning red at the limit.',
    run() {
      const badge = document.createElement('div');
      badge.style.cssText = 'position:fixed;z-index:2147483647;padding:1px 6px;border-radius:4px;color:#fff;font:11px/1.5 system-ui,sans-serif;pointer-events:none;display:none';
      document.documentElement.append(badge);
      const hasLimit = element => (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && element.maxLength > 0;
      const update = field => {
        badge.textContent = `${field.value.length} / ${field.maxLength}`;
        badge.style.background = field.value.length >= field.maxLength ? 'rgba(190,30,30,.92)' : 'rgba(20,20,24,.85)';
        badge.style.display = 'block';
        const rect = field.getBoundingClientRect();
        badge.style.left = `${Math.max(0, rect.right - badge.offsetWidth)}px`;
        badge.style.top = `${rect.bottom + 4}px`;
      };
      document.addEventListener('focusin', event => {
        if (hasLimit(event.target)) update(event.target);
      });
      document.addEventListener('input', event => {
        if (hasLimit(event.target)) update(event.target);
      }, true);
      document.addEventListener('focusout', () => { badge.style.display = 'none'; });
    },
  });

  register({
    id: 'ctrl-enter-submit',
    name: 'Ctrl+Enter sends',
    category: 'forms',
    shortcut: 'Ctrl+Enter',
    description: 'Ctrl+Enter in a text box submits its form, on sites that do not already support it.',
    run() {
      onKey('ctrl+enter', () => {
        const field = document.activeElement;
        if (!(field instanceof HTMLTextAreaElement) || !field.form) return false;
        field.form.requestSubmit();
      }, { allowInInputs: true, capture: false });
    },
  });

  register({
    id: 'reset-form',
    name: 'Reset form',
    category: 'forms',
    description: 'Resets the form you are working in back to its starting values, after asking you first. Run it from the command palette.',
    run() {
      command('Reset the current form', null, () => {
        const form = currentForm();
        if (!form) return false;
        if (!confirm('Reset this form? Everything you typed in it will be lost.')) return;
        form.reset();
        toast('Form reset');
      });
    },
  });

  // A plausible value for a field, guessed from its type, name, id, autocomplete and placeholder.
  function testValue(field) {
    if (field instanceof HTMLTextAreaElement) return 'This is some test text, filled in by Browsekit.';
    const byType = {
      email: 'test@example.com', tel: '+1 555 0100', url: 'https://example.com', number: field.min || '42',
      date: new Date().toISOString().slice(0, 10), time: '12:00', password: 'Test-password-123!', color: '#3b6fe0',
    };
    if (byType[field.type]) return byType[field.type];
    if (field.type !== 'text' && field.type !== 'search') return null;
    const hint = `${field.name} ${field.id} ${field.autocomplete} ${field.placeholder}`.toLowerCase();
    const guesses = [
      [/e-?mail/, 'test@example.com'], [/first|given/, 'Ada'], [/last|family|surname/, 'Lovelace'], [/name/, 'Ada Lovelace'],
      [/phone|mobile|tel/, '+1 555 0100'], [/zip|postal|postcode/, '12345'], [/city|town/, 'Springfield'],
      [/address|street/, '1 Test Street'], [/company|organi[sz]ation/, 'Example Ltd'], [/country/, 'United States'],
      [/url|website/, 'https://example.com'],
    ];
    return guesses.find(([pattern]) => pattern.test(hint))?.[1] ?? 'Test';
  }

  register({
    id: 'fill-test-data',
    name: 'Fill form with test data',
    category: 'forms',
    description: 'Fills empty fields with realistic test values (names, emails, dates…) — handy when testing your own sites. Run it from the command palette.',
    run() {
      command('Fill form with test data', null, () => {
        const scope = currentForm() ?? document;
        const fields = scope.querySelectorAll(
          'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="reset"]), textarea, select');
        let filled = 0;
        for (const field of fields) {
          if (field.disabled || field.readOnly || field.offsetParent === null) continue;
          if (field instanceof HTMLSelectElement) {
            const option = [...field.options].find((candidate, index) => index > 0 && candidate.value && !candidate.disabled);
            if (field.selectedIndex <= 0 && option) {
              setFieldValue(field, option.value);
              filled++;
            }
            continue;
          }
          const value = !field.value && testValue(field);
          if (value) {
            setFieldValue(field, value);
            filled++;
          }
        }
        toast(filled ? `Filled ${filled} field(s) with test data` : 'No empty fields to fill');
      });
    },
  });

  register({
    id: 'form-to-json',
    name: 'Copy form data as JSON',
    category: 'forms',
    description: 'Copies the current form\'s field names and values as JSON (password fields are left out). Run it from the command palette.',
    run() {
      command('Copy form data as JSON', null, async () => {
        const form = currentForm();
        if (!form) return false;
        const data = {};
        for (const [name, value] of new FormData(form)) {
          if (form.elements.namedItem(name)?.type === 'password') continue;
          const readable = value instanceof File ? value.name : value;
          data[name] = name in data ? [].concat(data[name], readable) : readable;
        }
        const copied = await copyText(JSON.stringify(data, null, 2));
        toast(copied ? `Copied ${Object.keys(data).length} field(s) as JSON` : 'Copy failed');
      });
    },
  });
})();
