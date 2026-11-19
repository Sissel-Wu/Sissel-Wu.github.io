import { loadContent } from './content/loader.js';

// Editable content lives under content/ (see content/README.md).
const profileFiles = import.meta.glob('../content/profile.{md,yaml,yml,json}', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const articleFiles = import.meta.glob(
  ['../content/articles/**/*.md', '!../content/articles/**/README.md'],
  { query: '?raw', import: 'default', eager: true },
);
const photoMetaFiles = import.meta.glob(
  '../content/photos/*/{album,index}.{yaml,yml,json}',
  { query: '?raw', import: 'default', eager: true },
);
const videoMetaFiles = import.meta.glob(
  '../content/videos/*.{yaml,yml,json}',
  { query: '?raw', import: 'default', eager: true },
);
const musicMetaFiles = import.meta.glob(
  '../content/music/*.{yaml,yml,json}',
  { query: '?raw', import: 'default', eager: true },
);
const imageAssets = import.meta.glob(
  '../content/**/*.{jpg,jpeg,png,webp,avif,gif,svg,JPG,JPEG,PNG,WEBP,AVIF,GIF,SVG}',
  { eager: true, import: 'default' },
);
const audioAssets = import.meta.glob(
  '../content/**/*.{mp3,wav,ogg,m4a,flac,aac,MP3,WAV,OGG,M4A,FLAC,AAC}',
  { eager: true, import: 'default' },
);

export const { profile, posts, photoAlbums, videos, musicTracks } = loadContent({
  profileFiles,
  articleFiles,
  photoMetaFiles,
  videoMetaFiles,
  musicMetaFiles,
  imageAssets,
  audioAssets,
});
