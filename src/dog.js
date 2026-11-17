import * as THREE from 'three';
import { blockGeometry, pixelMaterial } from './voxel.js';

// A block-built Pomeranian; each animated part keeps its own pivot.
export function createDog({ reducedMotion = false, facingYaw = -.18 } = {}) {
  const root = new THREE.Group();root.name = 'voxel-dog';
  root.position.set(.15, 0, .55);
  const baseYaw = facingYaw;root.rotation.y = baseYaw;
  const fur = pixelMaterial('#cf995b'), lightFur = pixelMaterial('#edce94');
  const cream = pixelMaterial('#ffebbd');
  const dark = new THREE.MeshStandardMaterial({ color: '#30281f', roughness: 1 });
  const pink = new THREE.MeshStandardMaterial({ color: '#dc927f', roughness: 1 });
  function block(w,h,d,x,y,z,material=fur,parent=root) {
    const mesh = new THREE.Mesh(blockGeometry(w,h,d),material);
    mesh.position.set(x,y,z);mesh.castShadow = mesh.receiveShadow = true;parent.add(mesh);return mesh;
  }
  block(.52,.5,.65,0,.47,-.08);
  block(.64,.34,.5,0,.62,.06,lightFur);
  block(.48,.18,.42,0,.84,.1,lightFur);
  block(.34,.36,.09,0,.53,.35,cream);
  for (const side of [-1,1]) {
    block(.22,.23,.29,side*.25,.18,-.22,lightFur);
    block(.22,.12,.29,side*.25,.07,-.15,cream);
    const leg = new THREE.Group();leg.position.set(side*.17,.39,.21);root.add(leg);
    block(.15,.3,.16,0,-.14,0,lightFur,leg);
    block(.18,.12,.26,0,-.3,.045,cream,leg);
    if(side === -1) root.userData.paw = leg;
    block(.12,.22,.28,side*.34,.61,.1,cream);
  }
  const head = new THREE.Group();head.position.set(0,1,.12);root.add(head);
  block(.52,.42,.46,0,0,0,lightFur,head);
  block(.6,.18,.4,0,-.1,0,lightFur,head);
  const eyes = [];
  for (const side of [-1,1]) {
    block(.15,.2,.15,side*.185,.29,-.06,fur,head);
    block(.09,.08,.13,side*.185,.43,-.06,fur,head);
    block(.075,.12,.012,side*.185,.29,.021,pink,head);
    const eye = block(.065,.065,.025,side*.13,.035,.239,dark,head);
    eye.scale.y = 1.15;eyes.push(eye);
    block(.019,.019,.009,side*.13-.012,.052,.256,cream,head);
  }
  block(.26,.14,.16,0,-.09,.28,cream,head);
  block(.09,.065,.035,0,-.04,.37,dark,head);
  block(.1,.025,.012,0,-.157,.363,dark,head);
  block(.045,.065,.02,.015,-.18,.37,pink,head);
  const tail = new THREE.Group();tail.position.set(.08,.6,-.35);root.add(tail);
  block(.18,.32,.18,0,.12,-.12,lightFur,tail);
  block(.18,.18,.32,0,.35,-.05,lightFur,tail);
  block(.18,.17,.16,0,.26,.14,cream,tail);
  block(.5,.075,.46,0,.8,.1,pixelMaterial('#668248'));
  block(.075,.09,.025,0,.75,.347,pixelMaterial('#c9a753'));
  let action = null, started = 0, finishing = false;
  const paw = root.userData.paw;
  function resetPose() {
    root.position.y=0;root.rotation.y=baseYaw;
    head.rotation.set(0,0,0);tail.rotation.set(0,0,0);paw.rotation.set(0,0,0);eyes.forEach(eye=>eye.scale.y=1.15);
  }
  return {
    root,
    get active(){return action!==null;},
    play(next, now = performance.now()) {
      resetPose();action=reducedMotion?null:next;started=now;finishing=true;
    },
    update(now) {
      if (!action) { if(finishing){finishing=false;resetPose();return true;} return false; }
      const t=(now-started)/1000, duration=action==='spin'?2.6:3;
      if(t>=duration){action=null;resetPose();return true;}
      const envelope=Math.sin(Math.PI*Math.min(1,t/duration));
      tail.rotation.z=Math.sin(t*18)*.48*envelope;
      head.rotation.z=Math.sin(t*3)*.12*envelope;
      if(action==='pet'){root.position.y=Math.abs(Math.sin(t*6))*.045*envelope;eyes.forEach(eye=>eye.scale.y=1.15-.7*envelope);}
      if(action==='paw'){paw.rotation.x=-.95*envelope;paw.rotation.z=-.25*envelope;head.rotation.z=.14*envelope;}
      if(action==='spin'){
        const progress=t/duration, eased=progress*progress*(3-2*progress);
        root.rotation.y=baseYaw+Math.PI*2*eased;
        root.position.y=Math.abs(Math.sin(t*12))*.055*envelope;
      }
      return true;
    },
  };
}
