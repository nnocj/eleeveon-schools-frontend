/** Rebuild Hub's public image catalogue from directory contents; no filenames are hard-coded. */
import { readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const folder = path.join(root, 'public', 'chat-backgroundimages');
const destination = path.join(root, 'app', 'lib', 'support', 'hubBackgrounds.generated.json');
const valid = /\.(avif|gif|jpe?g|png|webp)$/i;
await mkdir(folder, { recursive: true });
const files = (await readdir(folder, { withFileTypes: true }))
  .filter(entry => entry.isFile() && valid.test(entry.name) && !entry.name.startsWith('.'))
  .map(entry => entry.name).sort((a,b) => a.localeCompare(b));
const items = files.map(name => ({ id: `public:${name}`, name: name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), url: `/chat-backgroundimages/${encodeURIComponent(name)}` }));
await writeFile(destination, JSON.stringify(items, null, 2) + '\n');
console.log(`Hub backgrounds: registered ${items.length} image(s) from ${folder}`);
