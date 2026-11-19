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

export function resolveContentPath(fromFile, target) {
  const trimmed = String(target ?? '').trim();
  if (!trimmed) return '';
  if (/^(?:https?:|data:|\/)/i.test(trimmed)) return trimmed;

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

function resolveAsset(fromFile, target, assets) {
  const trimmed = String(target ?? '').trim();
  if (!trimmed) return '';
  if (/^(?:https?:|data:)/i.test(trimmed)) return trimmed;
  const resolved = resolveContentPath(fromFile, trimmed);
  if (Object.hasOwn(assets, resolved)) return assets[resolved];
  if (Object.hasOwn(assets, trimmed)) return assets[trimmed];
  try {
    const decoded = decodeURIComponent(resolved);
    if (Object.hasOwn(assets, decoded)) return assets[decoded];
  } catch {
    // Ignore malformed URI sequences
  }
  return '';
}

function parseStructuredFile(filePath, raw) {
  if (/\.json$/i.test(filePath)) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return parseYaml(raw);
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

export function loadProfile(profileFiles = {}, imageAssets = {}) {
  const files = normalizeMap(profileFiles);
  const images = normalizeMap(imageAssets);
  const entryPath = Object.keys(files).sort(naturalCompare)[0];
  if (!entryPath) {
    return { name: '', role: '', bio: '', bioHtml: '', interests: [], links: [] };
  }

  let data = {};
  let body = '';
  if (/\.md$/i.test(entryPath)) {
    ({ data, body } = parseFrontmatter(files[entryPath]));
  } else {
    const parsed = parseStructuredFile(entryPath, files[entryPath]);
    data = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    body = typeof data.bio === 'string' ? data.bio : '';
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
    bioHtml: renderMarkdown(bioMarkdown, {
      resolveAsset: (src) => resolveAsset(entryPath, src, images) || src,
    }),
    interests: Array.isArray(data.interests) ? data.interests.map((item) => String(item).trim()).filter(Boolean) : [],
    links,
  };
}

export function loadArticles(articleFiles = {}, imageAssets = {}) {
  const files = normalizeMap(articleFiles);
  const images = normalizeMap(imageAssets);
  const items = [];

  for (const [filePath, raw] of Object.entries(files)) {
    if (!filePath.startsWith('articles/') || !/\.md$/i.test(filePath)) continue;
    const relative = filePath.slice('articles/'.length);
    if (hasHiddenSegment(relative)) continue;
    const base = basename(relative);
    if (/^readme\.md$/i.test(base)) continue;

    const { data, body: rawBody } = parseFrontmatter(raw);
    if (data.draft === true) continue;

    const rawStem = /^index\.md$/i.test(base) ? basename(dirname(relative)) : stripExtension(base);
    const datePrefix = rawStem.match(/^(\d{4}[-.]\d{2}[-.]\d{2})[-_\s]+(.+)$/);
    const inferredDate = datePrefix ? datePrefix[1] : '';
    const inferredSlug = datePrefix ? datePrefix[2] : rawStem;

    const { title: headingTitle, body: bodyWithoutHeading } = data.title
      ? { title: '', body: rawBody }
      : extractMarkdownTitle(rawBody);

    const markdownBody = data.title ? rawBody : bodyWithoutHeading;
    const title = String(data.title || headingTitle || humanizeName(inferredSlug)).trim();
    const id = String(data.id || inferredSlug).trim();
    const date = formatDateDisplay(data.date || inferredDate);
    const category = String(data.category || 'work').trim() || 'work';
    const order = typeof data.order === 'number' ? data.order : undefined;

    const post = {
      id,
      category,
      title,
      date,
      body: markdownToPlainParagraphs(markdownBody),
      markdown: markdownBody,
      html: renderMarkdown(markdownBody, {
        resolveAsset: (src) => resolveAsset(filePath, src, images),
      }),
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

export function loadPhotoAlbums(photoMetaFiles = {}, imageAssets = {}) {
  const metaMap = normalizeMap(photoMetaFiles);
  const images = normalizeMap(imageAssets);

  const folders = new Map();
  const ensureFolder = (folder) => {
    if (!folders.has(folder)) folders.set(folder, { metaPath: '', meta: {}, files: [] });
    return folders.get(folder);
  };

  for (const [filePath, raw] of Object.entries(metaMap)) {
    const match = filePath.match(/^photos\/([^/]+)\/(?:album|index)\.(?:ya?ml|json)$/i);
    if (!match || hasHiddenSegment(match[1])) continue;
    const entry = ensureFolder(match[1]);
    if (!entry.metaPath || naturalCompare(filePath, entry.metaPath) < 0) {
      const parsed = parseStructuredFile(filePath, raw);
      entry.metaPath = filePath;
      entry.meta = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
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
    if (meta.draft === true) continue;

    files.sort((a, b) => naturalCompare(a.fileName, b.fileName));
    const metaBase = entry.metaPath || `photos/${folder}/album.yaml`;
    const usedPaths = new Set();
    const photos = [];

    const hasExplicitPhotos = Array.isArray(meta.photos);
    if (hasExplicitPhotos) {
      for (const item of meta.photos) {
        const entryObj = typeof item === 'string' ? { file: item } : item;
        if (!entryObj || typeof entryObj !== 'object' || entryObj.draft === true) continue;
        const target = entryObj.file ?? entryObj.src ?? '';
        const src = resolveAsset(metaBase, target, images);
        if (!src) continue;
        const resolvedPath = resolveContentPath(metaBase, target);
        usedPaths.add(resolvedPath);

        const photo = {
          src,
          title: String(entryObj.title || humanizeName(basename(resolvedPath || target))).trim(),
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

    const coverPath = meta.cover ? resolveContentPath(metaBase, meta.cover) : '';
    const includeUnlisted = meta.includeUnlisted !== false;
    if (!hasExplicitPhotos || includeUnlisted) {
      for (const file of files) {
        if (usedPaths.has(file.filePath)) continue;
        if (hasExplicitPhotos && coverPath && file.filePath === coverPath) continue;
        photos.push({
          src: file.url,
          title: humanizeName(file.fileName),
        });
      }
    }

    if (photos.length === 0) continue;

    const cover = (meta.cover ? resolveAsset(metaBase, meta.cover, images) : '') || photos[0].src;
    albums.push({
      id: folder,
      title: String(meta.title || humanizeName(folder)).trim(),
      cover,
      photos,
      date: meta.date ?? '',
      order: typeof meta.order === 'number' ? meta.order : undefined,
      sortKey: folder,
    });
  }

  return albums
    .sort(compareByOrderDateName)
    .map(({ sortKey, order, date, ...album }) => album);
}

export function loadVideos(videoMetaFiles = {}, imageAssets = {}) {
  const metaMap = normalizeMap(videoMetaFiles);
  const images = normalizeMap(imageAssets);
  const videos = [];

  for (const filePath of Object.keys(metaMap).sort(naturalCompare)) {
    if (!filePath.startsWith('videos/') || hasHiddenSegment(filePath)) continue;
    const parsed = parseStructuredFile(filePath, metaMap[filePath]);
    const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.videos) ? parsed.videos : []);
    for (const item of list) {
      if (!item || typeof item !== 'object' || item.draft === true) continue;
      const title = String(item.title ?? '').trim();
      if (!title) continue;
      const video = { title };
      if (item.image != null && String(item.image).trim()) {
        const resolved = resolveAsset(filePath, item.image, images);
        if (resolved) video.image = resolved;
      }
      if (item.url != null && String(item.url).trim()) {
        const safeUrl = sanitizeUrl(item.url);
        if (safeUrl) video.url = safeUrl;
      }
      videos.push(video);
    }
  }

  return videos;
}

export function loadMusicTracks(musicMetaFiles = {}, audioAssets = {}) {
  const metaMap = normalizeMap(musicMetaFiles);
  const audio = normalizeMap(audioAssets);
  const tracks = [];
  const metaPaths = Object.keys(metaMap)
    .filter((filePath) => filePath.startsWith('music/') && !hasHiddenSegment(filePath))
    .sort(naturalCompare);

  if (metaPaths.length > 0) {
    for (const filePath of metaPaths) {
      const parsed = parseStructuredFile(filePath, metaMap[filePath]);
      const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.tracks) ? parsed.tracks : []);
      for (const item of list) {
        if (!item || typeof item !== 'object' || item.draft === true) continue;
        const src = resolveAsset(filePath, item.file ?? item.src ?? '', audio);
        if (!src) continue;
        const title = String(item.title || humanizeName(basename(String(item.file ?? item.src ?? '')))).trim();
        const track = { title, src };
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
    tracks.push({ title: humanizeName(match[1]), src: audio[filePath] });
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
} = {}) {
  return {
    profile: loadProfile(profileFiles, imageAssets),
    posts: loadArticles(articleFiles, imageAssets),
    photoAlbums: loadPhotoAlbums(photoMetaFiles, imageAssets),
    videos: loadVideos(videoMetaFiles, imageAssets),
    musicTracks: loadMusicTracks(musicMetaFiles, audioAssets),
  };
}
