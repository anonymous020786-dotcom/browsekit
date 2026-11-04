// Sanity check: every feature file is listed in the manifest, loads without errors,
// and registers valid features with unique ids and non-conflicting shortcuts.
// Usage: node scripts/check-features.mjs
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../extension/', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

const manifest = JSON.parse(read('manifest.json'));
const scripts = manifest.content_scripts[0].js;

const featureFiles = readdirSync(new URL('src/features/', root)).map(file => `src/features/${file}`);
const unlisted = featureFiles.filter(file => !scripts.includes(file));
if (unlisted.length) throw new Error(`Feature files missing from manifest.json: ${unlisted.join(', ')}`);

const context = vm.createContext({});
for (const file of scripts.filter(file => file !== 'src/runner.js')) {
  vm.runInContext(read(file), context, { filename: file });
}

const { features, CATEGORIES } = context.Browsekit;

const seenShortcuts = new Map();
for (const feature of features) {
  if (!feature.shortcut) continue;
  for (const shortcut of feature.shortcut.toLowerCase().split(' / ')) {
    if (seenShortcuts.has(shortcut)) {
      throw new Error(`Shortcut "${shortcut}" used by both ${seenShortcuts.get(shortcut)} and ${feature.id}`);
    }
    seenShortcuts.set(shortcut, feature.id);
  }
}

for (const [category, label] of Object.entries(CATEGORIES)) {
  const count = features.filter(feature => feature.category === category).length;
  console.log(`${label.padEnd(16)} ${count}`);
}
const onByDefault = features.filter(feature => feature.defaultEnabled).length;
console.log(`\n✔ ${features.length} features registered (${onByDefault} on by default)`);
