const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function convert() {
  const src = path.join(__dirname, '..', 'image', 'tenkaiz.jpg');
  if (!fs.existsSync(src)) {
    console.error('Source image not found:', src);
    process.exit(1);
  }

  const outDir = path.join(__dirname, '..', 'image');
  try {
    const webp1 = path.join(outDir, 'tenkaiz.webp');
    const webp2 = path.join(outDir, 'tenkaiz@2x.webp');
    const webpMobile1 = path.join(outDir, 'tenkaiz-mobile.webp');
    const webpMobile2 = path.join(outDir, 'tenkaiz-mobile@2x.webp');

    await sharp(src)
      .resize({ width: 1200 })
      .webp({ quality: 76 })
      .toFile(webp1);

    await sharp(src)
      .resize({ width: 2400 })
      .webp({ quality: 72 })
      .toFile(webp2);

    // Mobile-cropped variants: resize with cover to center-crop safely
    await sharp(src)
      .resize({ width: 800, height: 300, fit: 'cover', position: 'centre' })
      .webp({ quality: 70 })
      .toFile(webpMobile1);

    await sharp(src)
      .resize({ width: 1600, height: 600, fit: 'cover', position: 'centre' })
      .webp({ quality: 68 })
      .toFile(webpMobile2);

    console.log('Converted to:', webp1, webp2, webpMobile1, webpMobile2);
  } catch (err) {
    console.error('Conversion error:', err);
    process.exit(1);
  }
}

convert();
