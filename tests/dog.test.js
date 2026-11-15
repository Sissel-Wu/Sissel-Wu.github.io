import test from 'node:test';
import assert from 'node:assert/strict';
import { createDog } from '../src/dog.js';

function pose(root){
  const result=[];
  root.traverse(node=>result.push(...node.position.toArray(),...node.quaternion.toArray(),...node.scale.toArray()));
  return result;
}
function dispose(root){root.traverse(node=>{node.geometry?.dispose();node.material?.dispose();});}

test('each dog interaction changes the pose and returns to rest without continuing to render',()=>{
  const dog=createDog(),rest=pose(dog.root);
  for(const action of ['pet','paw','spin']){
    dog.play(action,0);
    assert.equal(dog.update(1000),true);
    assert.notDeepEqual(pose(dog.root),rest);
    assert.ok(pose(dog.root).every(Number.isFinite));
    dog.update(4000);dog.update(4016);
    assert.deepEqual(pose(dog.root),rest);
    assert.equal(dog.active,false);
    assert.equal(dog.update(4032),false);
  }
  dispose(dog.root);
});
test('reduced motion keeps the dog still while interaction feedback remains available',()=>{
  const dog=createDog({reducedMotion:true}),rest=pose(dog.root);
  dog.play('spin',0);dog.update(1000);
  assert.deepEqual(pose(dog.root),rest);
  assert.equal(dog.active,false);
  dispose(dog.root);
});
