// Browser-level shortcuts. Users assign keys at chrome://extensions/shortcuts (Firefox: about:addons → ⚙ →
// Manage Extension Shortcuts). These work even where a site or the browser swallows the in-page Alt+Shift keys.
const COMMAND_NAMES = {
  'command-palette': 'palette',
  'link-hints': 'Show link hints',
  'reader-mode': 'Toggle reader mode',
  'dark-mode': 'Toggle dark mode',
};

chrome.commands.onCommand.addListener(async (command, tab) => {
  const name = COMMAND_NAMES[command];
  const target = tab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!name || !target?.id) return;
  // Pages where content scripts cannot run (browser pages, the web store) have no listener.
  chrome.tabs.sendMessage(target.id, { type: 'browsekit-command', name }).catch(() => {});
});
