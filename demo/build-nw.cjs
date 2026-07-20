const fs = require('fs');

async function build() {
  const { default: nwbuild } = await import('nw-builder');

  // Generate icon
  const png = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52,0x00,0x00,0x00,0x20,0x00,0x00,0x00,0x20,0x08,0x06,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0A,0x49,0x44,0x41,0x54,0x78,0x9C,0x62,0x60,0x00,0x00,0x00,0x00,0x00,0xFF,0xFF,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x49,0x45,0x4E,0x44,0xAE,0x42,0x60,0x82]);
  const ico = Buffer.alloc(6+16+png.length);
  ico.writeUInt16LE(0,0); ico.writeUInt16LE(1,2); ico.writeUInt16LE(1,4);
  ico.writeUInt8(32,6); ico.writeUInt8(32,7); ico.writeUInt8(0,8); ico.writeUInt8(0,9);
  ico.writeUInt16LE(1,10); ico.writeUInt16LE(32,12); ico.writeUInt32LE(png.length,14); ico.writeUInt32LE(22,18);
  png.copy(ico,22); fs.writeFileSync('./dist/icon.ico', ico);

  // Prepare package.nw with game files
  const pkgDir = './dist-nw/package.nw';
  fs.rmSync('./dist-nw', { recursive: true, force: true });
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.cpSync('./dist', pkgDir, { recursive: true });

  // NW.js manifest — loads dist/index.html directly
  fs.writeFileSync(pkgDir + '/package.json', JSON.stringify({
    name: 'tactical-range',
    version: '1.0.0',
    main: 'index.html',
    window: { title: 'Tactical Range', width: 1920, height: 1080, resizable: true, position: 'center', frame: true },
    'chromium-args': '--enable-webgl --ignore-gpu-blocklist',
  }, null, 2));

  // Build
  await nwbuild({
    srcDir: pkgDir, mode: 'build', platform: 'win', arch: 'x64',
    outDir: './release', flavor: 'normal', cacheDir: './cache', glob: false,
    app: { icon: './dist/icon.ico' },
  });

  fs.rmSync('./dist-nw', { recursive: true, force: true });
  console.log('✅ Done — demo/release/tactical-range.exe');
}

build().catch(e => { console.error(e.message); process.exit(1); });
