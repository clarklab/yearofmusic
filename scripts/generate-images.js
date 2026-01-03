const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function generateImages() {
  const publicDir = path.join(__dirname, '../public');

  // Read the SVG file
  const svgBuffer = fs.readFileSync(path.join(publicDir, 'og-image.svg'));

  // Generate OG image (1200x630)
  await sharp(svgBuffer)
    .resize(1200, 630)
    .png()
    .toFile(path.join(publicDir, 'og-image.png'));

  console.log('✓ Generated og-image.png (1200x630)');

  // Create a simple icon SVG for favicons
  const iconSvg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1DB954;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1aa34a;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="64" fill="url(#grad)"/>
  <path d="M200 300 L200 120 L360 80 L360 260 C360 296 336 320 300 320 C264 320 240 296 240 260 C240 224 264 200 300 200 C312 200 324 204 336 212 L336 140 L240 164 L240 300 C240 336 216 360 180 360 C144 360 120 336 120 300 C120 264 144 240 180 240 C192 240 204 244 216 252"
        fill="white"
        stroke="white"
        stroke-width="12"/>
</svg>`;

  // Generate favicons
  await sharp(Buffer.from(iconSvg))
    .resize(32, 32)
    .png()
    .toFile(path.join(publicDir, 'favicon-32x32.png'));

  console.log('✓ Generated favicon-32x32.png');

  await sharp(Buffer.from(iconSvg))
    .resize(16, 16)
    .png()
    .toFile(path.join(publicDir, 'favicon-16x16.png'));

  console.log('✓ Generated favicon-16x16.png');

  await sharp(Buffer.from(iconSvg))
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  console.log('✓ Generated apple-touch-icon.png (180x180)');

  // Also create a favicon.ico equivalent (32x32 PNG that browsers will accept)
  await sharp(Buffer.from(iconSvg))
    .resize(32, 32)
    .png()
    .toFile(path.join(publicDir, 'favicon.ico'));

  console.log('✓ Generated favicon.ico (32x32 PNG format)');

  console.log('\n✅ All images generated successfully!');
}

generateImages().catch(console.error);
