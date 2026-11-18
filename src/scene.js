import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { blockGeometry, steppedGeometry, pixelMaterial } from './voxel.js';
import { VIEWS, YAW_LIMITS, clampYaw, viewYaw, pointerYaw, smoothYaw } from './navigation.js';
import { createDog } from './dog.js';
import { createPlant } from './plant.js';
import { createMazeGameCover, createPlatformGameCover, createVideoScreen, createTerminalScreen } from './screens.js';
import { createWindowFrame, createWindowWallSections, createPhotoCamera, createGameCases, createRecordPlayer } from './fixtures.js';

const bookColors=['#75816a','#c9b58c','#986b50','#d8cfb6','#788b8b','#5a6250'];

export function createRoom(canvas, { onOpen, onReady, onViewChange }) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ded7c5');
  scene.fog = new THREE.Fog('#ded7c5', 19, 37);
  const room={left:-6.2,right:4.25,front:-4.5,back:4.8};
  const roomWidth=room.right-room.left,roomDepth=room.back-room.front;
  const roomCenterX=(room.left+room.right)/2,roomCenterZ=(room.front+room.back)/2;
  const deskCenterZ=2.37;
  const camera = new THREE.PerspectiveCamera(54, 1, .1, 70);
  // Camera position is fixed; only its horizontal look direction changes.
  camera.position.set(-1.45, 2.7, 2);
  let view = 'living', yaw = VIEWS.living, targetYaw = yaw, dragging = false;
  let startX = 0, startYaw = 0, moved = false, lastTime = 0, raf = 0, disposed = false, renderNeeded = true;
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const clickables = [], anchors = new Map(), ownedTextures = [];
  const hotspotRoot = document.querySelector('#hotspots');
  const surface = document.querySelector('#app');
  const yawLimits = YAW_LIMITS;
  let lastShadowUpdate = 0;
  const materials = {};
  const mat = (name, color) => materials[name] ||= pixelMaterial(color,
    /wood|floor|shelf/i.test(name) ? 'wood' : /plaster|sideWall/.test(name) ? 'brick' :
    /green|seat|back|linen|cream|curtain/.test(name) ? 'fabric' : 'stone');
  const plaster = mat('plaster', '#ddd7c5'), sideWall = mat('sideWall', '#d7d3bd');
  const wood = mat('wood', '#a27b4e'), darkWood = mat('darkWood', '#735436');
  const cream = mat('cream', '#e5dbc1'), green = mat('green', '#717c52'), dark = mat('dark', '#282e28');
  const black = mat('black', '#1c231f', .5), clay = mat('clay', '#b87555');
  const linen = mat('linen', '#bdbb9b'), brass = mat('brass', '#b49a5d', .4, .55);
  const plantModels = new Map();

  function box(w,h,d,x,y,z,material=wood,_radius=0,parent=scene) {
    const geometry = blockGeometry(w,h,d);
    const mesh = new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function column(rt,rb,h,x,y,z,material=wood,parent=scene,_segments=32) {
    const mesh=new THREE.Mesh(steppedGeometry(rt,rb,h),material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  // Square supports connect the same contact points as the original furniture.
  function support(from,to,bottomRadius,topRadius,material,parent=scene) {
    const start=new THREE.Vector3(...from),end=new THREE.Vector3(...to);
    const midpoint=start.clone().add(end).multiplyScalar(.5);
    const mesh=column(topRadius,bottomRadius,start.distanceTo(end),...midpoint.toArray(),material,parent,16);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());
    return mesh;
  }
  function cube(r,x,y,z,material,parent=scene,scale) {
    const mesh=new THREE.Mesh(blockGeometry(r*1.6,r*1.6,r*1.6),material);mesh.position.set(x,y,z);if(scale)mesh.scale.set(...scale);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function texture(draw,w=1024,h=512) {
    const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=tex.minFilter=THREE.NearestFilter;tex.generateMipmaps=false;ownedTextures.push(tex);return tex;
  }
  function picture(tex,w,h,x,y,z,frame=true,parent=scene) {
    if(frame)box(w+.13,h+.13,.07,x,y,z-.04,darkWood,.015,parent);
    const material=new THREE.MeshBasicMaterial({map:tex});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),material);mesh.position.set(x,y,z+.01);parent.add(mesh);return mesh;
  }
  function interact(group,id,position,label,english) {
    group.traverse(mesh=>{if(mesh.isMesh){mesh.userData.content=id;clickables.push(mesh);}});
    const button=document.createElement('button');button.className='hotspot';button.dataset.open=id;
    button.innerHTML=`<span class="hotspot-dot">+</span><span>${label}</span><em>${english}</em>`;
    button.setAttribute('aria-label',id==='dog'?'和博美犬导弹玩一下':`打开${label}`);hotspotRoot.append(button);
    anchors.set(id,{position:new THREE.Vector3(...position),parent:group.parent,button});
  }
  function plant(x,y,z,size=1,parent=scene,variant='broadleaf') {
    if(!plantModels.has(variant))plantModels.set(variant,createPlant({
      variant, potMaterial: mat('pot-'+variant, {christmas:'#995e42',broadleaf:'#c1a17a',cactus:'#b66c49',trailing:'#d9d0ad',flowers:'#74918a'}[variant]), soilMaterial: darkWood,
    }));
    const model=plantModels.get(variant).clone();
    model.position.set(x,y,z);model.scale.setScalar(size);
    parent.add(model);
    return model;
  }
  function books(x,y,z,count=5,scale=1,parent=scene,colors=bookColors) {
    for(let i=0;i<count;i++) {
      const h=(.36+(i%3)*.07)*scale, offset=x+i*.115*scale;
      const color=colors[i%colors.length];
      const b=box(.1*scale,h,.3*scale,offset,y+h/2,z,mat('book'+color,color),.008,parent);
      b.rotation.z=i===0?-.13:0;
      box(.104*scale,.014*scale,.006,offset,y+h*.22,z+.154*scale,cream,0,parent);
    }
  }

  scene.add(new THREE.HemisphereLight('#fff5de','#8e957a',2.1));
  const sunlight=new THREE.DirectionalLight('#ffe1ac',3.3);sunlight.position.set(6,8,1);sunlight.castShadow=true;sunlight.shadow.mapSize.set(2048,2048);sunlight.shadow.camera.left=-10;sunlight.shadow.camera.right=10;sunlight.shadow.camera.top=9;sunlight.shadow.camera.bottom=-8;sunlight.shadow.normalBias=.035;sunlight.shadow.bias=-.00015;sunlight.shadow.radius=4;scene.add(sunlight);
  const fill=new THREE.DirectionalLight('#e4f0e1',1.2);fill.position.set(-5,4,6);scene.add(fill);

  // A compact room: TV on the front wall, desk directly below the side window.
  box(roomWidth,.2,roomDepth,roomCenterX,-.12,roomCenterZ,mat('floor','#c4aa7d'));
  const floorMaterial=mat('floorBoards','#b99560');
  const floorTexture=floorMaterial.map;floorTexture.repeat.set(roomWidth,roomDepth);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(roomWidth,roomDepth),new THREE.MeshStandardMaterial({map:floorTexture,roughness:.83}));floor.rotation.x=-Math.PI/2;floor.position.set(roomCenterX,-.012,roomCenterZ);floor.receiveShadow=true;scene.add(floor);
  box(roomWidth,6,.18,roomCenterX,2.99,room.front,plaster);
  box(roomWidth,6,.18,roomCenterX,2.99,room.back,plaster);
  box(.18,6,roomDepth,room.left,2.99,roomCenterZ,plaster);
  box(roomWidth,.13,.08,roomCenterX,.07,room.front+.15,wood);
  box(.08,.13,roomDepth,room.right-.13,.07,roomCenterZ,wood);
  box(roomWidth,.13,.08,roomCenterX,.07,room.back-.15,wood);
  const windowWall=new THREE.Group();windowWall.position.set(room.right,0,deskCenterZ);windowWall.rotation.y=-Math.PI/2;scene.add(windowWall);
  windowWall.add(createWindowWallSections(sideWall,room.front-deskCenterZ,room.back-deskCenterZ));
  // Quiet sky with generous empty space; the frame has a consistent reveal.
  const windowView=texture((ctx,w,h)=>{
    ctx.fillStyle='#b9d5d6';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#e9eddf';ctx.fillRect(12,11,20,3);ctx.fillRect(18,8,9,3);
    ctx.fillRect(66,20,17,3);ctx.fillRect(72,17,8,3);
    ctx.fillStyle='#9eafa0';
    for(const [x,y,width] of [[0,54,24],[24,51,24],[48,53,24],[72,50,24]])ctx.fillRect(x,y,width,h-y);
    ctx.fillStyle='#8da18c';ctx.fillRect(0,62,w,10);
  },96,72);
  picture(windowView,3.7,2.8,0,2.98,-.07,false,windowWall);
  const windowFrame=mat('windowWood','#b6956c');
  windowWall.add(createWindowFrame(windowFrame));
  box(4.34,.055,.065,0,4.57,.42,darkWood,0,windowWall);
  const curtainColors=['#426d73','#638a8d'];
  for(const side of [-1,1])for(let i=0;i<4;i++) {
    box(.105,2.85,.07,side*(1.84+i*.105),3.08,.41-(i%2)*.035,mat('curtain'+i%2,curtainColors[i%2]),0,windowWall);
  }
  plant(1.13,1.54,.31,.68,windowWall,'cactus');

  // Living area: low oak media cabinet with an open bay for games.
  const media=new THREE.Group();scene.add(media);
  box(4.4,.08,.66,-1.25,.27,-3.85,wood,.01,media);
  box(2.75,.47,.66,-2.075,.545,-3.85,wood,.01,media);
  box(.08,.47,.66,.91,.545,-3.85,wood,.01,media);
  box(1.57,.47,.08,.085,.545,-4.14,darkWood,.01,media);
  box(4.5,.1,.76,-1.25,.83,-3.85,wood,.025,media);
  for(const x of [-3.15,.65])for(const z of [-4.05,-3.62])column(.035,.045,.23,x,.12,z,darkWood,media);
  for(let i=0;i<36;i++)box(.055,.4,.025,-3.33+i*.072,.51,-3.509,darkWood,.005,media);
  const gameCovers=[createMazeGameCover(),createPlatformGameCover()];ownedTextures.push(...gameCovers);
  const gameCases=createGameCases({
    plastic:mat('casePlastic','#303a43'), covers:gameCovers, label:cream,
    sleeves:[mat('caseOchre','#b78950'),mat('caseRust','#a75845'),mat('caseTeal','#4a8084')],
  });
  gameCases.position.set(.085,.31,-3.52);media.add(gameCases);
  const tv=new THREE.Group();scene.add(tv);
  box(3.12,1.78,.12,-1.45,2.04,-3.91,black,.045,tv);
  const screen=createVideoScreen();ownedTextures.push(screen);
  picture(screen,2.96,1.62,-1.45,2.04,-3.838,false,tv);
  for(const x of [-2.45,-.45]){
    const outward=x<-1?-.09:.09;
    support([x+outward,.901,-3.58],[x,1.19,-3.91],.018,.023,black,tv);
    support([x+outward,.901,-4.1],[x,1.19,-3.91],.018,.023,black,tv);
    for(const z of [-3.58,-4.1])box(.095,.025,.09,x+outward,.893,z,black,.009,tv);
  }
  cube(.012,-.08,1.19,-3.838,mat('led','#bdca8e'),tv);
  interact(tv,'videos',[-1.5,3.17,-3.8],'看点影像','FILMS');
  const consoleGroup=new THREE.Group();scene.add(consoleGroup);
  box(.31,.64,.42,.65,1.19,-3.83,cream,.045,consoleGroup);box(.12,.59,.43,.65,1.19,-3.82,black,.025,consoleGroup);
  box(.018,.45,.01,.715,1.22,-3.595,mat('consoleLed','#9db9bd'),.003,consoleGroup);
  const controller=new THREE.Group();controller.position.set(.05,.94,-3.51);controller.rotation.x=.2;scene.add(controller);
  box(.4,.1,.2,0,0,0,cream,.045,controller);cube(.09,-.16,-.015,.055,cream,controller,[.7,.7,1]);cube(.09,.16,-.015,.055,cream,controller,[.7,.7,1]);
  for(const x of [-.095,.06]){const knob=column(.025,.025,.016,x,.06,.035,black,controller,16);knob.rotation.x=.1;}
  box(.06,.015,.02,-.1,.06,-.04,dark,.004,controller);box(.02,.015,.06,-.1,.06,-.04,dark,.004,controller);
  for(let i=0;i<4;i++)cube(.009,.1+Math.sin(i*Math.PI/2)*.025,.06,-.025+Math.cos(i*Math.PI/2)*.025,clay,controller);
  controller.traverse(m=>{if(m.isMesh){m.userData.content='gaming';clickables.push(m);}});
  interact(consoleGroup,'gaming',[.7,1.78,-3.46],'玩乐时间','PLAY');

  // Block-built sage sofa, square cushions and a pixel-weave throw.
  const sofa=new THREE.Group();sofa.position.set(-4.3,0,-.6);sofa.scale.setScalar(.85);
  sofa.rotation.y=Math.atan2(-1.45-sofa.position.x,-3.91-sofa.position.z);scene.add(sofa);
  for(const x of [-1.3,1.3])for(const z of [-.46,.46])column(.045,.035,.21,x,.14,z,darkWood,sofa);
  box(3.05,.4,1.3,0,.43,0,green,.12,sofa);box(2.91,.83,.28,0,.96,-.56,green,.11,sofa);
  box(.29,.67,1.33,-1.44,.73,0,green,.12,sofa);box(.29,.67,1.33,1.44,.73,0,green,.12,sofa);
  for(const x of [-.66,.66]){box(1.28,.25,1.02,x,.7,.08,mat('seat','#8b9270'),.1,sofa);const cushion=box(1.28,.61,.22,x,1.06,-.37,mat('back','#87906d'),.1,sofa);cushion.rotation.x=-.12;}
  const pillow1=box(.54,.52,.2,-.97,1.04,.04,cream,.13,sofa);pillow1.rotation.set(-.23,.1,-.22);
  const pillow2=box(.52,.48,.21,.98,1.01,-.03,clay,.12,sofa);pillow2.rotation.set(-.19,-.1,.22);
  box(.61,.025,.94,.67,.844,.14,linen,.012,sofa);box(.61,.52,.035,.67,.6,.62,linen,.02,sofa);
  for(let i=0;i<12;i++)box(.018,.1,.025,.39+i*.05,.3,.635,cream,.003,sofa);
  // Woven rug and low coffee table.
  const rugTex=texture((ctx,w,h)=>{
    ctx.fillStyle='#d3c594';ctx.fillRect(0,0,w,h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){ctx.fillStyle=(x+y)%2?'#dbcea3':'#ccbe8e';ctx.fillRect(x,y,1,1);}
    ctx.strokeStyle='#77835b';ctx.lineWidth=2;ctx.strokeRect(3,3,w-6,h-6);
    ctx.strokeStyle='#a47750';ctx.lineWidth=1;ctx.strokeRect(6,6,w-12,h-12);
    ctx.fillStyle='#8a946b';for(let x=10;x<w-8;x+=8){ctx.fillRect(x,9,3,3);ctx.fillRect(x,h-12,3,3);}
  },64,64);
  const rug=new THREE.Mesh(new THREE.PlaneGeometry(4.4,3.9),new THREE.MeshStandardMaterial({map:rugTex,roughness:1}));rug.rotation.x=-Math.PI/2;rug.rotation.z=.2;rug.position.set(-2.5,.013,-1.65);rug.receiveShadow=true;scene.add(rug);
  const coffee=new THREE.Group();coffee.position.set(-2.1,0,-2.05);coffee.scale.setScalar(.85);coffee.rotation.y=-.2;scene.add(coffee);
  box(2,.12,1.12,0,.61,0,wood,.18,coffee);for(const x of [-.65,.65]){const leg=box(.12,.55,.65,x,.29,0,darkWood,.025,coffee);leg.rotation.z=x<0?-.1:.1;}
  const book=box(.55,.055,.4,-.3,.7,.08,cream,.008,coffee);book.rotation.y=-.15;const book2=box(.48,.04,.37,-.28,.75,.08,mat('orangeBook','#a96849'),.008,coffee);book2.rotation.y=-.08;
  column(.11,.08,.15,.48,.755,-.12,cream,coffee);column(.089,.089,.006,.48,.833,-.12,darkWood,coffee);
  box(.085,.025,.025,.605,.82,-.12,cream,0,coffee);box(.025,.1,.025,.635,.77,-.12,cream,0,coffee);box(.085,.025,.025,.605,.72,-.12,cream,0,coffee);
  column(.16,.16,.02,.48,.68,-.12,linen,coffee);

  // A little roommate in the open living area, with a linen mat and a toy ball.
  const middleYaw=(VIEWS.living+VIEWS.desk)/2,dogDistance=5.7;
  const dogPosition=new THREE.Vector3(camera.position.x+Math.sin(middleYaw)*dogDistance,0,
    camera.position.z-Math.cos(middleYaw)*dogDistance);
  const dogArea=new THREE.Group();scene.add(dogArea);
  const dog = createDog({ reducedMotion, facingYaw:-middleYaw });
  // Keep the dog, mat, ball and label together, with its rest pose facing us.
  dogArea.position.copy(dogPosition).sub(dog.root.position);dogArea.add(dog.root);
  const dogMat = column(.67,.67,.025,.15,.015,.55,linen,dogArea);dogMat.scale.z=.86;
  // A stepped sphere, not a single cube: stripe and highlight identify a toy ball.
  const ball=new THREE.Group();ball.name='striped-voxel-ball';ball.position.set(.8,.175,1.1);dogArea.add(ball);
  const ballColors=[mat('ballTeal','#4a8c92'),mat('ballStripe','#efdfad'),mat('ballOrange','#c87948')];
  const cell=.05, ballParts=[[],[],[]];
  for(let x=-3;x<=3;x++)for(let y=-3;y<=3;y++)for(let z=-3;z<=3;z++){
    if(x*x+y*y+z*z>11)continue;
    // Interior cells cannot be seen or cast a separate outer silhouette.
    if([[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].every(([dx,dy,dz])=>(x+dx)**2+(y+dy)**2+(z+dz)**2<=11))continue;
    ballParts[y===0?1:y>0?0:2].push(blockGeometry(cell,cell,cell).translate(x*cell,y*cell,z*cell));
  }
  ballParts.forEach((parts,i)=>{
    const mesh=new THREE.Mesh(mergeGeometries(parts),ballColors[i]);
    parts.forEach(part=>part.dispose());mesh.castShadow=mesh.receiveShadow=true;ball.add(mesh);
  });
  interact(dog.root,'dog',[.15,1.65,.55],'导弹','HELLO');

  const recordPlayer=createRecordPlayer({wood,darkWood,black,
    metal:mat('recordMetal','#8b937f'),label:clay,cloth:linen});
  recordPlayer.position.set(3.05,0,room.front+.55);scene.add(recordPlayer);
  interact(recordPlayer,'music',[recordPlayer.position.x,2.13,recordPlayer.position.z+.1],'放张唱片','MUSIC');

  // Gallery print and a full-height Christmas tree.
  const poster=texture((ctx,w,h)=>{
    // One large sunflower, recognizable at room scale with no tiny lettering.
    ctx.fillStyle='#e6dfc3';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#65834a';ctx.fillRect(18,24,3,28);
    ctx.fillRect(10,35,8,4);ctx.fillRect(7,31,6,4);
    ctx.fillRect(21,42,8,4);ctx.fillRect(26,38,6,4);
    ctx.fillStyle='#dca840';
    [[14,8,12,5],[14,29,12,5],[7,15,5,12],[28,15,5,12],[10,11,5,5],[25,11,5,5],[10,26,5,5],[25,26,5,5]].forEach(r=>ctx.fillRect(...r));
    ctx.fillStyle='#765136';ctx.fillRect(12,13,16,16);
    ctx.fillStyle='#9c7041';ctx.fillRect(15,16,4,4);ctx.fillRect(22,22,3,3);
    ctx.fillStyle='#b89167';ctx.fillRect(5,53,30,2);
  },40,60);
  // The landscape sits beside the tree, above the media console.
  const landscape=texture((ctx,w,h)=>{
    ctx.fillStyle='#beced0';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#f3d596';ctx.fillRect(49,5,8,8);
    ctx.fillStyle='#f2ecda';ctx.fillRect(8,7,15,2);ctx.fillRect(12,5,7,2);
    ctx.fillStyle='#708d88';
    for(let x=0;x<64;x+=4){const y=22-Math.max(0,12-Math.abs(x-22)/2);ctx.fillRect(x,Math.floor(y/2)*2,4,32);}
    ctx.fillStyle='#456b65';
    for(let x=0;x<64;x+=4){const y=25-Math.max(0,12-Math.abs(x-46)/2);ctx.fillRect(x,Math.floor(y/2)*2,4,32);}
    ctx.fillStyle='#87adb1';ctx.fillRect(0,25,w,11);
    ctx.fillStyle='#c4d7cd';ctx.fillRect(36,28,13,1);ctx.fillRect(12,32,17,1);
    ctx.fillStyle='#335344';ctx.fillRect(0,32,8,4);ctx.fillRect(0,29,4,3);ctx.fillRect(56,33,8,3);
  },64,36);
  picture(landscape,1.6,.9,-3.95,3.58,-4.34);
  plant(-4.85,.02,-3.5,1.65,scene,'christmas');

  // Face the right wall, exactly a quarter turn from the TV. Keep desk items
  // in one coordinate system so their geometry and interaction labels move together.
  const workArea=new THREE.Group();scene.add(workArea);
  workArea.rotation.y=-Math.PI/2;
  const deskOrigin=new THREE.Vector3(3.45,0,-3.29);
  workArea.position.copy(new THREE.Vector3(room.right-.7,0,camera.position.z).sub(
    deskOrigin.applyAxisAngle(new THREE.Vector3(0,1,0),-Math.PI/2)
  ));
  const desk=new THREE.Group();workArea.add(desk);
  box(3.25,.12,1.1,3.82,1.15,-3.1,wood,.035,desk);
  for(const x of [2.4,5.24])for(const z of [-3.51,-2.69]){const leg=box(.075,1.1,.075,x,.56,z,darkWood,.01,desk);leg.rotation.z=x<3?-.07:.07;}
  box(2.84,.15,.07,3.82,.92,-3.5,darkWood,.01,desk);
  box(.72,.17,.68,4.79,.99,-3.1,wood,.02,desk);box(.16,.025,.025,4.79,.98,-2.75,brass,.006,desk);
  const computer=new THREE.Group();workArea.add(computer);
  box(1.37,.9,.065,3.45,1.91,-3.29,black,.03,computer);
  const terminal=createTerminalScreen({reducedMotion});ownedTextures.push(terminal.texture);
  picture(terminal.texture,1.28,.8,3.45,1.91,-3.246,false,computer);
  box(.09,.28,.09,3.45,1.34,-3.3,black,.01,computer);box(.46,.035,.3,3.45,1.23,-3.27,black,.025,computer);
  const keyboard=box(.82,.04,.26,3.42,1.24,-2.79,cream,.02,computer);
  for(let r=0;r<4;r++)for(let c=0;c<13;c++)box(.047,.013,.043,3.05+c*.059,1.267,-2.88+r*.057,mat('keycap','#c2c7b7'),.004,computer);
  cube(.075,4.04,1.25,-2.78,cream,computer,[.7,.3,1.2]);
  box(1.36,.008,.5,3.59,1.217,-2.85,mat('deskMat','#7d896c'),.035,desk);
  interact(computer,'work',[3.45,2.56,-3.1],'认识一下','ABOUT');
  const cameraGroup=createPhotoCamera({body:black,trim:mat('cameraSilver','#a2a69a'),
    glass:mat('lens','#334f4e'),shutter:brass,accent:clay});
  cameraGroup.position.set(4.85,1.345,-2.8);cameraGroup.rotation.y=-.2;workArea.add(cameraGroup);
  interact(cameraGroup,'photos',[4.85,1.94,-2.54],'光影收藏','PHOTOS');
  books(2.4,1.22,-3.36,4,.75,workArea);
  column(.075,.065,.17,2.61,1.31,-2.77,clay,workArea);column(.06,.06,.006,2.61,1.399,-2.77,darkWood,workArea);
  // Desk chair.
  const chair=new THREE.Group();chair.position.set(3.53,0,-1.59);chair.rotation.y=-.18;workArea.add(chair);
  box(.85,.12,.78,0,.59,0,linen,.1,chair);box(.86,.66,.09,0,.99,.36,wood,.09,chair);
  box(.74,.43,.075,0,1.02,.296,linen,.06,chair);
  for(const side of [-1,1]){
    for(const front of [-1,1])support([side*.39,.025,front*.35],[side*.31,.57,front*.25],.031,.045,darkWood,chair);
    support([side*.32,.54,.26],[side*.32,1.29,.365],.032,.032,wood,chair);
    box(.065,.06,.68,side*.44,.85,.04,wood,.025,chair);
    support([side*.39,.57,-.23],[side*.44,.85,-.23],.026,.026,wood,chair);
    support([side*.32,.85,.3],[side*.44,.85,.3],.026,.026,wood,chair);
  }

  // Right-wall bookcase, facing into the room. The entire cabinet is clickable.
  const bookcase=new THREE.Group();bookcase.position.set(room.right-.43,0,-1.35);bookcase.rotation.y=-Math.PI/2;scene.add(bookcase);
  const shelfBack=mat('shelfBack','#8c7958');
  box(2.66,3.04,.055,0,1.74,-.235,shelfBack,.01,bookcase);
  for(const x of [-1.34,1.34])box(.095,3.13,.56,x,1.72,0,wood,.018,bookcase);
  for(const y of [.2,.84,1.48,2.12,2.76,3.28])box(2.77,.085,.59,0,y,0,wood,.012,bookcase);
  box(2.55,.15,.43,0,.075,-.035,darkWood,.018,bookcase);
  for(const [x,y] of [[.26,.52],[-.38,1.16],[.4,1.8],[-.4,2.44]])box(.055,.56,.5,x,y,0,wood,.008,bookcase);
  books(-1.15,.885,-.01,5,1.05,bookcase);
  books(.65,1.525,-.01,5,1.05,bookcase);
  books(-1.15,2.165,-.01,5,1.08,bookcase);
  books(-.18,2.805,-.01,6,.85,bookcase);
  books(.6,.245,-.01,5,1.08,bookcase);
  // Alternating horizontal stacks, a ceramic vase, and a displayed art book.
  for(let i=0;i<3;i++){
    box(.58-i*.035,.07,.35,.76,.925+i*.075,.015,i%2?cream:green,.008,bookcase);
    box(.66,.07,.36,-.84,.285+i*.075,.015,i%2?clay:cream,.008,bookcase);
  }
  column(.095,.16,.28,.82,2.305,.015,clay,bookcase);
  column(.075,.095,.12,.82,2.505,.015,clay,bookcase);
  plant(-.84,1.525,.045,.65,bookcase,'trailing');
  picture(poster,.3,.4,-.85,3.025,.06,true,bookcase);
  const bookplate=texture((ctx,w,h)=>{
    ctx.fillStyle='#e3d8ba';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#5d6e50';ctx.font='24px Georgia';ctx.fillText('THE READING ROOM',36,48);
    ctx.font='10px sans-serif';ctx.fillText('BOOKS  /  FILM  /  MUSIC',38,76);
  },384,104);
  box(.83,.4,.16,.25,1.725,.015,cream,.008,bookcase);
  picture(bookplate,.79,.215,.25,1.81,.105,false,bookcase);
  interact(bookcase,'culture',[room.right-.76,3.57,-1.35],'书影音','CULTURE');
  // Floating shelf and small objects connecting both corners.
  box(1.55,.08,.28,1.1,3.44,-4.22,wood,.01);
  const clockShelfColors=bookColors.slice();
  clockShelfColors[3]='#713d57';
  books(.53,3.48,-4.23,6,.7,scene,clockShelfColors);
  plant(1.58,3.48,-4.2,.62,scene,'flowers');
  const clockGroup=new THREE.Group();clockGroup.position.set(1.25,2.65,-4.29);scene.add(clockGroup);
  const clockRim=mat('clockRim','#324e53'),clockFace=mat('clockFace','#f0dfb8');
  box(.54,.54,.07,0,0,0,clockRim,0,clockGroup);
  box(.43,.43,.015,0,0,.043,clockFace,0,clockGroup);
  for(const [x,y,w,h] of [[0,.17,.025,.05],[.17,0,.05,.025],[0,-.17,.025,.05],[-.17,0,.05,.025]])box(w,h,.01,x,y,.056,clockRim,0,clockGroup);
  box(.021,.15,.014,0,.065,.07,dark,0,clockGroup);
  const hand=box(.13,.021,.014,.052,-.015,.071,dark,0,clockGroup);hand.rotation.z=-.3;
  box(.045,.045,.02,0,0,.077,clay,0,clockGroup);
  // Suspended square lantern with an oak frame and luminous pixel panels.
  box(.025,1.25,.025,-.2,5.3,-.7,dark);
  const glow=mat('lanternGlow','#ffe2a0');glow.emissive.set('#e8bd65');glow.emissiveIntensity=.28;
  box(.64,.56,.64,-.2,4.48,-.7,glow);
  for(const y of [4.17,4.79])box(.78,.09,.78,-.2,y,-.7,darkWood);
  for(const x of [-.55,.15])for(const z of [-1.05,-.35])box(.065,.58,.065,x,4.48,z,wood);

  scene.updateMatrixWorld(true);
  function aim(atYaw){
    camera.lookAt(camera.position.x+Math.sin(atYaw)*10,1.56,camera.position.z-Math.cos(atYaw)*10);
    camera.updateMatrixWorld();
  }
  function resize(){
    renderNeeded=true;
    const w=canvas.clientWidth,h=canvas.clientHeight;
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=Math.max(54,THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(27))/camera.aspect)));camera.updateProjectionMatrix();
    yaw=clampYaw(yaw,yawLimits);targetYaw=viewYaw(view,yawLimits);aim(yaw);
  }
  function pauseLook(){targetYaw=yaw;}
  function setView(next){view=next;targetYaw=viewYaw(next,yawLimits);onViewChange(next);}
  function ray(event){
    const rect=canvas.getBoundingClientRect();
    pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);
    return raycaster.intersectObjects(clickables,false)[0];
  }
  function pointerMove(event){
    if(document.querySelector('dialog').open)return;
    if(dragging){
      const delta=event.clientX-startX;moved ||= Math.abs(delta)>6;
      targetYaw=clampYaw(startYaw-delta/canvas.clientWidth*(yawLimits[1]-yawLimits[0]),yawLimits);return;
    }
    if(event.pointerType!=='mouse')return;
    const hit=event.target===canvas?ray(event):null;
    const rect=canvas.getBoundingClientRect();
    // The same screen position always sets the same target, regardless of the
    // element under the cursor. Moving labels cannot feed back into camera motion.
    if(!reducedMotion)targetYaw=pointerYaw(view,(event.clientX-rect.left)/rect.width*2-1,yawLimits);
    canvas.style.cursor=hit?'pointer':'grab';
  }
  function down(event){
    if(event.button!==0)return;
    pauseLook();dragging=true;startX=event.clientX;startYaw=yaw;moved=false;canvas.setPointerCapture(event.pointerId);
  }
  function up(event){
    if(!dragging)return;dragging=false;
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
    if(moved){view=targetYaw>(viewYaw('living',yawLimits)+yawLimits[1])/2?'desk':'living';onViewChange(view);}
  }
  function clickCanvas(event){if(moved)return;const hit=ray(event);if(hit)onOpen(hit.object.userData.content);}
  function cancel(){dragging=false;moved=true;pauseLook();}
  function frame(now){
    if(disposed)return;const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;
    const previousYaw=yaw;
    yaw=reducedMotion?targetYaw:smoothYaw(yaw,targetYaw,dt,yawLimits);
    const dogChanged=dog.update(now);
    const screenChanged=terminal.update(now);
    if(dogChanged&&(!dog.active||now-lastShadowUpdate>80)){renderer.shadowMap.needsUpdate=true;lastShadowUpdate=now;}
    if(Math.abs(yaw-previousYaw)>.000001||renderNeeded||dogChanged||screenChanged){
      aim(yaw);
      for(const {position,parent,button} of anchors.values()){
        const p=parent.localToWorld(position.clone()).project(camera);const x=(p.x*.5+.5)*canvas.clientWidth,y=(-p.y*.5+.5)*canvas.clientHeight;
        button.hidden=p.z>1||p.z<0||x<48||x>canvas.clientWidth-48||y<85||y>canvas.clientHeight-155;
        button.style.left=`${x}px`;button.style.top=`${y}px`;
      }
      renderer.render(scene,camera);renderNeeded=false;
    }
    raf=requestAnimationFrame(frame);
  }
  renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
  resize();window.addEventListener('resize',resize);
  // Listen on the stable outer surface. Crossing a child hotspot is not leaving the room.
  surface.addEventListener('pointermove',pointerMove);
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointerup',up);
  canvas.addEventListener('click',clickCanvas);canvas.addEventListener('pointercancel',cancel);canvas.style.touchAction='none';
  raf=requestAnimationFrame(frame);onReady();
  return {
    setView,
    playDog(centerDog=false){
      if(centerDog)targetYaw=middleYaw;
      return dog.play();
    },
    dispose(){
      disposed=true;cancelAnimationFrame(raf);window.removeEventListener('resize',resize);
      surface.removeEventListener('pointermove',pointerMove);
      canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointerup',up);
      canvas.removeEventListener('click',clickCanvas);canvas.removeEventListener('pointercancel',cancel);
      const textures=new Set(ownedTextures);
      scene.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of [o.material].flat()){if(m.map)textures.add(m.map);m.dispose();}}});
      textures.forEach(t=>t.dispose());renderer.dispose();hotspotRoot.replaceChildren();
    },
  };
}
