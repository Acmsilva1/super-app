/**
 * Gera icon-192.png e icon-512.png a partir de icon.png.
 * Chrome exige ícones com dimensões exatas (192 e 512) para instalar como app (WebAPK).
 */
import sharp from 'sharp';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'icon.png');
const sizes = [192, 512];

if (!existsSync(src)) {
  console.warn('generate-pwa-icons: icon.png não encontrado, pulando.');
  process.exit(0);
}

const buffer = readFileSync(src);
await Promise.all(
  sizes.map((size) =>
    sharp(buffer)
      .resize(size, size)
      .png()
      .toFile(join(root, `icon-${size}.png`))
  )
);
console.log('Ícones PWA gerados: icon-192.png, icon-512.png');
