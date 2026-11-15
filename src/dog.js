import * as THREE from 'three';

// A small, fluffy Pomeranian assembled locally from soft, low-poly forms.
export function createDog({ reducedMotion = false } = {}) {
  const root = new THREE.Group();
  root.position.set(.15, 0, .55);
  const baseYaw = -.18;
  root.rotation.y = baseYaw;
  const fur = new THREE.MeshStandardMaterial({ color: '#d5a265', roughness: .95 });
  const lightFur = new THREE.MeshStandardMaterial({ color: '#f0ddad', roughness: 1 });
  const cream = new THREE.MeshStandardMaterial({ color: '#fff0cd', roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: '#30281f', roughness: .3 });
  const pink = new THREE.MeshStandardMaterial({ color: '#cf8e78', roughness: .8 });
  const eyeLight = new THREE.MeshBasicMaterial({ color: '#fff6df' });
  function puff(radius, position, scale, material = fur, parent = root) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), material);
    mesh.position.set(...position);mesh.scale.set(...scale);mesh.castShadow = true;mesh.receiveShadow = true;parent.add(mesh);
    return mesh;
  }
  puff(.34, [0,.44,-.08], [1,1.05,1.18]);
  for (const side of [-1,1]) {
    puff(.18, [side*.24,.21,-.2], [1,.9,1.2], lightFur);
    const leg = new THREE.Group();leg.position.set(side*.17,.39,.21);root.add(leg);
    puff(.095, [0,-.13,0], [1,1.6,1], lightFur, leg);
    puff(.105, [0,-.3,.045], [1.05,.65,1.4], cream, leg);
    if (side === -1) root.userData.paw = leg;
  }
  // A generous ruff is the characteristic silhouette of a Pomeranian.
  puff(.32, [0,.64,.07], [1.18,1.1,1], lightFur);
  for (let i=0;i<16;i++) {
    const a = i / 16 * Math.PI * 2;
    puff(.115, [Math.cos(a)*.3,.64+Math.sin(a)*.3,.085+(i%3)*.027], [1,.95,1.3], i%3 ? lightFur : cream);
  }
  puff(.23, [0,.53,.3], [1,1.15,.6], cream);
  const eyes = [];
  const head = new THREE.Group();head.position.set(0,.99,.12);root.add(head);
  puff(.28, [0,0,0], [1.08,.97,.93], lightFur, head);
  for (const side of [-1,1]) {
    puff(.12, [side*.23,-.06,.015], [1.05,.85,1], lightFur, head);
    const ear = new THREE.Mesh(new THREE.ConeGeometry(.12,.26,3), fur);
    ear.position.set(side*.19,.22,-.015);ear.rotation.set(-.12,Math.PI,side*-.2);ear.castShadow = true;head.add(ear);
    const inside = new THREE.Mesh(new THREE.ConeGeometry(.065,.15,3), pink);
    inside.position.set(side*.19,.23,.043);inside.rotation.copy(ear.rotation);head.add(inside);
    eyes.push(puff(.037, [side*.115,.015,.245], [1,1.15,.6], dark, head));
    puff(.009, [side*.115-.008,.028,.266], [1,1,1], eyeLight, head);
    puff(.093, [side*.053,-.075,.265], [1,.8,1], cream, head);
  }
  puff(.044, [0,-.045,.349], [1.1,.75,.7], dark, head);
  puff(.052, [0,-.133,.28], [1,.7,.45], dark, head);
  puff(.029, [0,-.153,.305], [.8,1.2,.5], pink, head);
  const tail = new THREE.Group();tail.position.set(.08,.6,-.35);root.add(tail);
  for (let i=0;i<10;i++) {
    const a = i / 9 * Math.PI * 1.45;
    puff(.12-i*.004, [Math.sin(a)*.17,.15+Math.cos(a)*.17,-.09-i*.009], [1.1,1,1.1], i<5?lightFur:cream, tail);
  }
  const collar = new THREE.Mesh(new THREE.TorusGeometry(.23,.025,8,32), new THREE.MeshStandardMaterial({color:'#75825c',roughness:.85}));
  collar.rotation.x=Math.PI/2;collar.position.set(0,.73,.11);root.add(collar);
  puff(.04, [0,.7,.345], [.8,1,.3], new THREE.MeshStandardMaterial({color:'#b99a54',metalness:.5,roughness:.45}));
  // A few asymmetric tufts keep the body from reading as a smooth toy sphere.
  for (let i=0;i<10;i++) {
    const a=i/10*Math.PI*2;
    puff(.09,[Math.cos(a)*.28,.4+(i%3)*.05,-.08+Math.sin(a)*.31],[1,.9,1],i%2?fur:lightFur);
  }
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
