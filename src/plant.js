import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { blockGeometry, pixelMaterial } from './voxel.js';

// Distinct silhouettes keep small plants readable from across the room.
export function createPlant({ variant = 'broadleaf', potMaterial, soilMaterial } = {}) {
  const root = new THREE.Group();root.name = `plant-${variant}`;
  function batch(name, blocks, material) {
    if (!blocks.length) return;
    const parts = blocks.map(([w,h,d,x,y,z]) => blockGeometry(w,h,d).translate(x,y,z));
    const mesh = new THREE.Mesh(mergeGeometries(parts), material);
    parts.forEach(part => part.dispose());
    mesh.name = name;mesh.castShadow = mesh.receiveShadow = true;root.add(mesh);
  }
  batch('pot', [
    [.3,.06,.3,0,.03,0], [.36,.22,.36,0,.17,0],
    [.4,.05,.045,0,.295,.178], [.4,.05,.045,0,.295,-.178],
    [.045,.05,.31,.178,.295,0], [.045,.05,.31,-.178,.295,0],
  ], potMaterial ?? pixelMaterial('#bd7953'));
  batch('soil', [[.31,.025,.31,0,.27,0]], soilMaterial ?? pixelMaterial('#63472d'));
  const stem = pixelMaterial('#4d713e'), leaf = pixelMaterial(variant==='christmas'?'#285b46':'#527e43'), light = pixelMaterial(variant==='christmas'?'#397456':'#7b9a50');
  const stems = [], leaves = [], tips = [];
  if (variant === 'christmas') {
    stems.push([.12,.23,.12,0,.385,0]);
    // Three overlapping, stepped boughs form a familiar evergreen silhouette.
    for(const [width,y,steps] of [[.86,.47,4],[.64,.83,3],[.42,1.1,3]]) {
      for(let i=0;i<steps;i++) {
        const w=width-i*.13;
        (i%2?tips:leaves).push([w,.11,w,0,y+i*.1,0]);
      }
    }
    leaves.push([.1,.15,.1,0,1.41,0]);
    const gold=pixelMaterial('#e6b44d');gold.emissive.set('#c48a28');gold.emissiveIntensity=.18;
    batch('star',[[.06,.23,.055,0,1.57,0],[.2,.06,.055,0,1.57,0],[.12,.12,.055,0,1.57,0]],gold);
    batch('red-ornaments',[[.075,.075,.075,-.25,.49,.44],[.075,.075,.075,.17,.84,.33],[.065,.065,.065,-.08,1.12,.22]],pixelMaterial('#bc5140'));
    batch('gold-ornaments',[[.065,.065,.065,.25,.59,.37],[.065,.065,.065,-.15,.94,.265],[.06,.06,.06,.04,1.32,.09]],pixelMaterial('#e5bd62'));
  } else if (variant === 'cactus') {
    stems.push([.18,.59,.18,0,.585,0], [.12,.1,.12,0,.93,0],
      [.18,.12,.12,-.13,.52,0], [.12,.23,.12,-.24,.575,0],
      [.18,.12,.12,.13,.68,0], [.12,.22,.12,.24,.73,0]);
    for(const y of [.4,.54,.68,.82]) tips.push([.025,.04,.012,-.035,y,.096], [.025,.04,.012,.045,y+.03,.096]);
  } else if (variant === 'trailing') {
    leaves.push([.3,.06,.25,0,.33,.02], [.18,.06,.18,-.1,.39,0]);
    for (const [x, length] of [[-.12,6],[.09,4]]) {
      for(let i=0;i<length;i++) {
        const y=.3-i*.085, z=.18+Math.min(i,2)*.035;
        stems.push([.025,.11,.025,x,y,z]);
        leaves.push([.1,.065,.05,x+(i%2?.035:-.035),y,z+.018]);
      }
    }
    tips.push([.11,.065,.08,.14,.36,.02]);
  } else if (variant === 'flowers') {
    for(const [x,y,z] of [[-.1,.72,.025],[.09,.87,-.04],[.12,.59,.09]]) {
      stems.push([.025,y-.28,.025,x,(y+.28)/2,z]);
      leaves.push([.13,.035,.065,x-.04,y-.2,z], [.08,.035,.07,x+.04,y-.13,z]);
      // A five-block flower face points into the room.
      const petals = [[.18,.06,.055,x,y,z], [.06,.18,.055,x,y,z]];
      batch('petals',petals,pixelMaterial(y>.8?'#f2cf68':'#d58066'));
      batch('flower-center',[[.06,.06,.025,x,y,z+.04]],pixelMaterial('#805632'));
    }
  } else {
    stems.push([.055,1.03,.055,0,.795,0]);
    for(const [side,y,z] of [[-1,.55,.035],[1,.75,-.025],[-1,.99,-.035],[1,1.18,.025]]) {
      stems.push([.23,.035,.035,side*.11,y,z]);
      leaves.push([.23,.045,.16,side*.245,y+.025,z], [.13,.045,.11,side*.395,y+.025,z]);
      tips.push([.17,.018,.06,side*.25,y+.057,z]);
    }
    leaves.push([.13,.16,.1,0,1.34,0]);
  }
  batch('stems',stems,stem);batch('leaves',leaves,leaf);batch('leaf-highlights',tips,light);
  // Unused materials are not attached to the scene's disposal traversal.
  if(!stems.length){stem.map.dispose();stem.dispose();}
  if(!leaves.length){leaf.map.dispose();leaf.dispose();}
  if(!tips.length){light.map.dispose();light.dispose();}
  return root;
}
