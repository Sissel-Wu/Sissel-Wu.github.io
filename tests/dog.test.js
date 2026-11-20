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

test('an interaction with no specified action randomly selects from all three poses', t=>{
  const dog=createDog();
  const random=t.mock.method(Math,'random');
  for(const [sample,action] of [[0,'pet'],[.5,'paw'],[.99,'spin']]){
    random.mock.mockImplementation(()=>sample);
    dog.play(action,0);dog.update(1000);
    const expected=pose(dog.root);
    assert.equal(dog.play(undefined,2000),action);
    dog.update(3000);
    assert.deepEqual(pose(dog.root),expected);
  }
  dispose(dog.root);
});

test('a dog facing the viewer at the middle of the room keeps that heading after interactions',()=>{
  const facingYaw=-Math.PI/4,dog=createDog({facingYaw});
  for(const action of ['pet','paw','spin']){
    dog.play(action,0);dog.update(1000);dog.update(4000);
    assert.equal(dog.root.rotation.y,facingYaw);
  }
  const reduced=createDog({facingYaw,reducedMotion:true});
  reduced.play('spin',0);reduced.update(1000);
  assert.equal(reduced.root.rotation.y,facingYaw);
  dispose(dog.root);dispose(reduced.root);
});
