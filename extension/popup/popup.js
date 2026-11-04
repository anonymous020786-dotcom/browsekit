const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
const status = document.getElementById('status');
const say = message => { status.textContent = message; };

// --- Per-site on/off switch ---------------------------------------------------
const siteToggle = document.getElementById('site-toggle');
const siteName = document.getElementById('site-name');
const hostname = /^https?:/.test(currentTab?.url ?? '') ? new URL(currentTab.url).hostname : null;

if (hostname) {
  siteName.textContent = hostname;
  const { disabledSites = [] } = await chrome.storage.sync.get('disabledSites');
  siteToggle.checked = !disabledSites.includes(hostname);
  siteToggle.addEventListener('change', async () => {
    const { disabledSites = [] } = await chrome.storage.sync.get('disabledSites');
    const next = siteToggle.checked
      ? disabledSites.filter(site => site !== hostname)
      : [...new Set([...disabledSites, hostname])];
    await chrome.storage.sync.set({ disabledSites: next });
    await chrome.tabs.reload(currentTab.id);
    say(siteToggle.checked ? 'Turned on — page reloaded' : 'Turned off — page reloaded');
  });
} else {
  siteName.textContent = 'Not available on this page';
  siteToggle.disabled = true;
}

// --- Tab tools ------------------------------------------------------------------
const windowTabs = () => chrome.tabs.query({ currentWindow: true });
const siteOf = tab => {
  try {
    return new URL(tab.url).hostname.replace(/^www\./, '');
  } catch {
    return tab.url ?? '';
  }
};

const actions = {
  async 'copy-urls'() {
    const tabs = await windowTabs();
    await navigator.clipboard.writeText(tabs.map(tab => tab.url).join('\n'));
    say(`Copied ${tabs.length} URLs`);
  },

  async 'copy-urls-markdown'() {
    const tabs = await windowTabs();
    await navigator.clipboard.writeText(tabs.map(tab => `- [${tab.title}](${tab.url})`).join('\n'));
    say(`Copied ${tabs.length} links as Markdown`);
  },

  async 'close-duplicates'() {
    const kept = new Map();
    const toClose = [];
    for (const tab of await windowTabs()) {
      const key = tab.url.split('#')[0];
      const existing = kept.get(key);
      if (!existing) {
        kept.set(key, tab);
        continue;
      }
      // Never close the tab you are looking at or a pinned tab.
      const isProtected = candidate => candidate.active || candidate.pinned;
      if (isProtected(tab) && !isProtected(existing)) {
        toClose.push(existing.id);
        kept.set(key, tab);
      } else if (!isProtected(tab)) {
        toClose.push(tab.id);
      }
    }
    if (toClose.length) await chrome.tabs.remove(toClose);
    say(toClose.length ? `Closed ${toClose.length} duplicate tab(s)` : 'No duplicates found');
  },

  async 'sort-tabs'() {
    const tabs = (await windowTabs()).filter(tab => !tab.pinned);
    if (!tabs.length) return;
    const firstIndex = tabs[0].index;
    const sorted = [...tabs].sort((a, b) => siteOf(a).localeCompare(siteOf(b)) || a.index - b.index);
    for (const [offset, tab] of sorted.entries()) await chrome.tabs.move(tab.id, { index: firstIndex + offset });
    say(`Sorted ${tabs.length} tabs by site`);
  },

  async 'close-right'() {
    const ids = (await windowTabs()).filter(tab => tab.index > currentTab.index && !tab.pinned).map(tab => tab.id);
    if (ids.length) await chrome.tabs.remove(ids);
    say(ids.length ? `Closed ${ids.length} tab(s)` : 'No tabs to the right');
  },

  async 'mute-others'() {
    const others = (await chrome.tabs.query({})).filter(tab => tab.id !== currentTab.id && !tab.mutedInfo?.muted);
    await Promise.all(others.map(tab => chrome.tabs.update(tab.id, { muted: true })));
    say(`Muted ${others.length} tab(s)`);
  },

  async 'unmute-all'() {
    const muted = (await chrome.tabs.query({})).filter(tab => tab.mutedInfo?.muted);
    await Promise.all(muted.map(tab => chrome.tabs.update(tab.id, { muted: false })));
    say(`Unmuted ${muted.length} tab(s)`);
  },

  async 'open-settings'() {
    await chrome.runtime.openOptionsPage();
    window.close();
  },
};

for (const button of document.querySelectorAll('[data-action]')) {
  button.addEventListener('click', () => actions[button.dataset.action]().catch(error => say(error.message)));
}
