// Builds the settings page from the same feature registry the content script uses,
// so a newly registered feature shows up here without any extra wiring.
const { CATEGORIES, features } = globalThis.Browsekit;

async function loadFeatureScripts() {
  const files = chrome.runtime.getManifest().content_scripts[0].js.filter(file => file.includes('/features/'));
  for (const file of files) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL(file);
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${file}`));
      document.head.append(script);
    });
  }
}

const isOn = (enabled, feature) => enabled[feature.id] ?? feature.defaultEnabled;

function updateSummary(enabled) {
  const count = features.filter(feature => isOn(enabled, feature)).length;
  document.getElementById('summary').textContent = `${count} of ${features.length} features enabled`;
}

function featureRow(feature, enabled) {
  const row = document.createElement('label');
  row.className = 'feature';
  row.dataset.search = `${feature.name} ${feature.description} ${feature.id} ${feature.shortcut ?? ''}`.toLowerCase();

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = isOn(enabled, feature);
  toggle.addEventListener('change', async () => {
    enabled[feature.id] = toggle.checked;
    await chrome.storage.sync.set({ enabled });
    updateSummary(enabled);
  });

  const text = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = feature.name;
  text.append(name);
  if (feature.shortcut) {
    const keys = document.createElement('kbd');
    keys.textContent = feature.shortcut;
    text.append(keys);
  }
  if (!feature.defaultEnabled) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = 'off by default';
    text.append(tag);
  }
  const description = document.createElement('p');
  description.textContent = feature.description;
  text.append(description);

  row.append(toggle, text);
  return row;
}

function renderFeatures(enabled) {
  const root = document.getElementById('features');
  root.replaceChildren();
  for (const [category, label] of Object.entries(CATEGORIES)) {
    const group = features.filter(feature => feature.category === category);
    if (!group.length) continue;
    const section = document.createElement('section');
    section.className = 'category';
    const heading = document.createElement('h2');
    heading.textContent = `${label} (${group.length})`;
    section.append(heading, ...group.map(feature => featureRow(feature, enabled)));
    root.append(section);
  }
  updateSummary(enabled);
  applyFilter();
}

function applyFilter() {
  const query = document.getElementById('filter').value.trim().toLowerCase();
  for (const section of document.querySelectorAll('#features .category')) {
    let visible = 0;
    for (const row of section.querySelectorAll('.feature')) {
      const match = row.dataset.search.includes(query);
      row.classList.toggle('hidden', !match);
      visible += match;
    }
    section.classList.toggle('hidden', visible === 0);
  }
}

function renderSites(disabledSites) {
  const list = document.getElementById('sites');
  list.replaceChildren();
  if (!disabledSites.length) {
    const empty = document.createElement('li');
    empty.className = 'muted';
    empty.textContent = 'None. Use the toolbar button to turn Browsekit off for a site.';
    list.append(empty);
    return;
  }
  for (const site of disabledSites) {
    const item = document.createElement('li');
    item.textContent = site;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Turn back on';
    remove.addEventListener('click', async () => {
      const remaining = disabledSites.filter(other => other !== site);
      await chrome.storage.sync.set({ disabledSites: remaining });
      renderSites(remaining);
    });
    item.append(remove);
    list.append(item);
  }
}

await loadFeatureScripts();
const { enabled = {}, disabledSites = [] } = await chrome.storage.sync.get(['enabled', 'disabledSites']);
renderFeatures(enabled);
renderSites(disabledSites);

document.getElementById('filter').addEventListener('input', applyFilter);
document.getElementById('reset').addEventListener('click', async () => {
  await chrome.storage.sync.remove('enabled');
  for (const key of Object.keys(enabled)) delete enabled[key];
  renderFeatures(enabled);
});

document.getElementById('shortcuts').addEventListener('click', async () => {
  try {
    await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  } catch {
    // Firefox does not allow opening its settings pages from an extension.
    alert('Open about:addons, click the gear icon, then "Manage Extension Shortcuts".');
  }
});

document.getElementById('export').addEventListener('click', async () => {
  const settings = await chrome.storage.sync.get(['enabled', 'disabledSites']);
  const file = new Blob([JSON.stringify({ browsekit: 1, ...settings }, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = 'browsekit-settings.json';
  link.click();
  URL.revokeObjectURL(link.href);
});

const importFile = document.getElementById('import-file');
document.getElementById('import').addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const [file] = importFile.files;
  importFile.value = '';
  if (!file) return;
  try {
    const settings = JSON.parse(await file.text());
    const isFlagMap = value => value && typeof value === 'object' && Object.values(value).every(flag => typeof flag === 'boolean');
    const isSiteList = value => Array.isArray(value) && value.every(site => typeof site === 'string');
    if (settings.browsekit !== 1 || !isFlagMap(settings.enabled ?? {}) || !isSiteList(settings.disabledSites ?? [])) {
      throw new Error('This is not a Browsekit settings file.');
    }
    const imported = { enabled: settings.enabled ?? {}, disabledSites: settings.disabledSites ?? [] };
    await chrome.storage.sync.set(imported);
    for (const key of Object.keys(enabled)) delete enabled[key];
    Object.assign(enabled, imported.enabled);
    renderFeatures(enabled);
    renderSites(imported.disabledSites);
  } catch (error) {
    alert(`Import failed: ${error.message}`);
  }
});
