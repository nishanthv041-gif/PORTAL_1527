const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const rootDir = path.resolve(__dirname, '..');
const logoPath = path.join(rootDir, 'public', 'logo', 'srt-logo.png');
const campusImgPath = path.join(rootDir, 'public', 'images', 'school_3d_moss_campus.jpg');
const iconsDir = path.join(rootDir, 'public', 'icons');
const imagesDir = path.join(rootDir, 'public', 'images');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

async function generateIcons() {
  console.log('Generating PWA icons from:', logoPath);

  // 1. Apple Touch Icon 180x180 - STRICTLY OPAQUE (no alpha channel, crisp white background)
  // Apple guidelines: 180x180, square, no rounded corners (iOS applies radius), solid background
  const appleTouchBuffer = await sharp({
    create: {
      width: 180,
      height: 180,
      channels: 3, // RGB only, NO alpha channel!
      background: { r: 255, g: 255, b: 255 }
    }
  })
  .composite([
    {
      input: await sharp(logoPath).resize(150, 150, { fit: 'contain' }).toBuffer(),
      gravity: 'centre'
    }
  ])
  .flatten({ background: '#ffffff' })
  .removeAlpha()
  .png({ compressionLevel: 9, palette: false })
  .toBuffer();

  // Save to both public/apple-touch-icon.png and public/icons/apple-touch-icon.png
  fs.writeFileSync(path.join(rootDir, 'public', 'apple-touch-icon.png'), appleTouchBuffer);
  fs.writeFileSync(path.join(iconsDir, 'apple-touch-icon.png'), appleTouchBuffer);
  console.log('✓ Generated opaque apple-touch-icon.png (180x180, hasAlpha: false)');

  // 2. Standard 192x192 icon (any)
  await sharp(logoPath)
    .resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(iconsDir, 'icon-192x192.png'));
  console.log('✓ Generated icon-192x192.png');

  // 3. Standard 512x512 icon (any)
  await sharp(logoPath)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(iconsDir, 'icon-512x512.png'));
  console.log('✓ Generated icon-512x512.png');

  // 4. Maskable 192x192 icon (20% safe-area inset on white/navy background)
  await sharp({
    create: {
      width: 192,
      height: 192,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
  .composite([
    {
      input: await sharp(logoPath).resize(150, 150, { fit: 'contain' }).toBuffer(),
      gravity: 'centre'
    }
  ])
  .png({ compressionLevel: 9 })
  .toFile(path.join(iconsDir, 'icon-maskable-192x192.png'));
  console.log('✓ Generated icon-maskable-192x192.png');

  // 5. Maskable 512x512 icon (20% safe-area inset on white/navy background)
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
  .composite([
    {
      input: await sharp(logoPath).resize(400, 400, { fit: 'contain' }).toBuffer(),
      gravity: 'centre'
    }
  ])
  .png({ compressionLevel: 9 })
  .toFile(path.join(iconsDir, 'icon-maskable-512x512.png'));
  console.log('✓ Generated icon-maskable-512x512.png');

  // 6. Generate static OpenGraph & Twitter preview image (1200x630, < 200KB)
  // Combines official crest, school branding, and crisp typography for social/WhatsApp shares
  const svgOverlay = `
  <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0b1329" />
        <stop offset="50%" stop-color="#0f172a" />
        <stop offset="100%" stop-color="#1e293b" />
      </linearGradient>
      <linearGradient id="goldText" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#facc15" />
        <stop offset="100%" stop-color="#fbbf24" />
      </linearGradient>
    </defs>
    
    <!-- Background -->
    <rect width="1200" height="630" fill="url(#bg)" />
    <circle cx="1050" cy="150" r="300" fill="#3b82f6" opacity="0.08" />
    <circle cx="150" cy="500" r="250" fill="#facc15" opacity="0.06" />

    <!-- Border highlight -->
    <rect x="24" y="24" width="1152" height="582" rx="20" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="2" />
    
    <!-- Crest Badge Container -->
    <rect x="120" y="165" width="300" height="300" rx="28" fill="#ffffff" stroke="#facc15" stroke-width="4" filter="drop-shadow(0 15px 30px rgba(0,0,0,0.5))" />

    <!-- Text Group -->
    <g transform="translate(480, 220)">
      <rect x="0" y="0" width="220" height="36" rx="18" fill="rgba(59, 130, 246, 0.2)" stroke="#3b82f6" stroke-width="1.5" />
      <text x="110" y="24" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" fill="#60a5fa" text-anchor="middle" letter-spacing="1.5">OFFICIAL PORTAL</text>
      
      <text x="0" y="85" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="52" font-weight="800" fill="url(#goldText)" letter-spacing="0.5">SRT UNIVERSAL</text>
      <text x="0" y="145" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="52" font-weight="800" fill="#ffffff" letter-spacing="0.5">SCHOOL PORTAL</text>
      
      <text x="0" y="200" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="500" fill="#94a3b8">Academic Records • Attendance • Report Cards • Announcements</text>
    </g>
  </svg>
  `;

  const logoSmall = await sharp(logoPath).resize(250, 250, { fit: 'contain' }).toBuffer();

  const ogBuffer = await sharp(Buffer.from(svgOverlay))
    .composite([
      {
        input: logoSmall,
        left: 145,
        top: 190
      }
    ])
    .png({ quality: 90, compressionLevel: 8 })
    .toBuffer();

  fs.writeFileSync(path.join(imagesDir, 'og-preview.png'), ogBuffer);
  console.log(`✓ Generated og-preview.png (1200x630, size: ${Math.round(ogBuffer.length / 1024)} KB)`);

  console.log('--- All PWA icons & previews generated successfully ---');
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
