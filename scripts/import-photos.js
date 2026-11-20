import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SHARP_INPUT_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff', '.gif']);
const SIPS_FALLBACK_EXTS = new Set([
  '.heic',
  '.heif',
  '.dng',
  '.cr2',
  '.cr3',
  '.nef',
  '.arw',
  '.raf',
  '.orf',
  '.rw2',
  '.bmp',
]);

const DEFAULT_MAX_SIZE = 1600;
const DEFAULT_QUALITY = 82;
const DEFAULT_FORMAT = 'webp';

const naturalCompare = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });

export function printHelp(stream = process.stdout) {
  stream.write(`用法:
  npm run import-photos -- <源路径> [相册文件夹名] [选项]

参数:
  <源路径>           相机照片目录，或单张照片文件
  [相册文件夹名]     导入到 content/photos/<相册文件夹名>/（源路径为目录时默认取目录名）

选项:
  --album <名>       指定相册文件夹名
  --title <标题>     写入或更新 album.yaml 中的相册标题
  --format <格式>    输出格式：webp（默认）或 jpg
  --max-size <像素>  长边最大像素（默认 ${DEFAULT_MAX_SIZE}）
  --quality <1-100>  压缩质量（默认 ${DEFAULT_QUALITY}）
  --recursive, -r    递归扫描源目录下的子文件夹
  --overwrite        覆盖目标目录中已存在的同名文件（默认跳过）
  --dry-run          仅预览处理列表，不写入任何文件
  --help, -h         显示帮助
`);
}

export function validateAlbumId(albumId) {
  const value = String(albumId ?? '').trim();
  if (!value) throw new Error('相册文件夹名不能为空');
  if (value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
    throw new Error(`无效的相册文件夹名 "${value}"：不能包含路径分隔符或 "." / ".."`);
  }
  if (value.startsWith('.') || value.startsWith('_')) {
    throw new Error(`无效的相册文件夹名 "${value}"：不能以 "." 或 "_" 开头（构建时会将其视为草稿并忽略）`);
  }
  return value;
}

export function parseImportArgs(argv) {
  const options = {
    source: '',
    album: '',
    title: '',
    format: DEFAULT_FORMAT,
    maxSize: DEFAULT_MAX_SIZE,
    quality: DEFAULT_QUALITY,
    recursive: false,
    overwrite: false,
    dryRun: false,
    help: false,
  };

  const positionals = [];
  const readValue = (flag, index) => {
    const val = argv[index + 1];
    if (val === undefined || val.startsWith('-')) {
      throw new Error(`参数 ${flag} 缺少取值`);
    }
    return val;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--recursive' || arg === '-r') {
      options.recursive = true;
    } else if (arg === '--overwrite') {
      options.overwrite = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--album') {
      options.album = readValue(arg, i);
      i += 1;
    } else if (arg === '--title') {
      options.title = readValue(arg, i);
      i += 1;
    } else if (arg === '--format') {
      const rawFormat = readValue(arg, i).toLowerCase();
      options.format = rawFormat === 'jpeg' ? 'jpg' : rawFormat;
      if (options.format !== 'webp' && options.format !== 'jpg') {
        throw new Error(`不支持的输出格式 "${rawFormat}"，仅支持 webp 或 jpg`);
      }
      i += 1;
    } else if (arg === '--max-size') {
      const rawSize = readValue(arg, i);
      const parsed = Number(rawSize);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`--max-size 必须是正整数，收到 "${rawSize}"`);
      }
      options.maxSize = parsed;
      i += 1;
    } else if (arg === '--quality') {
      const rawQuality = readValue(arg, i);
      const parsed = Number(rawQuality);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
        throw new Error(`--quality 必须是 1-100 的整数，收到 "${rawQuality}"`);
      }
      options.quality = parsed;
      i += 1;
    } else if (arg.startsWith('-')) {
      throw new Error(`未知参数: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }

  if (options.help) return options;
  if (positionals.length === 0) {
    throw new Error('请提供源照片路径');
  }
  if (positionals.length > 2) {
    throw new Error(`多余的位置参数: ${positionals.slice(2).join(' ')}`);
  }

  options.source = positionals[0];
  if (!options.album && positionals[1]) {
    options.album = positionals[1];
  }
  return options;
}

export function sanitizeOutputStem(fileName) {
  const rawStem = basename(fileName, extname(fileName))
    .replace(/^[._]+/, '')
    .trim();
  return rawStem || 'photo';
}

export function upsertAlbumTitle(yamlPath, title) {
  const titleLine = `title: ${JSON.stringify(title)}`;
  if (!existsSync(yamlPath)) {
    writeFileSync(yamlPath, `${titleLine}\n`, 'utf8');
    return;
  }

  const raw = readFileSync(yamlPath, 'utf8');
  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const existingIdx = lines.findIndex((line) => /^title\s*:/.test(line));
  if (existingIdx !== -1) {
    lines[existingIdx] = titleLine;
  } else {
    let insertIdx = 0;
    while (insertIdx < lines.length && (lines[insertIdx].trim() === '' || lines[insertIdx].trimStart().startsWith('#'))) {
      insertIdx += 1;
    }
    if (lines[insertIdx]?.trim() === '---') {
      insertIdx += 1;
    }
    lines.splice(insertIdx, 0, titleLine);
  }
  const output = lines.join('\n').replace(/\n*$/, '\n');
  writeFileSync(yamlPath, output, 'utf8');
}

function collectSourceFiles(sourcePath, { recursive, allowSipsFallback }) {
  const stats = statSync(sourcePath);
  const isSupported = (filePath) => {
    const ext = extname(filePath).toLowerCase();
    return SHARP_INPUT_EXTS.has(ext) || (allowSipsFallback && SIPS_FALLBACK_EXTS.has(ext));
  };

  if (stats.isFile()) {
    if (!isSupported(sourcePath)) {
      throw new Error(`不支持的图片格式: ${extname(sourcePath) || sourcePath}`);
    }
    return [sourcePath];
  }
  if (!stats.isDirectory()) {
    throw new Error(`源路径既不是文件也不是目录: ${sourcePath}`);
  }

  const results = [];
  const walk = (dir) => {
    const entries = readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => naturalCompare(a.name, b.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (recursive) walk(fullPath);
      } else if (entry.isFile() && isSupported(fullPath)) {
        results.push(fullPath);
      }
    }
  };
  walk(sourcePath);
  return results;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function importPhotos(options, {
  contentDir = resolve(fileURLToPath(new URL('../content', import.meta.url))),
  platform = process.platform,
  sipsPath = '/usr/bin/sips',
  log = console.log,
} = {}) {
  const sourcePath = resolve(options.source);
  if (!existsSync(sourcePath)) {
    throw new Error(`源路径不存在: ${sourcePath}`);
  }

  const sourceStat = statSync(sourcePath);
  const rawAlbumId = options.album || (sourceStat.isDirectory() ? basename(sourcePath) : '');
  const albumId = validateAlbumId(rawAlbumId);
  const albumDir = join(contentDir, 'photos', albumId);

  const allowSipsFallback = platform === 'darwin' && existsSync(sipsPath);
  const files = collectSourceFiles(sourcePath, {
    recursive: options.recursive,
    allowSipsFallback,
  });

  if (files.length === 0) {
    throw new Error(`在 ${sourcePath} 中没有找到可导入的图片文件`);
  }

  if (!options.dryRun) {
    mkdirSync(albumDir, { recursive: true });
    if (options.title) {
      upsertAlbumTitle(join(albumDir, 'album.yaml'), options.title);
    }
  }

  const usedNames = new Set();
  const ext = `.${options.format}`;
  const results = [];
  let tempDir = '';

  try {
    for (let i = 0; i < files.length; i += 1) {
      const srcFile = files[i];
      const baseStem = sanitizeOutputStem(srcFile);
      let candidateName = `${baseStem}${ext}`;
      let suffix = 2;
      while (usedNames.has(candidateName.toLowerCase())) {
        candidateName = `${baseStem}-${suffix}${ext}`;
        suffix += 1;
      }
      usedNames.add(candidateName.toLowerCase());

      const destFile = join(albumDir, candidateName);
      const srcBytes = statSync(srcFile).size;

      if (!options.overwrite && existsSync(destFile)) {
        log(`跳过 (已存在): ${candidateName}`);
        results.push({ srcFile, destFile, status: 'skipped', srcBytes, destBytes: statSync(destFile).size });
        continue;
      }

      if (options.dryRun) {
        log(`[dry-run] ${basename(srcFile)} (${formatBytes(srcBytes)}) -> content/photos/${albumId}/${candidateName}`);
        results.push({ srcFile, destFile, status: 'dry-run', srcBytes, destBytes: 0 });
        continue;
      }

      let sharpInput = srcFile;
      const srcExt = extname(srcFile).toLowerCase();
      if (!SHARP_INPUT_EXTS.has(srcExt) && allowSipsFallback) {
        if (!tempDir) tempDir = mkdtempSync(join(tmpdir(), 'import-photos-'));
        const decodedPath = join(tempDir, `${i}.png`);
        execFileSync(sipsPath, ['-s', 'format', 'png', srcFile, '--out', decodedPath], { stdio: 'ignore' });
        sharpInput = decodedPath;
      }

      const pipeline = sharp(sharpInput)
        .rotate()
        .toColorspace('srgb')
        .resize({
          width: options.maxSize,
          height: options.maxSize,
          fit: 'inside',
          withoutEnlargement: true,
        });

      const { data, info } = options.format === 'webp'
        ? await pipeline.webp({ quality: options.quality }).toBuffer({ resolveWithObject: true })
        : await pipeline.jpeg({ quality: options.quality, mozjpeg: true }).toBuffer({ resolveWithObject: true });

      writeFileSync(destFile, data);
      log(`导入: ${basename(srcFile)} (${formatBytes(srcBytes)}) -> ${candidateName} (${info.width}x${info.height}, ${formatBytes(data.length)})`);
      results.push({
        srcFile,
        destFile,
        status: 'imported',
        srcBytes,
        destBytes: data.length,
        width: info.width,
        height: info.height,
      });
    }
  } finally {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  const imported = results.filter((item) => item.status === 'imported');
  const totalIn = imported.reduce((sum, item) => sum + item.srcBytes, 0);
  const totalOut = imported.reduce((sum, item) => sum + item.destBytes, 0);
  if (imported.length > 0) {
    log(`完成：已导入 ${imported.length} 张照片到 content/photos/${albumId}/（${formatBytes(totalIn)} -> ${formatBytes(totalOut)}）`);
  }

  return { albumId, albumDir, results };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const options = parseImportArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
    } else {
      await importPhotos(options);
    }
  } catch (error) {
    console.error(`错误: ${error.message}`);
    process.exitCode = 1;
  }
}
