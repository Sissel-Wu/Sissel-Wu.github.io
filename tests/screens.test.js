import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerminalTimeline} from '../src/screens.js';

test('terminal pauses for seconds and advances one line over a full second',()=>{
  const timeline=createTerminalTimeline();
  assert.equal(timeline.sample(0),null);
  assert.equal(timeline.sample(5999),null);
  assert.equal(timeline.sample(6000),null);
  assert.deepEqual(timeline.sample(6500),{index:0,offset:4});
  assert.equal(timeline.sample(6501),null);
  assert.deepEqual(timeline.sample(7000),{index:1,offset:0});
  assert.equal(timeline.sample(12999),null);
  assert.equal(timeline.sample(13000),null);
  assert.deepEqual(timeline.sample(14000),{index:2,offset:0});
  assert.equal(timeline.sample(20999),null);
});
test('returning after a long pause does not fast-forward through terminal output',()=>{
  const timeline=createTerminalTimeline();timeline.sample(0);
  assert.equal(timeline.sample(1000000),null);
  assert.deepEqual(timeline.sample(1000500),{index:0,offset:4});
  assert.deepEqual(timeline.sample(1001000),{index:1,offset:0});
});
test('reduced motion never requests terminal animation renders',()=>{
  const timeline=createTerminalTimeline({reducedMotion:true});
  for(const now of [0,6000,6500,7000,13000,1000000])assert.equal(timeline.sample(now),null);
});
