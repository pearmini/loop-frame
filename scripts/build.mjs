import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeIcon } from './write-icon.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  external: ['electron'],
  logLevel: 'info',
};

await mkdir(dist, { recursive: true });
await writeIcon(path.join(root, 'build', 'icon.png'));

await build({
  ...shared,
  entryPoints: [path.join(root, 'src/main/index.ts')],
  outfile: path.join(dist, 'main/index.js'),
  format: 'cjs',
});

await build({
  ...shared,
  entryPoints: [
    path.join(root, 'src/preload/settings.ts'),
    path.join(root, 'src/preload/controls.ts'),
  ],
  outdir: path.join(dist, 'preload'),
  format: 'cjs',
});

await build({
  ...shared,
  entryPoints: [
    path.join(root, 'src/renderer/settings.ts'),
    path.join(root, 'src/renderer/controls.ts'),
  ],
  outdir: path.join(dist, 'renderer'),
  format: 'iife',
  platform: 'browser',
  target: 'chrome130',
});

await cp(path.join(root, 'src/renderer/index.html'), path.join(dist, 'renderer/index.html'));
await cp(path.join(root, 'src/renderer/styles.css'), path.join(dist, 'renderer/styles.css'));
await cp(path.join(root, 'src/renderer/controls.html'), path.join(dist, 'renderer/controls.html'));
await cp(path.join(root, 'src/renderer/controls.css'), path.join(dist, 'renderer/controls.css'));
await cp(path.join(root, 'src/renderer/backdrop.html'), path.join(dist, 'renderer/backdrop.html'));
