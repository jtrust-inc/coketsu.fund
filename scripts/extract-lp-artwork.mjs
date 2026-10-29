import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
// Use the installed image toolkit; no AI alterations or resampling of the supplied art.
const toolkitRequire = createRequire(process.env.LP_IMAGE_TOOLKIT || import.meta.url);
const sharp = toolkitRequire('sharp');
const source = resolve('static-assets/assets/lp/1009-coketsufund-lp.png');
const destination = resolve('static-assets/assets/lp/reference');
await mkdir(destination, { recursive: true });
const slices = {
  'brand': [18, 12, 128, 14],
  'hero': [0, 36, 410, 324],
  'hero-edge': [730, 36, 32, 324],
  'record': [0, 360, 762, 97],
  'record-delay': [99, 366, 161, 69],
  'record-extension': [297, 366, 161, 69],
  'record-capital': [491, 366, 161, 69],
  'about-edge': [0, 457, 120, 257],
  'mechanism': [0, 716, 762, 152],
  'mechanism-edge': [0, 716, 85, 150],
  'fund-setagaya': [58, 900, 318, 153],
  'fund-nishiazabu': [390, 900, 317, 153],
  'operation': [75, 1107, 610, 195],
  'priority': [58, 1393, 649, 152],
  'flow-1': [43, 1622, 144, 71],
  'flow-2': [220, 1622, 144, 71],
  'flow-3': [399, 1622, 144, 71],
  'flow-4': [577, 1622, 144, 71],
  'cta-copy': [34, 1746, 245, 70],
};
const metadata = await sharp(source).metadata();
if (metadata.width !== 762 || metadata.height !== 2064) throw new Error('Unexpected reference dimensions');
for (const [name, [left, top, width, height]] of Object.entries(slices)) {
  await sharp(source).extract({left, top, width, height}).png().toFile(resolve(destination, `${name}.png`));
}
await writeFile(resolve(destination, 'slices.json'), JSON.stringify({ source: '1009_coketsufand＿LP.png', width: 762, height: 2064, slices }, null, 2) + '\n');
console.log(`Extracted ${Object.keys(slices).length} original artwork components without image generation.`);
