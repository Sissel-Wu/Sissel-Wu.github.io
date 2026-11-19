import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, parseYaml } from '../src/content/yaml.js';
import { renderMarkdown, sanitizeUrl } from '../src/content/markdown.js';
import { loadContent } from '../src/content/loader.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const contentRoot = join(repoRoot, 'content');

function walkFiles(dir, baseDir = dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      results.push({
        fullPath,
        relPath: relative(baseDir, fullPath).replace(/\\/g, '/'),
      });
    }
  }
  return results;
}

test('YAML parser handles URLs with colons, nested lists of objects, quotes, comments, and block scalars', () => {
  const sample = `\uFEFF# Top-level comment\r
title: "Sissel's Notes: Part 1" # inline comment\r
date: 2026-10-24\r
duration: 0:32\r
draft: false\r
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
`;
  const parsed = parseYaml(sample);
  assert.deepEqual(parsed, {
    title: "Sissel's Notes: Part 1",
    date: '2026-10-24',
    duration: '0:32',
    draft: false,
    order: 2,
    tags: ['HCI', 'Creative Tools', 'Room #1'],
    links: [
      { label: 'GitHub', url: 'https://github.com/Sissel-Wu#top' },
      { label: "Single 'Quoted'", url: 'https://example.com/a:b' },
    ],
    summary: 'First line\nSecond line',
  });
});

test('parseFrontmatter separates metadata from markdown body and tolerates missing frontmatter', () => {
  const withFm = parseFrontmatter('---\ntitle: 你好\ndate: 2026-11-19\n---\n\n正文段落。');
  assert.deepEqual(withFm, {
    data: { title: '你好', date: '2026-11-19' },
    body: '正文段落。',
  });

  const withoutFm = parseFrontmatter('# 纯标题\n\n第一段。');
  assert.deepEqual(withoutFm, {
    data: {},
    body: '# 纯标题\n\n第一段。',
  });
});

test('renderMarkdown formats common markdown, resolves local images, and blocks unsafe URLs', () => {
  const md = [
    '## 小节标题',
    '',
    '这是 **加粗**、*斜体*、`const x = 1 < 2` 和 [`链接`](https://example.com)。',
    '',
    '> 引用中的 <script>alert(1)</script>',
    '',
    '- 条目一',
    '- [坏链接](javascript:alert(1))',
    '',
    '![示例图](./pic.jpg)',
    '',
    '```js',
    'const ok = a && b;',
    '```',
  ].join('\n');

  const html = renderMarkdown(md, {
    resolveAsset: (src) => (src === './pic.jpg' ? './assets/pic-123.jpg' : src),
  });

  assert.match(html, /<h3>小节标题<\/h3>/);
  assert.match(html, /<strong>加粗<\/strong>/);
  assert.match(html, /<em>斜体<\/em>/);
  assert.match(html, /<code>const x = 1 &lt; 2<\/code>/);
  assert.match(html, /<a href="https:\/\/example\.com" target="_blank" rel="noreferrer"><code>链接<\/code><\/a>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /javascript:/i);
  assert.match(html, /<img src="\.\/assets\/pic-123\.jpg" alt="示例图" loading="lazy">/);
  assert.match(html, /<pre><code>const ok = a &amp;&amp; b;<\/code><\/pre>/);
  assert.equal(sanitizeUrl('data:image/png;base64,AAAA', { allowDataImage: true }), 'data:image/png;base64,AAAA');
  assert.equal(sanitizeUrl('data:text/html,<svg/onload=alert(1)>', { allowDataImage: true }), '');
});

test('loadContent supports zero-config albums, folder-bundled articles, drafts, and natural sorting', () => {
  const loaded = loadContent({
    profileFiles: {
      '../content/profile.md': `---
name: Tester
links:
  - label: Safe
    url: https://example.com
  - label: Bad
    url: javascript:alert(1)
---
Hello **world**.`,
    },
    articleFiles: {
      '../content/articles/README.md': '# Should be ignored',
      '../content/articles/_wip.md': '# Ignored underscore draft',
      '../content/articles/draft.md': '---\ntitle: Draft\ndraft: true\n---\nHidden',
      '../content/articles/2026-01-05-older.md': '# 老文章\n\n第一段。',
      '../content/articles/2026-05-01-bundle/index.md': '---\ntitle: 配图文章\n---\n\n![图](./fig.png)',
    },
    photoMetaFiles: {
      '../content/photos/curated/album.yaml': `title: 精选
order: 1
cover: cover.jpg
photos:
  - file: b.jpg
    title: 第一张
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
      '../content/articles/2026-05-01-bundle/fig.png': './assets/fig.png',
      '../content/photos/curated/cover.jpg': './assets/cover.jpg',
      '../content/photos/curated/a.jpg': './assets/a.jpg',
      '../content/photos/curated/b.jpg': './assets/b.jpg',
      '../content/photos/strict/keep.jpg': './assets/keep.jpg',
      '../content/photos/strict/extra.jpg': './assets/extra.jpg',
      '../content/photos/hidden/x.jpg': './assets/x.jpg',
      '../content/photos/京都散步/10-夜晚.JPG': './assets/10.jpg',
      '../content/photos/京都散步/2-清晨.jpg': './assets/2.jpg',
    },
    videoMetaFiles: {
      '../content/videos/videos.yaml': `- title: 短片
  image: ../photos/curated/a.jpg
  url: https://www.bilibili.com/video/BV1test
- title: 无链接视频
`,
    },
    audioAssets: {
      '../content/music/02-night.wav': './assets/night.wav',
      '../content/music/01-rain.wav': './assets/rain.wav',
    },
  });

  assert.equal(loaded.profile.name, 'Tester');
  assert.deepEqual(loaded.profile.links, [{ label: 'Safe', url: 'https://example.com' }]);
  assert.match(loaded.profile.bioHtml, /<strong>world<\/strong>/);

  assert.deepEqual(loaded.posts.map((p) => p.id), ['bundle', 'older']);
  assert.equal(loaded.posts[0].title, '配图文章');
  assert.match(loaded.posts[0].html, /src="\.\/assets\/fig\.png"/);
  assert.equal(loaded.posts[1].title, '老文章');
  assert.equal(loaded.posts[1].category, 'work');
  assert.equal(loaded.posts[1].date, '2026.01.05');

  assert.deepEqual(loaded.photoAlbums.map((a) => a.title), ['精选', '仅列表', '京都散步']);
  assert.equal(loaded.photoAlbums[0].cover, './assets/cover.jpg');
  assert.deepEqual(loaded.photoAlbums[0].photos.map((p) => p.src), ['./assets/b.jpg', './assets/a.jpg']);
  assert.deepEqual(loaded.photoAlbums[1].photos.map((p) => p.src), ['./assets/keep.jpg']);
  assert.deepEqual(loaded.photoAlbums[2].photos.map((p) => p.title), ['清晨', '夜晚']);
  assert.equal(loaded.photoAlbums[2].cover, './assets/2.jpg');

  assert.deepEqual(loaded.videos, [
    { title: '短片', image: './assets/a.jpg', url: 'https://www.bilibili.com/video/BV1test' },
    { title: '无链接视频' },
  ]);
  assert.deepEqual(loaded.musicTracks, [
    { title: 'Rain', src: './assets/rain.wav' },
    { title: 'Night', src: './assets/night.wav' },
  ]);
});

test('repository content/ files load cleanly with no broken media references', () => {
  const files = walkFiles(contentRoot);
  const profileFiles = {};
  const articleFiles = {};
  const photoMetaFiles = {};
  const videoMetaFiles = {};
  const musicMetaFiles = {};
  const imageAssets = {};
  const audioAssets = {};

  const imageExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg']);
  const audioExts = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']);
  const metaExts = new Set(['.yaml', '.yml', '.json']);

  for (const { fullPath, relPath } of files) {
    const ext = extname(relPath).toLowerCase();
    const key = `../content/${relPath}`;
    if (/^profile\.(?:md|ya?ml|json)$/i.test(relPath)) {
      profileFiles[key] = readFileSync(fullPath, 'utf8');
    } else if (relPath.startsWith('articles/') && ext === '.md') {
      articleFiles[key] = readFileSync(fullPath, 'utf8');
    } else if (/^photos\/[^/]+\/(?:album|index)\.(?:ya?ml|json)$/i.test(relPath)) {
      photoMetaFiles[key] = readFileSync(fullPath, 'utf8');
    } else if (relPath.startsWith('videos/') && metaExts.has(ext)) {
      videoMetaFiles[key] = readFileSync(fullPath, 'utf8');
    } else if (relPath.startsWith('music/') && metaExts.has(ext)) {
      musicMetaFiles[key] = readFileSync(fullPath, 'utf8');
    }
    if (imageExts.has(ext)) imageAssets[key] = `./mock/${relPath}`;
    if (audioExts.has(ext)) audioAssets[key] = `./mock/${relPath}`;
  }

  const data = loadContent({
    profileFiles,
    articleFiles,
    photoMetaFiles,
    videoMetaFiles,
    musicMetaFiles,
    imageAssets,
    audioAssets,
  });

  assert.equal(data.profile.name, 'Sissel');
  assert.equal(data.profile.links.length, 2);
  assert.ok(data.profile.bio.includes('你好，我是 Sissel'));

  assert.deepEqual(
    data.posts.filter((p) => p.category === 'work').map((p) => p.id),
    ['tools', 'research'],
  );
  assert.equal(data.posts.length, 8);
  for (const post of data.posts) {
    assert.ok(post.title.length > 0);
    assert.ok(post.body.length >= 3);
    assert.ok(post.html.includes('<p>'));
  }

  assert.equal(data.photoAlbums.length, 1);
  assert.equal(data.photoAlbums[0].title, '沿途所见');
  assert.equal(data.photoAlbums[0].cover, './mock/photos/along-the-way/coast.jpg');
  assert.equal(data.photoAlbums[0].photos.length, 4);

  assert.equal(data.videos.length, 3);
  for (const video of data.videos) {
    assert.ok(video.image?.startsWith('./mock/'));
  }

  assert.equal(data.musicTracks.length, 2);
  for (const track of data.musicTracks) {
    assert.ok(track.src.startsWith('./mock/music/'));
  }
});
