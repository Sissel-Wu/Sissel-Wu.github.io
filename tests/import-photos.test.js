import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { importPhotos, parseImportArgs, upsertAlbumTitle, validateAlbumId } from '../scripts/import-photos.js';
import { readContentDirectory } from '../src/content/vite-plugin.js';
import { loadContent } from '../src/content/loader.js';

test('parseImportArgs and validateAlbumId validate flags and reject unsafe album names', () => {
  const opts = parseImportArgs(['/tmp/cam', 'kyoto-2026', '--title', '京都', '--format', 'jpeg', '--max-size', '1920', '--quality', '85', '-r', '--overwrite']);
  assert.deepEqual(opts, {
    source: '/tmp/cam',
    album: 'kyoto-2026',
    title: '京都',
    format: 'jpg',
    maxSize: 1920,
    quality: 85,
    recursive: true,
    overwrite: true,
    dryRun: false,
    help: false,
  });

  assert.throws(() => parseImportArgs([]), /请提供源照片路径/);
  assert.throws(() => parseImportArgs(['/tmp/cam', '--format', 'bmp']), /不支持的输出格式/);
  assert.throws(() => parseImportArgs(['/tmp/cam', '--quality', '101']), /1-100/);
  assert.throws(() => validateAlbumId('../escape'), /不能包含路径分隔符/);
  assert.throws(() => validateAlbumId('_draft'), /草稿/);
  assert.throws(() => validateAlbumId('.hidden'), /草稿/);
});

test('upsertAlbumTitle creates or updates title without overwriting existing album metadata', () => {
  const dir = mkdtempSync(join(tmpdir(), 'album-yaml-'));
  try {
    const yamlPath = join(dir, 'album.yaml');
    upsertAlbumTitle(yamlPath, 'First: "Title"');
    assert.equal(readFileSync(yamlPath, 'utf8'), 'title: "First: \\"Title\\""\n');

    writeFileSync(yamlPath, '# comment\ncover: hero.webp\nphotos:\n  - file: hero.webp\n', 'utf8');
    upsertAlbumTitle(yamlPath, 'Updated Title');
    const updated = readFileSync(yamlPath, 'utf8');
    assert.match(updated, /^# comment\ntitle: "Updated Title"\ncover: hero\.webp/);
    assert.match(updated, /- file: hero\.webp/);

    upsertAlbumTitle(yamlPath, 'Final Title');
    assert.match(readFileSync(yamlPath, 'utf8'), /title: "Final Title"/);
    assert.equal((readFileSync(yamlPath, 'utf8').match(/^title:/gm) ?? []).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('importPhotos resizes, auto-orients, strips EXIF, sanitizes names, and produces loadable albums', async () => {
  const root = mkdtempSync(join(tmpdir(), 'import-photos-test-'));
  const srcDir = join(root, 'camera-roll');
  const contentDir = join(root, 'content');
  mkdirSync(srcDir, { recursive: true });
  mkdirSync(contentDir, { recursive: true });

  try {
    // 1. Oversized photo with EXIF Orientation=6 (2400x1600 rotated -> upright 1067x1600) and GPS/EXIF metadata
    await sharp({
      create: { width: 2400, height: 1600, channels: 3, background: { r: 60, g: 120, b: 90 } },
    })
      .withMetadata({
        orientation: 6,
        exif: { IFD0: { Make: 'TestCam' } },
      })
      .jpeg({ quality: 95 })
      .toFile(join(srcDir, '_DSC0001.JPG'));

    // 2. Two files with the same stem but different extensions to test collision handling
    await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 100, g: 110, b: 120 } },
    })
      .png()
      .toFile(join(srcDir, 'street.png'));
    await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 120, g: 110, b: 100 } },
    })
      .jpeg()
      .toFile(join(srcDir, 'street.jpg'));

    // Dry run writes nothing
    const dryOpts = parseImportArgs([srcDir, 'kyoto-2026', '--dry-run']);
    await importPhotos(dryOpts, { contentDir, log: () => {} });
    assert.equal(existsSync(join(contentDir, 'photos', 'kyoto-2026')), false);

    // Real run in webp
    const logs = [];
    const opts = parseImportArgs([srcDir, 'kyoto-2026', '--title', '京都散步']);
    const result = await importPhotos(opts, { contentDir, log: (m) => logs.push(m) });

    assert.equal(result.results.length, 3);
    assert.ok(result.results.every((r) => r.status === 'imported'));

    const albumFiles = readdirSync(result.albumDir).sort();
    assert.deepEqual(albumFiles, ['DSC0001.webp', 'album.yaml', 'street-2.webp', 'street.webp']);

    const meta1 = await sharp(join(result.albumDir, 'DSC0001.webp')).metadata();
    assert.equal(meta1.format, 'webp');
    assert.equal(meta1.width, 1067);
    assert.equal(meta1.height, 1600);
    assert.equal(meta1.exif, undefined);
    assert.equal(meta1.orientation, undefined);

    // Small image is not upscaled
    const meta2 = await sharp(join(result.albumDir, 'street.webp')).metadata();
    assert.equal(meta2.width, 800);
    assert.equal(meta2.height, 600);

    // Re-running without --overwrite skips existing files
    const secondRun = await importPhotos(opts, { contentDir, log: () => {} });
    assert.ok(secondRun.results.every((r) => r.status === 'skipped'));

    // Re-running with --overwrite replaces them
    const overwriteOpts = parseImportArgs([srcDir, 'kyoto-2026', '--overwrite']);
    const thirdRun = await importPhotos(overwriteOpts, { contentDir, log: () => {} });
    assert.ok(thirdRun.results.every((r) => r.status === 'imported'));

    // Verify site content loader recognizes all imported photos
    const raw = readContentDirectory(contentDir);
    const loaded = loadContent({ ...raw, strictMissingAssets: true });
    assert.equal(loaded.photoAlbums.length, 1);
    assert.equal(loaded.photoAlbums[0].title, '京都散步');
    assert.equal(loaded.photoAlbums[0].photos.length, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
