function normalizeNewlines(text) {
  return String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function stripComment(text) {
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote === "'") {
      if (ch === "'" && text[i + 1] === "'") {
        i += 1;
      } else if (ch === "'") {
        quote = null;
      }
      continue;
    }
    if (quote === '"') {
      if (ch === '\\') {
        i += 1;
      } else if (ch === '"') {
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === '#' && (i === 0 || /\s/.test(text[i - 1]))) {
      return text.slice(0, i).trimEnd();
    }
  }
  return text.trimEnd();
}

function unquote(value) {
  if (value.length >= 2 && value[0] === "'" && value[value.length - 1] === "'") {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"') {
    return value.slice(1, -1).replace(/\\(["\\ntr])/g, (_, ch) => (
      { '"': '"', '\\': '\\', n: '\n', t: '\t', r: '\r' }[ch]
    ));
  }
  return value;
}

function splitInlineItems(inner) {
  const items = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (quote === "'") {
      current += ch;
      if (ch === "'" && inner[i + 1] === "'") {
        current += inner[++i];
      } else if (ch === "'") {
        quote = null;
      }
      continue;
    }
    if (quote === '"') {
      current += ch;
      if (ch === '\\' && i + 1 < inner.length) {
        current += inner[++i];
      } else if (ch === '"') {
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
    } else if (ch === ',') {
      items.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim() !== '') items.push(current.trim());
  return items;
}

function parseScalar(raw) {
  const value = raw.trim();
  if (value === '') return '';
  if (
    (value[0] === "'" && value[value.length - 1] === "'" && value.length >= 2) ||
    (value[0] === '"' && value[value.length - 1] === '"' && value.length >= 2)
  ) {
    return unquote(value);
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return splitInlineItems(inner).map(parseScalar);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function splitKeyValue(content) {
  let quote = null;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (quote === "'") {
      if (ch === "'" && content[i + 1] === "'") {
        i += 1;
      } else if (ch === "'") {
        quote = null;
      }
      continue;
    }
    if (quote === '"') {
      if (ch === '\\') {
        i += 1;
      } else if (ch === '"') {
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === ':' && (i === content.length - 1 || /\s/.test(content[i + 1]))) {
      const key = unquote(content.slice(0, i).trim());
      if (!key) return null;
      const value = content.slice(i + 1).trim();
      return { key, value };
    }
  }
  return null;
}

function isSequenceLine(content) {
  return content === '-' || content.startsWith('- ');
}

function isBlockScalarHeader(value) {
  return /^[|>][+-]?$/.test(value);
}

function prepareLines(text) {
  return normalizeNewlines(text).split('\n').map((raw) => {
    const indent = raw.match(/^ */)[0].length;
    const trimmed = raw.slice(indent);
    const content = stripComment(trimmed);
    return { raw, indent, content };
  });
}

function nextMeaningful(lines, index) {
  let i = index;
  while (i < lines.length && lines[i].content === '') i += 1;
  return i;
}

function parseBlockScalar(lines, startIndex, parentIndent, header) {
  const folded = header[0] === '>';
  const chomp = header[1] ?? '';
  const collected = [];
  let blockIndent = null;
  let i = startIndex;

  while (i < lines.length) {
    const { raw, indent } = lines[i];
    if (raw.trim() === '') {
      collected.push('');
      i += 1;
      continue;
    }
    if (indent <= parentIndent) break;
    if (blockIndent === null) blockIndent = indent;
    collected.push(raw.slice(Math.min(indent, blockIndent)));
    i += 1;
  }

  let end = collected.length;
  while (end > 0 && collected[end - 1] === '') end -= 1;
  const trimmedLines = collected.slice(0, end);

  let text;
  if (folded) {
    const paragraphs = [];
    let current = [];
    for (const line of trimmedLines) {
      if (line === '') {
        if (current.length) {
          paragraphs.push(current.join(' '));
          current = [];
        }
      } else {
        current.push(line);
      }
    }
    if (current.length) paragraphs.push(current.join(' '));
    text = paragraphs.join('\n\n');
  } else {
    text = trimmedLines.join('\n');
  }

  if (chomp === '+' && end < collected.length) {
    text += '\n'.repeat(collected.length - end);
  }
  return [text, i];
}

function parseMappingInto(obj, lines, startIndex, baseIndent) {
  let i = startIndex;
  while (true) {
    i = nextMeaningful(lines, i);
    if (i >= lines.length) break;
    const { indent, content } = lines[i];
    if (indent < baseIndent) break;
    if (indent > baseIndent) break;
    if (isSequenceLine(content)) break;

    const entry = splitKeyValue(content);
    if (!entry) break;
    i += 1;

    if (entry.value === '') {
      const next = nextMeaningful(lines, i);
      if (next < lines.length && lines[next].indent > baseIndent) {
        const [nested, nextAfter] = parseBlock(lines, next, baseIndent + 1);
        obj[entry.key] = nested;
        i = nextAfter;
      } else if (next < lines.length && lines[next].indent === baseIndent && isSequenceLine(lines[next].content)) {
        const [seq, nextAfter] = parseSequence(lines, next, baseIndent);
        obj[entry.key] = seq;
        i = nextAfter;
      } else {
        obj[entry.key] = null;
      }
    } else if (isBlockScalarHeader(entry.value)) {
      const [text, nextAfter] = parseBlockScalar(lines, i, baseIndent, entry.value);
      obj[entry.key] = text;
      i = nextAfter;
    } else {
      obj[entry.key] = parseScalar(entry.value);
    }
  }
  return [obj, i];
}

function parseSequence(lines, startIndex, baseIndent) {
  const items = [];
  let i = startIndex;

  while (true) {
    i = nextMeaningful(lines, i);
    if (i >= lines.length) break;
    const { indent, content } = lines[i];
    if (indent !== baseIndent || !isSequenceLine(content)) break;

    const rest = content.slice(1);
    const afterDash = rest.trimStart();
    const itemIndent = baseIndent + 1 + (rest.length - afterDash.length);
    i += 1;

    if (afterDash === '') {
      const next = nextMeaningful(lines, i);
      if (next < lines.length && lines[next].indent > baseIndent) {
        const [nested, nextAfter] = parseBlock(lines, next, baseIndent + 1);
        items.push(nested);
        i = nextAfter;
      } else {
        items.push(null);
      }
      continue;
    }

    if (isBlockScalarHeader(afterDash)) {
      const [text, nextAfter] = parseBlockScalar(lines, i, baseIndent, afterDash);
      items.push(text);
      i = nextAfter;
      continue;
    }

    const entry = splitKeyValue(afterDash);
    if (entry) {
      const obj = {};
      if (entry.value === '') {
        const next = nextMeaningful(lines, i);
        if (next < lines.length && lines[next].indent > itemIndent) {
          const [nested, nextAfter] = parseBlock(lines, next, itemIndent + 1);
          obj[entry.key] = nested;
          i = nextAfter;
        } else if (next < lines.length && lines[next].indent === itemIndent && isSequenceLine(lines[next].content)) {
          const [seq, nextAfter] = parseSequence(lines, next, itemIndent);
          obj[entry.key] = seq;
          i = nextAfter;
        } else {
          obj[entry.key] = null;
        }
      } else if (isBlockScalarHeader(entry.value)) {
        const [text, nextAfter] = parseBlockScalar(lines, i, itemIndent, entry.value);
        obj[entry.key] = text;
        i = nextAfter;
      } else {
        obj[entry.key] = parseScalar(entry.value);
      }

      const [, nextAfter] = parseMappingInto(obj, lines, i, itemIndent);
      items.push(obj);
      i = nextAfter;
      continue;
    }

    items.push(parseScalar(afterDash));
  }

  return [items, i];
}

function parseBlock(lines, startIndex, minIndent) {
  const i = nextMeaningful(lines, startIndex);
  if (i >= lines.length || lines[i].indent < minIndent) return [null, i];
  const { indent, content } = lines[i];
  if (isSequenceLine(content)) return parseSequence(lines, i, indent);
  if (splitKeyValue(content)) return parseMappingInto({}, lines, i, indent);
  return [parseScalar(content), i + 1];
}

export function parseYaml(text) {
  const lines = prepareLines(text);
  const [value] = parseBlock(lines, 0, 0);
  return value;
}

export function parseFrontmatter(raw) {
  const normalized = normalizeNewlines(raw);
  const match = normalized.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)([\s\S]*)$/);
  if (!match) return { data: {}, body: normalized.trim() };
  const parsed = parseYaml(match[1]);
  const data = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  return { data, body: match[2].trim() };
}
