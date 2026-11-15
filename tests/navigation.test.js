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
