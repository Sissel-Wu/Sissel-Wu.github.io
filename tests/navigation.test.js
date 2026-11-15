import test from 'node:test';
import assert from 'node:assert/strict';
import { VIEWS, YAW_LIMITS, clampYaw, pointerYaw, smoothYaw } from '../src/navigation.js';

test('mouse and drag extremes stay within the living-to-desk arc',()=>{
  for(const value of [-100,-1,0,1,100]){
    for(const view of Object.keys(VIEWS)){
      const yaw=pointerYaw(view,value);
      assert.ok(yaw>=YAW_LIMITS[0]&&yaw<=YAW_LIMITS[1]);
    }
    assert.ok(clampYaw(value)>=YAW_LIMITS[0]&&clampYaw(value)<=YAW_LIMITS[1]);
  }
});
test('view animation converges without overshooting at different frame rates',()=>{
  for(const fps of [30,60,120]){
    let yaw=VIEWS.living;
    for(let i=0;i<fps*3;i++){
      yaw=smoothYaw(yaw,VIEWS.desk,1/fps);
      assert.ok(yaw>=VIEWS.living&&yaw<=VIEWS.desk);
    }
    assert.ok(Math.abs(yaw-VIEWS.desk)<.001);
  }
});
test('mouse can reach both room limits from either selected view',()=>{
  for(const view of Object.keys(VIEWS)){
    assert.equal(pointerYaw(view,-1),YAW_LIMITS[0]);
    assert.equal(pointerYaw(view,1),YAW_LIMITS[1]);
    assert.equal(pointerYaw(view,0),VIEWS[view]);
  }
});

test('repeated pointer coordinates keep converging without reversing or stopping',()=>{
  for(const view of Object.keys(VIEWS)){
    let yaw=YAW_LIMITS[0];
    const target=pointerYaw(view,-.3);
    // Repeated events from a changing hit target must not reset the camera target.
    for(let i=0;i<180;i++){
      const next=smoothYaw(yaw,pointerYaw(view,-.3),1/60);
      assert.ok(next>yaw&&next<=target);
      yaw=next;
    }
    assert.ok(Math.abs(yaw-target)<.001);
    assert.ok(pointerYaw(view,-.2999)>target,'small mouse movements still update the target');
  }
});

test('right limit fits the whole cabinet, without extra rotation on wide screens', async()=>{
  const THREE=await import('three');
  const {fitRightYaw}=await import('../src/navigation.js');
  const limits=[];
  for(const [aspect,fov] of [[16/9,49],[1436/1323,49],[390/844,59]]){
    const camera=new THREE.PerspectiveCamera(fov,aspect,.1,70);camera.position.set(0,2.9,7.4);
    const corners=[];
    for(const x of [6.72,7.32])for(const y of [0,3.33])for(const z of [-3.99,-1.21])corners.push(new THREE.Vector3(x,y,z));
    const rightEdge=yaw=>{
      camera.lookAt(Math.sin(yaw)*10,1.56,7.4-Math.cos(yaw)*10);camera.updateMatrixWorld();
      return Math.max(...corners.map(p=>p.clone().project(camera).x));
    };
    const limit=fitRightYaw(rightEdge);
    assert.ok(rightEdge(limit)<=.920001);
    assert.ok(rightEdge(limit-.001)>.92,'endpoint should be the first angle that fits');
    limits.push(limit);
  }
  assert.ok(limits[0]<limits[1]&&limits[1]<limits[2]);
  assert.ok(limits[1]<.4,'desktop endpoint should be tighter than the old desk preset');
});
