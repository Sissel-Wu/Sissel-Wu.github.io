import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Original 16 × 16 tiles, kept crisp at every viewing distance.
export function pixelMaterial(color, pattern = 'stone') {
  const base = new THREE.Color(color), pixels = new Uint8Array(16 * 16 * 4);
  let seed = 713;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    let shade = .9 + (seed % 6) * .035;
    if (pattern === 'wood') shade += y % 4 === 0 ? -.16 : (x + y * 3) % 11 < 3 ? -.08 : .03;
    if (pattern === 'fabric') shade += (x + y) % 2 ? -.055 : .055;
    if (pattern === 'brick' && (y % 8 === 0 || (x + (y < 8 ? 0 : 8)) % 16 === 0)) shade = .76;
    const tint = base.clone().multiplyScalar(shade).convertLinearToSRGB();
    const index = (y * 16 + x) * 4;
    pixels[index] = Math.round(Math.min(1, tint.r) * 255);
    pixels[index + 1] = Math.round(Math.min(1, tint.g) * 255);
    pixels[index + 2] = Math.round(Math.min(1, tint.b) * 255);
    pixels[index + 3] = 255;
  }
  const map = new THREE.DataTexture(pixels, 16, 16);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = map.minFilter = THREE.NearestFilter;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.generateMipmaps = false;map.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ color: '#ffffff', map, roughness: 1, flatShading: true });
}

export function blockGeometry(w, h, d) {
  const geometry = new THREE.BoxGeometry(w, h, d), uv = geometry.getAttribute('uv');
  // Keep texels the same size on walls, furniture and small accessories.
  const faces = [[d,h], [d,h], [w,d], [w,d], [w,h], [w,h]];
  faces.forEach(([width, height], face) => {
    for (let i = face * 4; i < face * 4 + 4; i++) uv.setXY(i, uv.getX(i) * width / .8, uv.getY(i) * height / .8);
  });
  return geometry;
}

// Square, stepped profiles replace turned pottery and round lampshades.
export function steppedGeometry(top, bottom, height) {
  if (top === bottom) return blockGeometry(top * 2, height, top * 2);
  const pieces = [], steps = 3;
  for (let i = 0; i < steps; i++) {
    const radius = bottom + (top - bottom) * i / (steps - 1);
    pieces.push(blockGeometry(radius * 2, height / steps, radius * 2).translate(0, -height / 2 + (i + .5) * height / steps, 0));
  }
  const geometry = mergeGeometries(pieces);
  pieces.forEach(piece => piece.dispose());
  return geometry;
}
