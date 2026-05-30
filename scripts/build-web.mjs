/* Copy the static web app into www/ so Capacitor can bundle it into the
   iOS app. GitHub Pages keeps serving the files from the repo root, so the
   web version and the native version build from the same source.

   Run: npm run build:web   (or it runs automatically via `npm run ios`). */
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';

const OUT = 'www';
const ASSETS = [
  'index.html',           // launcher
  'tracker.html',         // the tracker
  'game.html',            // KhimVentures
  'manifest.webmanifest',
  'sw.js',
  'css',
  'js',
  'icons',
  'structured data files', // your imported Structured export
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let copied = 0;
for (const a of ASSETS) {
  if (existsSync(a)) { cpSync(a, `${OUT}/${a}`, { recursive: true }); copied++; }
  else console.warn(`(skipped, not found) ${a}`);
}
console.log(`Built ${OUT}/ for Capacitor — ${copied} entries copied.`);
