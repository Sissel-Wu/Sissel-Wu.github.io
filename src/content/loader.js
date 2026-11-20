import { parseFrontmatter, parseYaml } from './yaml.js';
import {
  extractMarkdownTitle,
  markdownToPlainParagraphs,
  renderMarkdown,
  sanitizeUrl,
} from './markdown.js';

const naturalCompare = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });

export function normalizeContentPath(filePath) {
  return String(filePath ?? '')
    .replace(/\\/g, '/')
    .replace(/^(?:\.\.\/|\.\/|\/)*content\//, '')
    .replace(/^\/+/, '');
}

function normalizeMap(rawMap = {}) {
  const result = {};
  for (const [key, value] of Object.entries(rawMap)) {
    result[normalizeContentPath(key)] = value;
  }
  return result;
}

function dirname(filePath) {
  const index = filePath.lastIndexOf('/');
  return index === -1 ? '' : filePath.slice(0, index);
}

function basename(filePath) {
  const index = filePath.lastIndexOf('/');
  return index === -1 ? filePath : filePath.slice(index + 1);
}

function stripExtension(name) {
  return name.replace(/\.[^.]+$/, '');
}

function isExternalOrAbsolute(target) {
  return /^(?:https?:|mailto:|data:|#|\/)/i.test(target);
}

export function resolveContentPath(fromFile, target) {
  const trimmed = String(target ?? '').trim();
  if (!trimmed) return '';
  if (isExternalOrAbsolute(trimmed)) return trimmed;

  const baseSegments = dirname(normalizeContentPath(fromFile)).split('/').filter(Boolean);
  const targetSegments = trimmed.replace(/\\/g, '/').split('/');
  for (const segment of targetSegments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      baseSegments.pop();
    } else {
      baseSegments.push(segment);
    }
  }
  return baseSegments.join('/');
}

function resolveAssetMatch(fromFile, target, assets, onAssetUse) {
  const trimmed = String(target ?? '').trim();
  if (!trimmed) return { key: '', url: '' };
  if (/^(?:https?:|data:)/i.test(trimmed)) return { key: '', url: trimmed };

  const candidates = [resolveContentPath(fromFile, trimmed), trimmed];
  try {
    const decoded = decodeURIComponent(candidates[0]);
    if (decoded !== candidates[0]) candidates.push(decoded);
  } catch {
    // Ignore malformed URI sequences
  }

  for (const candidate of candidates) {
    if (Object.hasOwn(assets, candidate)) {
      const url = onAssetUse ? onAssetUse(candidate, assets[candidate]) : assets[candidate];
      return { key: candidate, url };
    }
  }
  return { key: '', url: '' };
}

function parseStructuredFile(filePath, raw) {
  if (/\.json$/i.test(filePath)) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error(`Invalid JSON in content/${filePath}: ${error.message}`);
    }
  }
  return parseYaml(raw, { filename: `content/${filePath}` });
}

function assertBooleanOrUndefined(value, filePath, field) {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new Error(`content/${filePath}: "${field}" must be a boolean (true/false), got ${JSON.stringify(value)}`);
  }
}

function assertNumberOrUndefined(value, filePath, field) {
  if (value !== undefined && (typeof value !== 'number' || Number.isNaN(value))) {
    throw new Error(`content/${filePath}: "${field}" must be a number, got ${JSON.stringify(value)}`);
  }
}

export function humanizeName(rawName) {
  const cleaned = stripExtension(String(rawName ?? ''))
    .replace(/^\d{4}[-.]\d{2}[-.]\d{2}[-_\s]+/, '')
    .replace(/^\d+[-_\s]+/, '')
    .trim();
  if (!cleaned) return stripExtension(String(rawName ?? ''));
  if (/[^\x00-\x7F]/.test(cleaned)) return cleaned.replace(/[-_]+/g, ' ').trim();
  return cleaned
    .replace(/[-_]+/g, ' ')
    .replace(/\b[a-z]/g, (ch) => ch.toUpperCase())
    .trim();
}

function normalizeDateKey(date) {
  const match = String(date ?? '').trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (!match) return '';
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function formatDateDisplay(date) {
  const text = String(date ?? '').trim();
  if (!text) return '';
  return text.replace(/-/g, '.');
}

function hasHiddenSegment(contentPath) {
  return contentPath.split('/').some((part) => part.startsWith('_') || part.startsWith('.'));
}

function compareByOrderDateName(a, b) {
  const aHasOrder = typeof a.order === 'number' && !Number.isNaN(a.order);
  const bHasOrder = typeof b.order === 'number' && !Number.isNaN(b.order);
  if (aHasOrder && bHasOrder && a.order !== b.order) return a.order - b.order;
  if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;

  const aDate = normalizeDateKey(a.date);
  const bDate = normalizeDateKey(b.date);
  if (aDate && bDate && aDate !== bDate) return bDate.localeCompare(aDate);
  if (aDate !== bDate) return aDate ? -1 : 1;

  return naturalCompare(a.sortKey, b.sortKey);
}

function createMarkdownResolvers(filePath, allAssets, onAssetUse, { strictMissingAssets = false } = {}) {
  const resolveImage = (target) => {
    const trimmed = String(target ?? '').trim();
    if (!trimmed) return '';
    if (isExternalOrAbsolute(trimmed)) return trimmed;
    const match = resolveAssetMatch(filePath, trimmed, allAssets, onAssetUse);
    if (!match.url && strictMissingAssets) {
      throw new Error(`content/${filePath}: Missing image "${trimmed}"`);
    }
    return match.url;
  };

  const resolveLink = (target) => {
    const trimmed = String(target ?? '').trim();
    if (!trimmed || isExternalOrAbsolute(trimmed)) return trimmed;
    const match = resolveAssetMatch(filePath, trimmed, allAssets, onAssetUse);
    return match.url || trimmed;
  };

  return { resolveAsset: resolveImage, resolveLinkAsset: resolveLink };
}

export function loadProfile(profileFiles = {}, imageAssets = {}, options = {}) {
  const { onAssetUse, allAssets = imageAssets } = options;
  const files = normalizeMap(profileFiles);
  const assets = normalizeMap(allAssets);
  const entryPath = Object.keys(files).sort(naturalCompare)[0];
  if (!entryPath) {
    return { name: '', role: '', bio: '', bioHtml: '', interests: [], links: [] };
  }

  let data = {};
  let body = '';
  if (/\.md$/i.test(entryPath)) {
    ({ data, body } = parseFrontmatter(files[entryPath], { filename: `content/${entryPath}` }));
  } else {
    const parsed = parseStructuredFile(entryPath, files[entryPath]);
    if (parsed !== null && (typeof parsed !== 'object' || Array.isArray(parsed))) {
      throw new Error(`content/${entryPath}: Profile file must be a mapping object`);
    }
    data = parsed ?? {};
    body = typeof data.bio === 'string' ? data.bio : '';
  }

  if (data.links !== undefined && !Array.isArray(data.links)) {
    throw new Error(`content/${entryPath}: "links" must be a list`);
  }
  if (data.interests !== undefined && !Array.isArray(data.interests)) {
    throw new Error(`content/${entryPath}: "interests" must be a list`);
  }

  const bioMarkdown = body || (typeof data.bio === 'string' ? data.bio : '');
  const links = Array.isArray(data.links)
    ? data.links
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        label: String(item.label ?? item.name ?? '').trim(),
        url: sanitizeUrl(item.url ?? item.href ?? ''),
      }))
      .filter((item) => item.label && item.url)
    : [];

  return {
    name: String(data.name ?? '').trim(),
    role: String(data.role ?? '').trim(),
    bio: markdownToPlainParagraphs(bioMarkdown).join('\n\n'),
    bioHtml: renderMarkdown(
      bioMarkdown,
      createMarkdownResolvers(entryPath, assets, onAssetUse, options),
    ),
    interests: Array.isArray(data.interests) ? data.interests.map((item) => String(item).trim()).filter(Boolean) : [],
    links,
  };
}

export function loadArticles(articleFiles = {}, imageAssets = {}, options = {}) {
  const { onAssetUse, allAssets = imageAssets } = options;
  const files = normalizeMap(articleFiles);
  const assets = normalizeMap(allAssets);
  const items = [];
  const seenIds = new Map();

  for (const filePath of Object.keys(files).sort(naturalCompare)) {
    if (!filePath.startsWith('articles/') || !/\.md$/i.test(filePath)) continue;
    const relative = filePath.slice('articles/'.length);
    if (hasHiddenSegment(relative)) continue;
    const base = basename(relative);
    if (/^readme\.md$/i.test(base)) continue;

    const { data, body: rawBody } = parseFrontmatter(files[filePath], { filename: `content/${filePath}` });
    assertBooleanOrUndefined(data.draft, filePath, 'draft');
    assertNumberOrUndefined(data.order, filePath, 'order');
    if (data.draft === true) continue;

    const isNestedIndex = /^index\.md$/i.test(base) && dirname(relative) !== '';
    const defaultId = isNestedIndex ? dirname(relative) : stripExtension(relative);
    const stemForMeta = isNestedIndex ? basename(dirname(relative)) : stripExtension(base);
    const datePrefix = stemForMeta.match(/^(\d{4}[-.]\d{2}[-.]\d{2})[-_\s]+(.+)$/);
    const inferredDate = datePrefix ? datePrefix[1] : '';
    const inferredName = datePrefix ? datePrefix[2] : stemForMeta;

    const id = String(data.id ?? defaultId).trim();
    if (!id) {
      throw new Error(`content/${filePath}: Article "id" must not be empty`);
    }
    if (seenIds.has(id)) {
      throw new Error(`Duplicate article id "${id}" in content/${seenIds.get(id)} and content/${filePath}`);
    }
    seenIds.set(id, filePath);

    const { title: headingTitle, body: bodyWithoutHeading } = data.title
      ? { title: '', body: rawBody }
      : extractMarkdownTitle(rawBody);

    const markdownBody = data.title ? rawBody : bodyWithoutHeading;
    const title = String(data.title || headingTitle || humanizeName(inferredName)).trim();
    const date = formatDateDisplay(data.date || inferredDate);
    const category = String(data.category || 'work').trim() || 'work';
    const order = data.order;

    const post = {
      id,
      category,
      title,
      date,
      body: markdownToPlainParagraphs(markdownBody),
      markdown: markdownBody,
      html: renderMarkdown(
        markdownBody,
        createMarkdownResolvers(filePath, assets, onAssetUse, options),
      ),
      sortKey: relative,
      order,
    };

    if (data.tag != null && String(data.tag).trim()) post.tag = String(data.tag).trim();
    if (data.read != null && String(data.read).trim()) post.read = String(data.read).trim();
    if (data.topic != null && String(data.topic).trim()) post.topic = String(data.topic).trim();

    items.push(post);
  }

  return items
    .sort(compareByOrderDateName)
    .map(({ sortKey, order, ...post }) => post);
}

export function loadPhotoAlbums(photoMetaFiles = {}, imageAssets = {}, options = {}) {
  const { onAssetUse, strictMissingAssets = false } = options;
  const metaMap = normalizeMap(photoMetaFiles);
  const images = normalizeMap(imageAssets);

  const folders = new Map();
  const ensureFolder = (folder) => {
    if (!folders.has(folder)) folders.set(folder, { metaPath: '', meta: {}, files: [] });
    return folders.get(folder);
  };

  for (const filePath of Object.keys(metaMap).sort(naturalCompare)) {
    const match = filePath.match(/^photos\/([^/]+)\/(?:album|index)\.(?:ya?ml|json)$/i);
    if (!match || hasHiddenSegment(match[1])) continue;
    const entry = ensureFolder(match[1]);
    if (!entry.metaPath) {
      const parsed = parseStructuredFile(filePath, metaMap[filePath]);
      if (parsed !== null && (typeof parsed !== 'object' || Array.isArray(parsed))) {
        throw new Error(`content/${filePath}: Album metadata must be a YAML/JSON object`);
      }
      entry.metaPath = filePath;
      entry.meta = parsed ?? {};
    }
  }

  for (const [filePath, url] of Object.entries(images)) {
    const match = filePath.match(/^photos\/([^/]+)\/([^/]+)$/);
    if (!match || hasHiddenSegment(match[1]) || hasHiddenSegment(match[2])) continue;
    ensureFolder(match[1]).files.push({ filePath, fileName: match[2], url });
  }

  const albums = [];
  for (const [folder, entry] of folders.entries()) {
    const { meta, files } = entry;
    const metaLabel = entry.metaPath || `photos/${folder}/album.yaml`;
    assertBooleanOrUndefined(meta.draft, metaLabel, 'draft');
    assertBooleanOrUndefined(meta.includeUnlisted, metaLabel, 'includeUnlisted');
    assertNumberOrUndefined(meta.order, metaLabel, 'order');
    if (meta.photos !== undefined && !Array.isArray(meta.photos)) {
      throw new Error(`content/${metaLabel}: "photos" must be a list`);
    }
    if (meta.draft === true) continue;

    files.sort((a, b) => naturalCompare(a.fileName, b.fileName));
    const handledPaths = new Set();
    const photos = [];

    const hasExplicitPhotos = Array.isArray(meta.photos);
    if (hasExplicitPhotos) {
      for (const item of meta.photos) {
        const entryObj = typeof item === 'string' ? { file: item } : item;
        if (!entryObj || typeof entryObj !== 'object') continue;
        assertBooleanOrUndefined(entryObj.draft, metaLabel, 'photos[].draft');

        const target = entryObj.file ?? entryObj.src ?? '';
        // Resolve the canonical key first so drafted or URL-encoded photos are still deduplicated.
        const keyProbe = resolveAssetMatch(metaLabel, target, images);
        if (keyProbe.key) handledPaths.add(keyProbe.key);

        if (entryObj.draft === true) continue;

        const match = resolveAssetMatch(metaLabel, target, images, onAssetUse);
        if (!match.url) {
          if (strictMissingAssets && target) {
            throw new Error(`content/${metaLabel}: Missing photo "${target}"`);
          }
          continue;
        }
        const resolvedName = basename(match.key || resolveContentPath(metaLabel, target) || String(target));
        const photo = {
          src: match.url,
          title: String(entryObj.title || humanizeName(resolvedName)).trim(),
        };
        if (entryObj.location != null && String(entryObj.location).trim()) {
          photo.location = String(entryObj.location).trim();
        }
        if (entryObj.year != null && String(entryObj.year).trim()) {
          photo.year = String(entryObj.year).trim();
        }
        photos.push(photo);
      }
    }

    const coverProbe = meta.cover ? resolveAssetMatch(metaLabel, meta.cover, images) : { key: '', url: '' };
    const includeUnlisted = meta.includeUnlisted !== false;
    if (!hasExplicitPhotos || includeUnlisted) {
      for (const file of files) {
        if (handledPaths.has(file.filePath)) continue;
        if (hasExplicitPhotos && coverProbe.key && file.filePath === coverProbe.key) continue;
        const src = onAssetUse ? onAssetUse(file.filePath, file.url) : file.url;
        photos.push({
          src,
          title: humanizeName(file.fileName),
        });
      }
    }

    if (photos.length === 0) continue;

    let cover = '';
    if (meta.cover) {
      const coverMatch = resolveAssetMatch(metaLabel, meta.cover, images, onAssetUse);
      if (!coverMatch.url && strictMissingAssets) {
        throw new Error(`content/${metaLabel}: Missing cover image "${meta.cover}"`);
      }
      cover = coverMatch.url;
    }
    if (!cover) cover = photos[0].src;

    albums.push({
      id: folder,
      title: String(meta.title || humanizeName(folder)).trim(),
      cover,
      photos,
      date: meta.date ?? '',
      order: meta.order,
      sortKey: folder,
    });
  }

  return albums
    .sort(compareByOrderDateName)
    .map(({ sortKey, order, date, ...album }) => album);
}

export function loadVideos(videoMetaFiles = {}, imageAssets = {}, options = {}) {
  const { onAssetUse, strictMissingAssets = false } = options;
  const metaMap = normalizeMap(videoMetaFiles);
  const images = normalizeMap(imageAssets);
  const videos = [];

  for (const filePath of Object.keys(metaMap).sort(naturalCompare)) {
    if (!filePath.startsWith('videos/') || hasHiddenSegment(filePath)) continue;
    const parsed = parseStructuredFile(filePath, metaMap[filePath]);
    if (parsed === null) continue;
    let list;
    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (typeof parsed === 'object' && Array.isArray(parsed.videos)) {
      list = parsed.videos;
    } else {
      throw new Error(`content/${filePath}: Videos manifest must be a list or an object with a "videos" list`);
    }

    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      assertBooleanOrUndefined(item.draft, filePath, 'draft');
      if (item.draft === true) continue;
      const title = String(item.title ?? '').trim();
      if (!title) continue;
      const video = { title };
      if (item.image != null && String(item.image).trim()) {
        const match = resolveAssetMatch(filePath, item.image, images, onAssetUse);
        if (!match.url && strictMissingAssets) {
          throw new Error(`content/${filePath}: Missing video image "${item.image}"`);
        }
        if (match.url) video.image = match.url;
      }
      if (item.url != null && String(item.url).trim()) {
        const safeUrl = sanitizeUrl(item.url, { allowDataImage: false, allowMailto: false });
        if (safeUrl) video.url = safeUrl;
      }
      videos.push(video);
    }
  }

  return videos;
}

export function loadMusicTracks(musicMetaFiles = {}, audioAssets = {}, options = {}) {
  const { onAssetUse, strictMissingAssets = false } = options;
  const metaMap = normalizeMap(musicMetaFiles);
  const audio = normalizeMap(audioAssets);
  const tracks = [];
  const metaPaths = Object.keys(metaMap)
    .filter((filePath) => filePath.startsWith('music/') && !hasHiddenSegment(filePath))
    .sort(naturalCompare);

  if (metaPaths.length > 0) {
    for (const filePath of metaPaths) {
      const parsed = parseStructuredFile(filePath, metaMap[filePath]);
      if (parsed === null) continue;
      let list;
      if (Array.isArray(parsed)) {
        list = parsed;
      } else if (typeof parsed === 'object' && Array.isArray(parsed.tracks)) {
        list = parsed.tracks;
      } else {
        throw new Error(`content/${filePath}: Music manifest must be a list or an object with a "tracks" list`);
      }

      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        assertBooleanOrUndefined(item.draft, filePath, 'draft');
        if (item.draft === true) continue;
        const target = item.file ?? item.src ?? '';
        const match = resolveAssetMatch(filePath, target, audio, onAssetUse);
        if (!match.url) {
          if (strictMissingAssets && target) {
            throw new Error(`content/${filePath}: Missing audio file "${target}"`);
          }
          continue;
        }
        const title = String(item.title || humanizeName(basename(match.key || String(target)))).trim();
        const track = { title, src: match.url };
        if (item.mood != null && String(item.mood).trim()) track.mood = String(item.mood).trim();
        if (item.duration != null && String(item.duration).trim()) track.duration = String(item.duration).trim();
        tracks.push(track);
      }
    }
    return tracks;
  }

  for (const filePath of Object.keys(audio).sort(naturalCompare)) {
    const match = filePath.match(/^music\/([^/]+)$/);
    if (!match || hasHiddenSegment(match[1])) continue;
    const src = onAssetUse ? onAssetUse(filePath, audio[filePath]) : audio[filePath];
    tracks.push({ title: humanizeName(match[1]), src });
  }
  return tracks;
}

export function loadContent({
  profileFiles = {},
  articleFiles = {},
  photoMetaFiles = {},
  videoMetaFiles = {},
  musicMetaFiles = {},
  imageAssets = {},
  audioAssets = {},
  onAssetUse,
  strictMissingAssets = false,
} = {}) {
  const allAssets = { ...normalizeMap(imageAssets), ...normalizeMap(audioAssets) };
  const sharedOptions = { onAssetUse, strictMissingAssets, allAssets };
  return {
    profile: loadProfile(profileFiles, imageAssets, sharedOptions),
    posts: loadArticles(articleFiles, imageAssets, sharedOptions),
    photoAlbums: loadPhotoAlbums(photoMetaFiles, imageAssets, sharedOptions),
    videos: loadVideos(videoMetaFiles, imageAssets, sharedOptions),
    musicTracks: loadMusicTracks(musicMetaFiles, audioAssets, sharedOptions),
  };
}
