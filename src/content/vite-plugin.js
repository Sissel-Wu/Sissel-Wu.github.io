import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { loadContent } from './loader.js';

export const VIRTUAL_CONTENT_ID = 'virtual:site-content';
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_CONTENT_ID}`;

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']);
const META_EXTS = new Set(['.yaml', '.yml', '.json']);

function walkContentDir(dir, baseDir, results = []) {
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkContentDir(fullPath, baseDir, results);
    } else if (entry.isFile()) {
      results.push({
        fullPath,
        relPath: relative(baseDir, fullPath).replace(/\\/g, '/'),
      });
    }
  }
  return results;
}

export function readContentDirectory(contentDir) {
  const root = resolve(contentDir);
  const files = walkContentDir(root, root);

  const profileFiles = {};
  const articleFiles = {};
  const photoMetaFiles = {};
  const videoMetaFiles = {};
  const musicMetaFiles = {};
  const imageAssets = {};
  const audioAssets = {};
  const assetDiskPaths = {};
  const watchedFiles = [];

  for (const { fullPath, relPath } of files) {
    const ext = extname(relPath).toLowerCase();
    if (/^profile\.(?:md|ya?ml|json)$/i.test(relPath)) {
      profileFiles[relPath] = readFileSync(fullPath, 'utf8');
      watchedFiles.push(fullPath);
    } else if (relPath.startsWith('articles/') && ext === '.md') {
      if (!/^readme\.md$/i.test(relPath.split('/').pop())) {
        articleFiles[relPath] = readFileSync(fullPath, 'utf8');
        watchedFiles.push(fullPath);
      }
    } else if (/^photos\/[^/]+\/(?:album|index)\.(?:ya?ml|json)$/i.test(relPath)) {
      photoMetaFiles[relPath] = readFileSync(fullPath, 'utf8');
      watchedFiles.push(fullPath);
    } else if (relPath.startsWith('videos/') && META_EXTS.has(ext)) {
      videoMetaFiles[relPath] = readFileSync(fullPath, 'utf8');
      watchedFiles.push(fullPath);
    } else if (relPath.startsWith('music/') && META_EXTS.has(ext)) {
      musicMetaFiles[relPath] = readFileSync(fullPath, 'utf8');
      watchedFiles.push(fullPath);
    }

    if (IMAGE_EXTS.has(ext)) {
      imageAssets[relPath] = relPath;
      assetDiskPaths[relPath] = fullPath;
    } else if (AUDIO_EXTS.has(ext)) {
      audioAssets[relPath] = relPath;
      assetDiskPaths[relPath] = fullPath;
    }
  }

  return {
    profileFiles,
    articleFiles,
    photoMetaFiles,
    videoMetaFiles,
    musicMetaFiles,
    imageAssets,
    audioAssets,
    assetDiskPaths,
    watchedFiles,
  };
}

function generateModuleCode(contentDir) {
  const {
    profileFiles,
    articleFiles,
    photoMetaFiles,
    videoMetaFiles,
    musicMetaFiles,
    imageAssets,
    audioAssets,
    assetDiskPaths,
    watchedFiles,
  } = readContentDirectory(contentDir);

  const nonce = randomBytes(6).toString('hex');
  const tokenPrefix = `./__asset_${nonce}_`;
  const exactTokenRe = new RegExp(`^\\.\\/__asset_${nonce}_(\\d+)__$`);
  const embeddedTokenRe = new RegExp(`\\.\\/__asset_${nonce}_(\\d+)__`, 'g');

  const importedAssets = [];
  const indexByKey = new Map();

  const onAssetUse = (canonicalKey) => {
    if (!Object.hasOwn(assetDiskPaths, canonicalKey)) return '';
    let idx = indexByKey.get(canonicalKey);
    if (idx === undefined) {
      idx = importedAssets.length;
      indexByKey.set(canonicalKey, idx);
      importedAssets.push({
        varName: `__asset_${idx}`,
        diskPath: assetDiskPaths[canonicalKey],
      });
    }
    return `${tokenPrefix}${idx}__`;
  };

  const loaded = loadContent({
    profileFiles,
    articleFiles,
    photoMetaFiles,
    videoMetaFiles,
    musicMetaFiles,
    imageAssets,
    audioAssets,
    onAssetUse,
    strictMissingAssets: true,
  });

  // Omit raw markdown source from the client bundle; rendered HTML and plain paragraphs are kept.
  const postsForClient = loaded.posts.map(({ markdown, ...post }) => post);

  const emitString = (value, escapeInHtml) => {
    const exact = value.match(exactTokenRe);
    if (exact) return importedAssets[Number(exact[1])].varName;

    embeddedTokenRe.lastIndex = 0;
    if (!embeddedTokenRe.test(value)) return JSON.stringify(value);

    embeddedTokenRe.lastIndex = 0;
    const parts = [];
    let lastIndex = 0;
    let match;
    while ((match = embeddedTokenRe.exec(value)) !== null) {
      if (match.index > lastIndex) {
        parts.push(JSON.stringify(value.slice(lastIndex, match.index)));
      }
      const ref = importedAssets[Number(match[1])].varName;
      parts.push(escapeInHtml ? `__esc(${ref})` : ref);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < value.length) {
      parts.push(JSON.stringify(value.slice(lastIndex)));
    }
    return `(${parts.join(' + ')})`;
  };

  const emitValue = (value, escapeInHtml = false) => {
    if (typeof value === 'string') return emitString(value, escapeInHtml);
    if (Array.isArray(value)) return `[${value.map((item) => emitValue(item, escapeInHtml)).join(',')}]`;
    if (value && typeof value === 'object') {
      const entries = Object.entries(value).map(([key, val]) => (
        `${JSON.stringify(key)}:${emitValue(val, key === 'html' || key === 'bioHtml')}`
      ));
      return `{${entries.join(',')}}`;
    }
    return JSON.stringify(value);
  };

  const imports = importedAssets
    .map(({ varName, diskPath }) => `import ${varName} from ${JSON.stringify(diskPath.replace(/\\/g, '/'))};`)
    .join('\n');

  const helper = `const __esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));`;

  const code = [
    imports,
    helper,
    `export const profile = ${emitValue(loaded.profile)};`,
    `export const posts = ${emitValue(postsForClient)};`,
    `export const photoAlbums = ${emitValue(loaded.photoAlbums)};`,
    `export const videos = ${emitValue(loaded.videos)};`,
    `export const musicTracks = ${emitValue(loaded.musicTracks)};`,
  ].filter(Boolean).join('\n');

  return { code, watchedFiles };
}

export function createContentPlugin({ contentDir } = {}) {
  let resolvedContentDir = contentDir ? resolve(contentDir) : '';

  return {
    name: 'site-content',
    configResolved(config) {
      if (!resolvedContentDir) {
        resolvedContentDir = resolve(config.root, 'content');
      }
    },
    resolveId(id) {
      if (id === VIRTUAL_CONTENT_ID) return RESOLVED_VIRTUAL_ID;
      return null;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null;
      const targetDir = resolvedContentDir || resolve('content');
      const { code, watchedFiles } = generateModuleCode(targetDir);
      for (const file of watchedFiles) {
        this.addWatchFile(file);
      }
      return code;
    },
    configureServer(server) {
      const targetDir = resolvedContentDir || resolve(server.config.root, 'content');
      server.watcher.add(targetDir);
      const reloadIfContent = (changedPath) => {
        const normalized = resolve(changedPath);
        if (normalized === targetDir || normalized.startsWith(`${targetDir}/`) || normalized.startsWith(`${targetDir}\\`)) {
          const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
          if (mod) server.moduleGraph.invalidateModule(mod);
          server.ws.send({ type: 'full-reload' });
        }
      };
      server.watcher.on('add', reloadIfContent);
      server.watcher.on('change', reloadIfContent);
      server.watcher.on('unlink', reloadIfContent);
    },
  };
}
