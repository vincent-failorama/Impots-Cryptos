/**
 * Prépare les fichiers pour le build Electron.
 * Next.js standalone attend .next/static et public/ à côté de server.js.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const copies = [
  { src: '.next/static',  dst: '.next/standalone/.next/static' },
  { src: 'public',        dst: '.next/standalone/public' },
];

for (const { src, dst } of copies) {
  const from = path.join(root, src);
  const to   = path.join(root, dst);
  fs.cpSync(from, to, { recursive: true, force: true });
  console.log(`✓ ${src} → ${dst}`);
}
