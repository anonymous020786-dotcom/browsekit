// Runs every enabled feature once the page is ready. Features switched on in settings start
// immediately; features switched off stop on the next page load (features have no teardown).
(async () => {
  const Browsekit = globalThis.Browsekit;
  const { enabled = {}, disabledSites = [] } = await chrome.storage.sync.get(['enabled', 'disabledSites']);
  if (disabledSites.includes(location.hostname)) return;

  const shouldRun = (feature, settings) =>
    (settings[feature.id] ?? feature.defaultEnabled) && (!feature.match || feature.match(location));

  function start(feature) {
    Browsekit.active.push(feature);
    Promise.resolve()
      .then(() => feature.run())
      .catch(error => console.error(`[Browsekit] "${feature.id}" failed:`, error));
  }

  Browsekit.features.filter(feature => shouldRun(feature, enabled)).forEach(start);

  // Browser-level shortcuts arrive from the background worker as command names.
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type !== 'browsekit-command') return;
    if (message.name === 'palette') {
      Browsekit.togglePalette?.();
      return;
    }
    Browsekit.commands.find(command => command.name === message.name)?.handler();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.enabled) return;
    const settings = changes.enabled.newValue ?? {};
    for (const feature of Browsekit.features) {
      if (!Browsekit.active.includes(feature) && shouldRun(feature, settings)) start(feature);
    }
  });
})();
