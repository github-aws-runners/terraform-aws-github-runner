import { mkdir, rm, writeFile } from 'node:fs/promises';

import { build } from 'esbuild';

await rm('dist', { force: true, recursive: true });
await mkdir('dist', { recursive: true });

await build({
  bundle: true,
  entryPoints: ['src/index.ts'],
  format: 'cjs',
  legalComments: 'eof',
  minify: false,
  packages: 'bundle',
  platform: 'node',
  sourcemap: false,
  target: 'node24',
  outfile: 'dist/server.js',
});

await writeFile('dist/package.json', '{\n  "type": "commonjs"\n}\n');
