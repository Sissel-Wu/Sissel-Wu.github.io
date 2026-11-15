import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Build once per room, then clone the group: all pots share geometry/materials.
// Thin, opaque leaves use real silhouettes rather than transparent leaf cards.
export function createPlant({ potMaterial, soilMaterial } = {}) {
  const root = new THREE.Group();
  root.name = 'plant';
  function mesh(name, geometry, material) {
    const result = new THREE.Mesh(geometry, material);
    result.name = name;
    result.castShadow = true;
    result.receiveShadow = true;
    root.add(result);
    return result;
  }
  const profile = [
    [0, 0], [.145, 0], [.155, .025], [.199, .295],
    [.205, .315], [.202, .33], [.182, .33], [.177, .3], [.17, .265],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  mesh('pot', new THREE.LatheGeometry(profile, 32), potMaterial ??
    new THREE.MeshStandardMaterial({ color: '#e5dbc1', roughness: .8 }));
  const soil = mesh('soil', new THREE.CylinderGeometry(.178, .178, .012, 24), soilMaterial ??
    new THREE.MeshStandardMaterial({ color: '#735436', roughness: 1 }));
  soil.position.y = .29;

  const leaves = [], stems = [];
  const palette = ['#496345', '#60794e', '#738555', '#536e49'];
  for (let i = 0; i < 13; i++) {
    // Broad, drooping outer leaves surround narrower upright new growth.
    const inner = i >= 9;
    const angle = i * 2.399963 + .35;
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const across = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
    const height = inner ? 1.04 + (i - 9) * .075 : .67 + (i % 3) * .115;
    const reach = inner ? .075 : .14 + (i % 2) * .025;
    const start = radial.clone().multiplyScalar(reach);
    start.y = height;
    const length = inner ? .39 + (i % 2) * .06 : .52 + (i % 4) * .035;
    const width = inner ? .083 : .135 + (i % 3) * .012;
    const rise = inner ? .9 : .25 + (i % 3) * .09;
    const droop = inner ? .17 : .58;
    const center = t => start.clone().addScaledVector(radial, length * t * (inner ? .46 : .86))
      .add(new THREE.Vector3(0, length * (rise * t + .24 * Math.sin(Math.PI * t) - droop * t * t), 0));

    // Each stalk terminates at the exact leaf base; the exposed stems curve out
    // from within the soil instead of tilting disconnected cylinders.
    const foot = radial.clone().multiplyScalar(.035);
    foot.y = .29;
    const control = radial.clone().multiplyScalar(reach * .16);
    control.y = height * .7;
    stems.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(foot, control, start), 6, inner ? .005 : .007, 5, false));

    const positions = [], colors = [], indices = [];
    const base = new THREE.Color(palette[i % palette.length]);
    const tip = new THREE.Color('#8d9c62');
    const vein = new THREE.Color('#a1ad75');
    function vertex(t, u) {
      const shape = Math.pow(Math.sin(Math.PI * t), .8) * (1 - .24 * t);
      const point = center(t).addScaledVector(across, width * shape * u);
      // A raised midrib, cupped sides and a slight twist catch the room light.
      point.y += width * shape * (-.26 * Math.abs(u) + .12 * u * Math.sin(t * 3 + i));
      positions.push(...point.toArray());
      const color = base.clone().lerp(tip, t * .27);
      color.multiplyScalar(1 - Math.abs(u) * .12);
      if (u === 0) color.lerp(vein, .32);
      colors.push(color.r, color.g, color.b);
    }
    vertex(0, 0);
    for (let row = 1; row < 10; row++) {
      for (const u of [-1, -.5, 0, .5, 1]) vertex(row / 10, u);
    }
    vertex(1, 0);
    // Single vertices at both tips avoid collapsed triangles and bad normals.
    for (let col = 0; col < 4; col++) indices.push(0, 1 + col, 2 + col);
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 4; col++) {
        const a = 1 + row * 5 + col, b = a + 5;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    for (let col = 0; col < 4; col++) indices.push(41 + col, 46, 42 + col);
    // Orient the front normals toward the upper surface of each leaf.
    for (let j = 0; j < indices.length; j += 3) {
      [indices[j + 1], indices[j + 2]] = [indices[j + 2], indices[j + 1]];
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    leaves.push(geometry);
  }
  mesh('stems', mergeGeometries(stems), new THREE.MeshStandardMaterial({ color: '#63784b', roughness: .9 }));
  mesh('leaves', mergeGeometries(leaves), new THREE.MeshStandardMaterial({
    vertexColors: true, side: THREE.DoubleSide, roughness: .82,
  }));
  [...stems, ...leaves].forEach(geometry => geometry.dispose());
  return root;
}
