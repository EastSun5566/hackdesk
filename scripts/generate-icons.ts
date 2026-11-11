/**
 * Generates app icon assets from the catalog in `src/lib/app-icons.ts`.
 *
 *   pnpm icons:generate                     # packaged icon = PACKAGED_APP_ICON
 *   pnpm icons:generate --packaged nightly  # e.g. for a nightly channel build
 *
 * Outputs:
 *   build/app-icons/<variant>.png         macOS dock icon (runtime-switchable)
 *   build/app-icons/<variant>-square.png  Windows/Linux window icon (runtime-switchable)
 *   build/app-icons/trayTemplate(@2x).png macOS menu bar template image
 *   build/icon.{icns,ico,png}             packaged icons used by electron-builder
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

type AppIcons = typeof import('../src/lib/app-icons');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const icons = await import(pathToFileURL(join(root, 'src/lib/app-icons.ts')).href) as AppIcons;
const buildDir = join(root, 'build');
const outDir = join(buildDir, 'app-icons');

const packagedFlag = process.argv.indexOf('--packaged');
const packaged = packagedFlag === -1 ? icons.PACKAGED_APP_ICON : process.argv[packagedFlag + 1];
if (!icons.APP_ICON_VARIANT_IDS.includes(packaged as never)) {
  console.error(`Unknown --packaged variant "${packaged}". Use one of: ${icons.APP_ICON_VARIANT_IDS.join(', ')}`);
  process.exit(1);
}
const packagedVariant = packaged as (typeof icons.APP_ICON_VARIANT_IDS)[number];

function rasterize(svg: string, size: number) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
}

/** ICO is a directory of embedded PNGs; Windows Vista+ reads PNG entries at every size. */
function encodeIco(images: { size: number; png: Uint8Array }[]) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => Buffer.from(png))]);
}

function writeIcns(svg: string, target: string) {
  if (process.platform !== 'darwin') {
    console.warn('Skipping build/icon.icns: iconutil is only available on macOS.');
    return;
  }

  const workDir = mkdtempSync(join(tmpdir(), 'hackdesk-icon-'));
  const iconset = join(workDir, 'icon.iconset');
  mkdirSync(iconset);
  try {
    for (const size of [16, 32, 128, 256, 512]) {
      writeFileSync(join(iconset, `icon_${size}x${size}.png`), rasterize(svg, size));
      writeFileSync(join(iconset, `icon_${size}x${size}@2x.png`), rasterize(svg, size * 2));
    }
    execFileSync('iconutil', ['--convert', 'icns', '--output', target, iconset]);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const variant of icons.APP_ICON_VARIANT_IDS) {
  writeFileSync(join(outDir, `${variant}.png`), rasterize(icons.renderAppIconSvg(variant, 'macos'), 512));
  writeFileSync(join(outDir, `${variant}-square.png`), rasterize(icons.renderAppIconSvg(variant, 'square'), 256));
}

writeFileSync(join(outDir, 'trayTemplate.png'), rasterize(icons.renderTrayTemplateSvg(18), 18));
writeFileSync(join(outDir, 'trayTemplate@2x.png'), rasterize(icons.renderTrayTemplateSvg(18), 36));

const macSvg = icons.renderAppIconSvg(packagedVariant, 'macos');
const squareSvg = icons.renderAppIconSvg(packagedVariant, 'square');
writeIcns(macSvg, join(buildDir, 'icon.icns'));
writeFileSync(
  join(buildDir, 'icon.ico'),
  encodeIco([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, png: rasterize(squareSvg, size) }))),
);
writeFileSync(join(buildDir, 'icon.png'), rasterize(squareSvg, 512));

console.log(`Generated ${icons.APP_ICON_VARIANT_IDS.length} icon variants; packaged icon: ${packagedVariant}.`);
