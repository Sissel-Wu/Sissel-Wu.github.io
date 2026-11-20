import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as viteBuild } from 'vite';
import { parseFrontmatter, parseYaml } from '../src/content/yaml.js';
import { renderMarkdown, sanitizeUrl } from '../src/content/markdown.js';
import { loadContent } from '../src/content/loader.js';
import { createContentPlugin, readContentDirectory } from '../src/content/vite-plugin.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const contentRoot = join(repoRoot, 'content');

test('YAML parser handles document markers, YAML 1.2 booleans, URLs with colons, quotes, and block scalars', () => {
  const sample = `\uFEFF--- # document start\r
# Top-level comment\r
title: "Sissel's Notes: Part 1" # inline comment\r
date: 2026-10-24\r
duration: 0:32\r
draft: True\r
published: FALSE\r
empty: NULL\r
order: 2\r
tags: [HCI, "Creative Tools", 'Room #1']\r
links:\r
  - label: GitHub\r
    url: https://github.com/Sissel-Wu#top\r
  - label: Single 'Quoted'\r
    url: 'https://example.com/a:b'\r
summary: |\r
  First line\r
  Second line\r
...\r
`;
  const parsed = parseYaml(sample, { filename: 'sample.yaml' });
  assert.deepEqual(parsed, {
    title: "Sissel's Notes: Part 1",
    date: '2026-10-24',
    duration: '0:32',
    draft: true,
    published: false,
    empty: null,
    order: 2,
    tags: ['HCI', 'Creative Tools', 'Room #1'],
    links: [
      { label: 'GitHub', url: 'https://github.com/Sissel-Wu#top' },
      { label: "Single 'Quoted'", url: 'https://example.com/a:b' },
    ],
    summary: 'First line\nSecond line',
  });

  const listWithDocStart = parseYaml('---\n- title: First\n- title: Second\n...\n', { filename: 'videos.yaml' });
  assert.deepEqual(listWithDocStart, [{ title: 'First' }, { title: 'Second' }]);
});

test('YAML and frontmatter parsers throw clear errors on malformed input instead of silently dropping content', () => {
  assert.throws(() => parseYaml('title: "unclosed', { filename: 'bad.yaml' }), /bad\.yaml:1/);
  assert.throws(() => parseYaml('\tkey: value', { filename: 'tabs.yaml' }), /tabs\.yaml:1/);
  assert.throws(() => parseFrontmatter('---\ntitle: Broken\nno closing fence', { filename: 'broken.md' }), /broken\.md:1/);
  assert.throws(
    () => parseFrontmatter('---\ntitle: Secret\ndraft: true\ndraft: false\n---\nBody', { filename: 'dup.md' }),
    /dup\.md:4: Duplicate key "draft"/,
  );
  assert.throws(
    () => parseYaml('- draft: true\n  draft: false\n', { filename: 'seq-dup.yaml' }),
    /seq-dup\.yaml:2: Duplicate key "draft"/,
  );
  assert.throws(
    () => parseFrontmatter('---\ntitle: Secret\n...\ndraft: true\n---\nBody', { filename: 'after-end.md' }),
    /after-end\.md:4: Unexpected content after document end/,
  );
  assert.throws(
    () => loadContent({
      articleFiles: { '../content/articles/bad-draft.md': '---\ntitle: X\ndraft: maybe\n---\nHi' },
    }),
    /"draft" must be a boolean/,
  );
  assert.throws(
    () => loadContent({
      videoMetaFiles: { '../content/videos/videos.yaml': 'just-a-string' },
    }),
    /Videos manifest must be a list/,
  );
});

test('sanitizeUrl and renderMarkdown block control-char protocol bypasses, resolve local links, and support balanced parens', () => {
  for (const unsafe of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    '\u0001javascript:alert(1)',
    '  javascript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
  ]) {
    assert.equal(sanitizeUrl(unsafe), '', `expected unsafe URL to be rejected: ${JSON.stringify(unsafe)}`);
    assert.equal(sanitizeUrl(unsafe, { allowDataImage: true }), '', `expected unsafe img URL to be rejected: ${JSON.stringify(unsafe)}`);
  }

  assert.equal(sanitizeUrl('data:image/png;base64,AAAA', { allowDataImage: true }), 'data:image/png;base64,AAAA');
  assert.equal(sanitizeUrl('data:image/png;base64,AAAA', { allowDataImage: false }), '');
  assert.equal(sanitizeUrl('mailto:hi@example.com', { allowMailto: true }), 'mailto:hi@example.com');
  assert.equal(sanitizeUrl('mailto:hi@example.com', { allowMailto: false }), '');

  const md = [
    '## 小节标题',
    '',
    '这是 **加粗**、*斜体*、`const x = 1 < 2` 和 [`链接`](https://en.wikipedia.org/wiki/Markdown_(markup_language))。',
    '',
    '> 引用中的 <script>alert(1)</script>',
    '',
    '- [控制字符绕过](java\tscript:alert(1))',
    '- [查看原图](./pic.jpg)',
    '',
    '![示例图](./pic.jpg)',
    '',
    '```js',
    'const ok = a && b;',
    '```',
  ].join('\n');

  const resolveLocal = (src) => (src === './pic.jpg' ? './assets/pic-123.jpg' : src);
  const html = renderMarkdown(md, {
    resolveAsset: resolveLocal,
    resolveLinkAsset: resolveLocal,
  });

  assert.match(html, /<h3>小节标题<\/h3>/);
  assert.match(html, /<strong>加粗<\/strong>/);
  assert.match(html, /<em>斜体<\/em>/);
  assert.match(html, /<code>const x = 1 &lt; 2<\/code>/);
  assert.match(
    html,
    /<a href="https:\/\/en\.wikipedia\.org\/wiki\/Markdown_\(markup_language\)" target="_blank" rel="noreferrer"><code>链接<\/code><\/a>/,
  );
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /href="java/i);
  assert.match(html, /<a href="\.\/assets\/pic-123\.jpg">查看原图<\/a>/);
  assert.match(html, /<img src="\.\/assets\/pic-123\.jpg" alt="示例图" loading="lazy">/);
  assert.match(html, /<pre><code>const ok = a &amp;&amp; b;<\/code><\/pre>/);
});

test('loadContent preserves unique article IDs across dates and rejects duplicate or empty explicit IDs', () => {
  const loaded = loadContent({
    articleFiles: {
      '../content/articles/2026-01-01-notes.md': '# Old Notes\n\nOld body.',
      '../content/articles/2026-02-01-notes.md': '# New Notes\n\nNew body.',
      '../content/articles/index.md': '# Root Index\n\nRoot body.',
      '../content/articles/2026-03-01-bundle/index.md': '---\ntitle: Bundle\n---\n\n[原图](./fig.png)\n\n![图](./fig.png)',
    },
    imageAssets: {
      '../content/articles/2026-03-01-bundle/fig.png': './assets/fig.png',
    },
  });

  assert.deepEqual(
    loaded.posts.map((p) => p.id),
    ['2026-03-01-bundle', '2026-02-01-notes', '2026-01-01-notes', 'index'],
  );
  assert.match(loaded.posts[0].html, /<a href="\.\/assets\/fig\.png">原图<\/a>/);
  assert.match(loaded.posts[0].html, /<img src="\.\/assets\/fig\.png" alt="图" loading="lazy">/);

  assert.throws(
    () => loadContent({
      articleFiles: {
        '../content/articles/a.md': '---\nid: same\ntitle: A\n---\nA',
        '../content/articles/b.md': '---\nid: same\ntitle: B\n---\nB',
      },
    }),
    /Duplicate article id "same"/,
  );

  assert.throws(
    () => loadContent({
      articleFiles: {
        '../content/articles/empty-id.md': '---\nid: ""\ntitle: Empty\n---\nBody',
      },
    }),
    /must not be empty/,
  );
});

test('loadContent excludes drafted album photos from auto-append and deduplicates URL-encoded filenames', () => {
  const loaded = loadContent({
    photoMetaFiles: {
      '../content/photos/curated/album.yaml': `title: 精选
order: 1
cover: cover%20image.jpg
photos:
  - file: morning%20light.jpg
    title: 晨光
  - file: secret.jpg
    title: 草稿照片
    draft: True
`,
      '../content/photos/strict/album.yaml': `title: 仅列表
order: 2
includeUnlisted: false
photos:
  - file: keep.jpg
    title: 保留
`,
      '../content/photos/hidden/album.yaml': 'title: 隐藏\ndraft: true\n',
    },
    imageAssets: {
      '../content/photos/curated/cover image.jpg': './assets/cover.jpg',
      '../content/photos/curated/morning light.jpg': './assets/morning.jpg',
      '../content/photos/curated/secret.jpg': './assets/secret.jpg',
      '../content/photos/curated/extra.jpg': './assets/extra.jpg',
      '../content/photos/strict/keep.jpg': './assets/keep.jpg',
      '../content/photos/strict/extra.jpg': './assets/extra.jpg',
      '../content/photos/hidden/x.jpg': './assets/x.jpg',
      '../content/photos/京都散步/10-夜晚.Jpg': './assets/10.jpg',
      '../content/photos/京都散步/2-清晨.jpg': './assets/2.jpg',
    },
  });

  assert.deepEqual(loaded.photoAlbums.map((a) => a.title), ['精选', '仅列表', '京都散步']);
  assert.equal(loaded.photoAlbums[0].cover, './assets/cover.jpg');
  // morning light.jpg appears once, secret.jpg (draft) is not re-added, cover image.jpg is not duplicated.
  assert.deepEqual(loaded.photoAlbums[0].photos, [
    { src: './assets/morning.jpg', title: '晨光' },
    { src: './assets/extra.jpg', title: 'Extra' },
  ]);
  assert.deepEqual(loaded.photoAlbums[1].photos, [{ src: './assets/keep.jpg', title: '保留' }]);
  assert.deepEqual(loaded.photoAlbums[2].photos.map((p) => p.title), ['清晨', '夜晚']);
  assert.equal(loaded.photoAlbums[2].cover, './assets/2.jpg');
});

test('Vite build excludes drafts and draft-only assets, bundles mixed-case extensions, and resolves subpath local links', async () => {
  const tempRoot = realpathSync(mkdtempSync(join(tmpdir(), 'homebench-content-build-')));
  const fixtureContent = join(tempRoot, 'content');
  const outDir = join(tempRoot, 'dist');

  try {
    mkdirSync(join(fixtureContent, 'articles', '2026-05-01-story'), { recursive: true });
    mkdirSync(join(fixtureContent, 'articles', '2026-05-02-secret-bundle'), { recursive: true });
    mkdirSync(join(fixtureContent, 'photos', 'trip'), { recursive: true });
    mkdirSync(join(fixtureContent, 'photos', 'draft-album'), { recursive: true });
    mkdirSync(join(fixtureContent, 'videos'), { recursive: true });

    // 5 KB payloads so Vite emits real asset files under dist/assets/ instead of base64 inlining.
    const fakeImageA = Buffer.alloc(5120, 0x61);
    const fakeImageDraft = Buffer.alloc(5120, 0x64);
    const fakeImageAlbum = Buffer.alloc(5120, 0x62);

    writeFileSync(join(fixtureContent, 'profile.md'), '---\nname: Fixture\n---\nHello.');
    writeFileSync(
      join(fixtureContent, 'articles', '2026-05-01-story', 'index.md'),
      '---\ntitle: Public Story\n---\n\n![Pic](./Hero.Jpg)\n\n[Full Size](./Hero.Jpg)\n',
    );
    writeFileSync(join(fixtureContent, 'articles', '2026-05-01-story', 'Hero.Jpg'), fakeImageA);

    writeFileSync(
      join(fixtureContent, 'articles', '2026-05-02-secret-bundle', 'index.md'),
      '---\ntitle: Secret Draft\ndraft: True\n---\n\nTOP_SECRET_DRAFT_MARKER\n\n![Secret](./secret-only.Jpg)\n',
    );
    writeFileSync(join(fixtureContent, 'articles', '2026-05-02-secret-bundle', 'secret-only.Jpg'), fakeImageDraft);
    writeFileSync(join(fixtureContent, 'articles', '_hidden.md'), '# Hidden\n\nUNDERSCORE_SECRET_MARKER\n');

    writeFileSync(join(fixtureContent, 'photos', 'trip', '01-MixedCase.Jpg'), fakeImageAlbum);
    writeFileSync(join(fixtureContent, 'photos', 'draft-album', 'album.yaml'), 'title: Draft Album\ndraft: true\n');
    writeFileSync(join(fixtureContent, 'photos', 'draft-album', 'never-emit.jpg'), fakeImageDraft);
    writeFileSync(join(fixtureContent, 'videos', 'videos.yaml'), '---\n- title: Demo Clip\n  image: ../photos/trip/01-MixedCase.Jpg\n');

    const entryPath = join(tempRoot, 'entry.js');
    writeFileSync(
      entryPath,
      'export { profile, posts, photoAlbums, videos } from "virtual:site-content";\n',
    );

    await viteBuild({
      root: tempRoot,
      base: './',
      logLevel: 'silent',
      plugins: [createContentPlugin({ contentDir: fixtureContent })],
      build: {
        outDir,
        emptyOutDir: true,
        rollupOptions: { input: entryPath, preserveEntrySignatures: 'strict' },
      },
    });

    const assetFiles = readdirSync(join(outDir, 'assets'));
    const jsFile = assetFiles.find((name) => name.endsWith('.js'));
    assert.ok(jsFile, 'expected built JS bundle');
    const jsPath = join(outDir, 'assets', jsFile);
    const jsText = readFileSync(jsPath, 'utf8');

    // Draft text and draft-only assets must never enter dist/.
    assert.ok(!jsText.includes('TOP_SECRET_DRAFT_MARKER'), 'draft: true body leaked into dist JS');
    assert.ok(!jsText.includes('UNDERSCORE_SECRET_MARKER'), '_hidden.md body leaked into dist JS');
    assert.ok(!assetFiles.some((name) => name.includes('secret-only')), 'draft article image leaked into dist/assets');
    assert.ok(!assetFiles.some((name) => name.includes('never-emit')), 'draft album image leaked into dist/assets');

    // Mixed-case .Jpg assets must be bundled and referenced cleanly.
    const heroAsset = assetFiles.find((name) => name.startsWith('Hero-') && name.endsWith('.Jpg'));
    const albumAsset = assetFiles.find((name) => name.startsWith('01-MixedCase-') && name.endsWith('.Jpg'));
    assert.ok(heroAsset, 'expected Hero.Jpg to be emitted in dist/assets');
    assert.ok(albumAsset, 'expected 01-MixedCase.Jpg to be emitted in dist/assets');

    // Import the real built ES module to verify both <img> and <a> resolve to the emitted asset URL.
    const built = await import(pathToFileURL(jsPath).href);
    const { posts, photoAlbums, videos } = built;
    const expectedHeroUrl = pathToFileURL(join(outDir, 'assets', heroAsset)).href;
    const expectedAlbumUrl = pathToFileURL(join(outDir, 'assets', albumAsset)).href;

    assert.equal(posts.length, 1);
    assert.ok(posts[0].html.includes(`<img src="${expectedHeroUrl}" alt="Pic" loading="lazy">`));
    assert.ok(posts[0].html.includes(`<a href="${expectedHeroUrl}">Full Size</a>`));
    assert.equal(photoAlbums.length, 1);
    assert.equal(photoAlbums[0].photos[0].src, expectedAlbumUrl);
    assert.equal(videos.length, 1);
    assert.equal(videos[0].image, expectedAlbumUrl);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('repository content/ satisfies schema, uniqueness, safety, and media integrity invariants', () => {
  const rawContent = readContentDirectory(contentRoot);
  const data = loadContent({
    ...rawContent,
    strictMissingAssets: true,
  });

  // Profile invariants (does not hardcode editable author values).
  assert.equal(typeof data.profile.name, 'string');
  assert.ok(data.profile.name.length > 0, 'profile.name should not be empty');
  assert.equal(typeof data.profile.bio, 'string');
  for (const link of data.profile.links) {
    assert.ok(link.label.length > 0);
    assert.equal(sanitizeUrl(link.url), link.url, `profile link must be a safe URL: ${link.url}`);
  }

  // Article invariants.
  const seenIds = new Set();
  for (const post of data.posts) {
    assert.ok(post.id.length > 0, 'article id must be non-empty');
    assert.ok(!seenIds.has(post.id), `duplicate article id: ${post.id}`);
    seenIds.add(post.id);
    assert.ok(post.title.length > 0, `article ${post.id} must have a title`);
    assert.ok(post.category.length > 0, `article ${post.id} must have a category`);
    assert.ok(post.html.length > 0, `article ${post.id} must render non-empty HTML`);
  }

  // Photo album invariants.
  for (const album of data.photoAlbums) {
    assert.ok(album.title.length > 0, `album ${album.id} must have a title`);
    assert.ok(album.cover.length > 0, `album ${album.id} must have a cover`);
    assert.ok(album.photos.length > 0, `album ${album.id} must have at least one photo`);
    for (const photo of album.photos) {
      assert.ok(photo.src.length > 0);
      assert.ok(photo.title.length > 0);
    }
  }

  // Video & music invariants.
  for (const video of data.videos) {
    assert.ok(video.title.length > 0);
    if (video.url) {
      assert.equal(sanitizeUrl(video.url, { allowMailto: false }), video.url);
    }
  }
  for (const track of data.musicTracks) {
    assert.ok(track.title.length > 0);
    assert.ok(track.src.length > 0);
  }
});
