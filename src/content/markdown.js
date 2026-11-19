const DUMMY_BASE = 'https://local.invalid/base/';
const CONTROL_CHAR_RE = /[\u0000-\u001F\u007F]/;

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

export function sanitizeUrl(url, { allowDataImage = false, allowMailto = true, allowRelative = true } = {}) {
  const raw = String(url ?? '');
  if (!raw || CONTROL_CHAR_RE.test(raw)) return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes('\\')) return '';
  if (trimmed.startsWith('#')) return trimmed;

  if (/^data:/i.test(trimmed)) {
    if (!allowDataImage) return '';
    return /^data:image\/(?:png|jpeg|jpg|gif|webp|avif|svg\+xml);/i.test(trimmed) ? trimmed : '';
  }

  let parsed;
  try {
    parsed = new URL(trimmed, DUMMY_BASE);
  } catch {
    return '';
  }

  const isExplicitScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed);
  const isProtocolRelative = trimmed.startsWith('//');
  if (!isExplicitScheme && !isProtocolRelative && !allowRelative) return '';

  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return trimmed;
  if (allowMailto && parsed.protocol === 'mailto:') return trimmed;
  return '';
}

export function extractMarkdownTitle(markdown) {
  const lines = String(markdown ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  let index = 0;
  while (index < lines.length && lines[index].trim() === '') index += 1;
  const heading = lines[index]?.match(/^#\s+(.+?)\s*#*$/);
  if (!heading) return { title: '', body: String(markdown ?? '').trim() };
  return {
    title: heading[1].trim(),
    body: lines.slice(index + 1).join('\n').trim(),
  };
}

function parseLinkAt(text, startIndex) {
  const isImage = text[startIndex] === '!';
  const bracketStart = isImage ? startIndex + 1 : startIndex;
  if (text[bracketStart] !== '[') return null;

  let i = bracketStart + 1;
  let bracketDepth = 1;
  while (i < text.length && bracketDepth > 0) {
    if (text[i] === '\\' && i + 1 < text.length) {
      i += 2;
      continue;
    }
    if (text[i] === '[') bracketDepth += 1;
    else if (text[i] === ']') bracketDepth -= 1;
    if (bracketDepth > 0) i += 1;
  }
  if (bracketDepth !== 0) return null;

  const label = text.slice(bracketStart + 1, i);
  if (text[i + 1] !== '(') return null;

  let j = i + 2;
  while (j < text.length && (text[j] === ' ' || text[j] === '\t')) j += 1;
  if (j >= text.length) return null;

  let destination = '';
  if (text[j] === '<') {
    j += 1;
    const destStart = j;
    while (j < text.length && text[j] !== '>' && text[j] !== '\n') {
      if (text[j] === '\\' && j + 1 < text.length) {
        j += 2;
        continue;
      }
      j += 1;
    }
    if (text[j] !== '>') return null;
    destination = text.slice(destStart, j);
    j += 1;
  } else {
    const destStart = j;
    let parenDepth = 0;
    while (j < text.length) {
      const ch = text[j];
      if (ch === '\\' && j + 1 < text.length) {
        j += 2;
        continue;
      }
      if (ch === ' ' || ch === '\t' || ch === '\n') break;
      if (ch === '(') {
        parenDepth += 1;
      } else if (ch === ')') {
        if (parenDepth === 0) break;
        parenDepth -= 1;
      }
      j += 1;
    }
    if (parenDepth !== 0) return null;
    destination = text.slice(destStart, j);
  }

  while (j < text.length && (text[j] === ' ' || text[j] === '\t')) j += 1;

  let title = '';
  if (text[j] === '"' || text[j] === "'") {
    const quote = text[j];
    j += 1;
    const titleStart = j;
    while (j < text.length && text[j] !== quote) {
      if (text[j] === '\\' && j + 1 < text.length) {
        j += 2;
        continue;
      }
      j += 1;
    }
    if (text[j] !== quote) return null;
    title = text.slice(titleStart, j);
    j += 1;
    while (j < text.length && (text[j] === ' ' || text[j] === '\t')) j += 1;
  }

  if (text[j] !== ')') return null;
  if (!destination) return null;

  return { isImage, label, destination, title, endIndex: j + 1 };
}

function replaceLinksAndImages(text, handler) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '[' || (text[i] === '!' && text[i + 1] === '[')) {
      const parsed = parseLinkAt(text, i);
      if (parsed) {
        out += handler(parsed);
        i = parsed.endIndex;
        continue;
      }
    }
    out += text[i];
    i += 1;
  }
  return out;
}

export function markdownToPlainParagraphs(markdown) {
  const blocks = String(markdown ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n{2,}/);
  return blocks
    .map((block) => replaceLinksAndImages(
      block
        .replace(/^```[\s\S]*?```$/gm, '')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^>\s?/gm, ''),
      ({ label }) => label,
    )
      .replace(/(\*\*|__|~~|`|\*)/g, '')
      .replace(/\s*\n\s*/g, ' ')
      .trim())
    .filter(Boolean);
}

function renderInline(text, { resolveAsset, resolveLinkAsset } = {}) {
  const tokens = [];
  const stash = (html) => {
    const key = `\u0000${tokens.length}\u0000`;
    tokens.push(html);
    return key;
  };
  const restore = (input) => input.replace(/\u0000(\d+)\u0000/g, (_, idx) => tokens[Number(idx)]);

  let out = String(text ?? '');
  out = out.replace(/`([^`\n]+)`/g, (_, code) => stash(`<code>${escapeHTML(code)}</code>`));
  out = replaceLinksAndImages(out, ({ isImage, label, destination, title }) => {
    if (isImage) {
      const resolved = resolveAsset ? resolveAsset(destination) : destination;
      const safeSrc = sanitizeUrl(resolved, { allowDataImage: true, allowMailto: false });
      if (!safeSrc) return escapeHTML(label);
      const titleAttr = title ? ` title="${escapeHTML(title)}"` : '';
      return stash(`<img src="${escapeHTML(safeSrc)}" alt="${escapeHTML(label)}"${titleAttr} loading="lazy">`);
    }

    const linkResolver = resolveLinkAsset ?? resolveAsset;
    const resolved = linkResolver ? linkResolver(destination) : destination;
    const safeHref = sanitizeUrl(resolved, { allowDataImage: false, allowMailto: true });
    if (!safeHref) return restore(escapeHTML(label));
    const isExternal = /^https?:\/\//i.test(safeHref);
    const targetAttr = isExternal ? ' target="_blank" rel="noreferrer"' : '';
    const titleAttr = title ? ` title="${escapeHTML(title)}"` : '';
    return stash(`<a href="${escapeHTML(safeHref)}"${targetAttr}${titleAttr}>${restore(escapeHTML(label))}</a>`);
  });

  out = escapeHTML(out);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[\s(（【「『])__([^_]+)__(?=$|[\s.,!?;:)）】」』])/g, '$1<strong>$2</strong>');
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  out = out.replace(/(?<!\*)\*([^\s*](?:[^*]*[^\s*])?)\*(?!\*)/g, '<em>$1</em>');

  return restore(out);
}

function isBlockStarter(line) {
  return (
    /^```/.test(line) ||
    /^#{1,6}\s+/.test(line) ||
    /^(?:[-*_]\s*){3,}$/.test(line.trim()) ||
    /^>\s?/.test(line) ||
    /^[-*+]\s+/.test(line) ||
    /^\d+\.\s+/.test(line)
  );
}

export function renderMarkdown(markdown, options = {}) {
  const lines = String(markdown ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    if (/^```/.test(line)) {
      const codeLines = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      html.push(`<pre><code>${escapeHTML(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      const level = Math.min(6, heading[1].length + 1);
      html.push(`<h${level}>${renderInline(heading[2], options)}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^(?:[-*_]\s*){3,}$/.test(line.trim())) {
      html.push('<hr>');
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      html.push(`<blockquote>${renderMarkdown(quoteLines.join('\n'), options)}</blockquote>`);
      continue;
    }

    if (/^[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^[-*+]\s+/, ''), options)}</li>`);
        i += 1;
      }
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^\d+\.\s+/, ''), options)}</li>`);
        i += 1;
      }
      html.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    const paraLines = [];
    while (i < lines.length && lines[i].trim() !== '' && (paraLines.length === 0 || !isBlockStarter(lines[i]))) {
      paraLines.push(lines[i]);
      i += 1;
    }
    const joined = paraLines
      .map((part, idx) => {
        if (idx === paraLines.length - 1) return renderInline(part.trimEnd(), options);
        if (/(?: {2}|\\)$/.test(part)) {
          return `${renderInline(part.replace(/(?: {2}|\\)$/, ''), options)}<br>`;
        }
        return `${renderInline(part.trimEnd(), options)}\n`;
      })
      .join('');
    html.push(`<p>${joined}</p>`);
  }

  return html.join('');
}
