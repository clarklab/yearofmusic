import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateImages() {
  const publicDir = path.join(__dirname, '../public');

  // Read the favicon SVG file
  const faviconSvg = fs.readFileSync(path.join(publicDir, 'favicon.svg'));

  // Generate favicons
  await sharp(faviconSvg)
    .resize(32, 32)
    .png()
    .toFile(path.join(publicDir, 'favicon-32x32.png'));

  console.log('✓ Generated favicon-32x32.png');

  await sharp(faviconSvg)
    .resize(16, 16)
    .png()
    .toFile(path.join(publicDir, 'favicon-16x16.png'));

  console.log('✓ Generated favicon-16x16.png');

  await sharp(faviconSvg)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  console.log('✓ Generated apple-touch-icon.png (180x180)');

  // Also create a favicon.ico equivalent (32x32 PNG that browsers will accept)
  await sharp(faviconSvg)
    .resize(32, 32)
    .png()
    .toFile(path.join(publicDir, 'favicon.ico'));

  console.log('✓ Generated favicon.ico (32x32 PNG format)');

  console.log('\n✅ All images generated successfully!');
}

generateImages().catch(console.error);
