// Builds store-ready packages for each browser family from extension/:
//   dist/chrome/   + dist/browsekit-chrome-<version>.zip    Chrome, Edge, Brave, Opera, Vivaldi
//   dist/firefox/  + dist/browsekit-firefox-<version>.zip   Firefox (desktop and Android)
// The source manifest carries settings for both; each build keeps only what its browser understands,
// so neither store shows manifest warnings. Zips are reproducible: sorted entries, fixed timestamps.
// Usage: node scripts/build.mjs
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = join(root, 'extension');
const dist = join(root, 'dist');

const manifest = JSON.parse(readFileSync(join(source, 'manifest.json'), 'utf8'));

const TARGETS = {
  chrome(base) {
    const { browser_specific_settings: _firefoxOnly, ...rest } = base;
    return { ...rest, background: { service_worker: base.background.service_worker } };
  },
  firefox(base) {
    return { ...base, background: { scripts: base.background.scripts } };
  },
};

function listFiles(directory) {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

// A minimal ZIP writer (deflate, UTF-8 names). Node has no built-in one and the extension needs no dependencies.
function zip(files) {
  const DOS_TIME = 0;
  const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01, so identical input gives an identical zip.
  const UTF8_NAMES = 0x0800;
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBytes = Buffer.from(name, 'utf8');
    const compressed = deflateRawSync(data, { level: 9 });
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_NAMES, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_NAMES, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + compressed.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);

for (const [target, transform] of Object.entries(TARGETS)) {
  const outDir = join(dist, target);
  cpSync(source, outDir, { recursive: true });
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(transform(manifest), null, 2)}\n`);

  const files = listFiles(outDir)
    .map(path => ({ name: relative(outDir, path).split(sep).join('/'), data: readFileSync(path) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const archive = zip(files);
  const zipName = `browsekit-${target}-${manifest.version}.zip`;
  writeFileSync(join(dist, zipName), archive);
  console.log(`${zipName.padEnd(32)} ${files.length} files, ${(archive.length / 1024).toFixed(1)} KB`);
}
