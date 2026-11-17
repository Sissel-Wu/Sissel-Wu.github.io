import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWindowFrame, createWindowWallSections, createPhotoCamera } from '../src/fixtures.js';

// Adjacent solid parts may touch, but must not occupy the same volume:
// overlapping boxes with equal depths have competing visible front/back faces.
function assertSeparateSolids(parts) {
  const bounds=parts.map(part=>new THREE.Box3().setFromObject(part));
  for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++){
    const overlap=bounds[i].clone().intersect(bounds[j]).getSize(new THREE.Vector3());
    // BoxGeometry stores Float32 vertices; room-sized pieces round at ~1e-7.
    assert.ok(Math.min(overlap.x,overlap.y,overlap.z)<1e-6,
      `${parts[i].name} overlaps ${parts[j].name}`);
  }
}
function dispose(root,material) {
  root.traverse(part=>part.geometry?.dispose());material.dispose();
}

test('window joints have no overlapping surfaces and keep the opening framed',()=>{
  const material=new THREE.MeshBasicMaterial(),frame=createWindowFrame(material);
  assertSeparateSolids(frame.children);
  // Both horizontal arms must meet the center stile, without a gap.
  const center=new THREE.Box3().setFromObject(frame.getObjectByName('center-stile'));
  for(const rail of frame.children.filter(part=>part.name==='center-rail')){
    const bounds=new THREE.Box3().setFromObject(rail);
    const gap=rail.position.x<0?center.min.x-bounds.max.x:bounds.min.x-center.max.x;
    assert.ok(Math.abs(gap)<1e-7);
  }
  dispose(frame,material);
});

test('the entire window fits the masonry opening without overlapping wall reveals',()=>{
  const material=new THREE.MeshBasicMaterial(),window=new THREE.Group();
  const walls=createWindowWallSections(material,-6.87,2.43),frame=createWindowFrame(material);
  window.add(walls,frame);
  assertSeparateSolids([...walls.children,...frame.children]);
  // Inspect the exposed upper and lower wooden reveals from inside the room.
  // The old wall/glass-sized opening produced two hits at the very same depth.
  window.updateMatrixWorld(true);
  for(const x of [-1.4,-.7,.7,1.4])for(const y of [1.68,4.28]){
    const target=new THREE.Vector3(x,y,0);
    const origin=new THREE.Vector3(x,2.98,2);
    const ray=new THREE.Raycaster(origin,target.clone().sub(origin).normalize());
    const hits=ray.intersectObject(window,true);
    assert.ok(hits.length>0);
    assert.equal(hits[0].object.name,'outer-rail');
    assert.ok(!hits.slice(1).some(hit=>hit.object!==hits[0].object&&Math.abs(hit.distance-hits[0].distance)<1e-6),
      'wood and plaster must not compete at an exposed reveal');
  }
  dispose(window,material);
});

test('camera trim is a separate body band, with no black body underneath it',()=>{
  const material=new THREE.MeshBasicMaterial();
  const camera=createPhotoCamera({body:material,trim:material,glass:material,shutter:material,accent:material});
  const bands=camera.children.filter(part=>part.name.startsWith('body-'));
  assertSeparateSolids(bands);
  const bounds=bands.map(part=>new THREE.Box3().setFromObject(part)).sort((a,b)=>a.min.y-b.min.y);
  for(let i=1;i<bounds.length;i++)assert.ok(Math.abs(bounds[i].min.y-bounds[i-1].max.y)<1e-7);
  assert.ok(Math.abs(bounds[0].min.y+.135)<1e-7);
  assert.ok(Math.abs(bounds.at(-1).max.y-.135)<1e-7);
  dispose(camera,material);
});
