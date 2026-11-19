export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

export function sanitizeUrl(url, { allowDataImage = false } = {}) {
  const trimmed = String(url ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('#') || trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return trimmed;
  }
  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z\d+.-]*):/);
  if (!schemeMatch) return trimmed;
  const scheme = schemeMatch[1].toLowerCase();
  if (scheme === 'http' || scheme === 'https' || scheme === 'mailto') return trimmed;
  if (allowDataImage && scheme === 'data' && /^data:image\/(?:png|jpeg|jpg|gif|webp|avif|svg\+xml);/i.test(trimmed)) {
    return trimmed;
  }
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

export function markdownToPlainParagraphs(markdown) {
  const blocks = String(markdown ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n{2,}/);
  return blocks
    .map((block) => block
      .replace(/^```[\s\S]*?```$/gm, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^>\s?/gm, '')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/(\*\*|__|~~|`|\*)/g, '')
      .replace(/\s*\n\s*/g, ' ')
      .trim())
    .filter(Boolean);
}

function renderInline(text, { resolveAsset } = {}) {
  const tokens = [];
  const stash = (html) => {
    const key = `\u0000${tokens.length}\u0000`;
    tokens.push(html);
    return key;
  };
  const restore = (input) => input.replace(/\u0000(\d+)\u0000/g, (_, idx) => tokens[Number(idx)]);

  let out = String(text ?? '');
  out = out.replace(/`([^`\n]+)`/g, (_, code) => stash(`<code>${escapeHTML(code)}</code>`));
  out = out.replace(/!\[([^\]]*)\]\((?:<([^>]+)>|([^)\s]+))(?:\s+"([^"]*)")?\)/g, (_, alt, angleSrc, plainSrc, title) => {
    const rawSrc = angleSrc ?? plainSrc;
    const resolved = resolveAsset ? resolveAsset(rawSrc) : rawSrc;
    const safeSrc = sanitizeUrl(resolved, { allowDataImage: true });
    if (!safeSrc) return escapeHTML(alt);
    const titleAttr = title ? ` title="${escapeHTML(title)}"` : '';
    return stash(`<img src="${escapeHTML(safeSrc)}" alt="${escapeHTML(alt)}"${titleAttr} loading="lazy">`);
  });
  out = out.replace(/\[([^\]]+)\]\((?:<([^>]+)>|([^)\s]+))(?:\s+"([^"]*)")?\)/g, (_, label, angleHref, plainHref, title) => {
    const rawHref = angleHref ?? plainHref;
    const safeHref = sanitizeUrl(rawHref);
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
