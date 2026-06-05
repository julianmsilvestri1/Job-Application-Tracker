// Bundle the shared src/ into two shippable targets:
//   dist/chrome/  — unpacked MV3 for Chromium (load unpacked)
//   dist/safari/  — input for `xcrun safari-web-extension-converter`
// Same JS for both; only the manifest differs. Output is IIFE, so the content
// bundle has no top-level ESM `export` (Safari/MV3 content-script requirement).
import esbuild from 'esbuild';
import { mkdir, copyFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

const ENTRIES = ['content.js', 'popup.js', 'options.js', 'background.js'];
const STATIC = ['popup.html', 'options.html'];
const TARGETS = [
  { name: 'chrome', manifest: 'manifest.chrome.json' },
  { name: 'safari', manifest: 'manifest.safari.json' },
];

async function buildTarget(target) {
  const outdir = here(`./dist/${target.name}/`);
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });

  await esbuild.build({
    entryPoints: ENTRIES.map((e) => here(`./src/${e}`)),
    outdir,
    bundle: true,
    format: 'iife',            // no top-level ESM exports in the output
    target: ['safari15', 'chrome100'],
    legalComments: 'none',
  });

  for (const f of STATIC) await copyFile(here(`./src/${f}`), here(`./dist/${target.name}/${f}`));
  await copyFile(here(`./src/${target.manifest}`), here(`./dist/${target.name}/manifest.json`));
}

export async function build() {
  for (const target of TARGETS) await buildTarget(target);
  return TARGETS.map((t) => t.name);
}

// Run directly: `node build.mjs`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  build().then((names) => console.log(`Built dist/${names.join(', dist/')}`)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
