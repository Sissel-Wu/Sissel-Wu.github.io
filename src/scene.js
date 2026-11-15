import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { VIEWS, YAW_LIMITS, clampYaw, viewYaw, pointerYaw, smoothYaw, fitRightYaw } from './navigation.js';
import { createDog } from './dog.js';
import { createPlant } from './plant.js';

export function createRoom(canvas, { onOpen, onReady, onViewChange }) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ded7c5');
  scene.fog = new THREE.Fog('#ded7c5', 19, 37);
  const camera = new THREE.PerspectiveCamera(49, 1, .1, 70);
  // Camera position is fixed; only its horizontal look direction changes.
  camera.position.set(0, 2.9, 7.4);
  let view = 'living', yaw = VIEWS.living, targetYaw = yaw, follow = !reducedMotion, dragging = false;
  let startX = 0, startYaw = 0, moved = false, lastTime = 0, raf = 0, disposed = false, renderNeeded = true;
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const clickables = [], anchors = new Map(), ownedTextures = [];
  const hotspotRoot = document.querySelector('#hotspots');
  const surface = document.querySelector('#app');
  let yawLimits = [...YAW_LIMITS], lastShadowUpdate = 0;
  const materials = {};
  const mat = (name, color, roughness = .8, metalness = 0) => materials[name] ||= new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const plaster = mat('plaster', '#ddd7c5'), sideWall = mat('sideWall', '#d7d3bd');
  const wood = mat('wood', '#a27b4e'), darkWood = mat('darkWood', '#735436');
  const cream = mat('cream', '#e5dbc1'), green = mat('green', '#717c52'), dark = mat('dark', '#282e28');
  const black = mat('black', '#1c231f', .5), clay = mat('clay', '#b87555');
  const linen = mat('linen', '#bdbb9b'), brass = mat('brass', '#b49a5d', .4, .55);
  const plantModel = createPlant({ potMaterial: cream, soilMaterial: darkWood });

  function box(w,h,d,x,y,z,material=wood,radius=0,parent=scene) {
    const geometry = radius ? new RoundedBoxGeometry(w,h,d,3,radius) : new THREE.BoxGeometry(w,h,d);
    const mesh = new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function cylinder(rt,rb,h,x,y,z,material=wood,parent=scene,segments=32) {
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,segments),material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  // Build supports between actual contact points, so their ends meet the furniture.
  function support(from,to,bottomRadius,topRadius,material,parent=scene) {
    const start=new THREE.Vector3(...from),end=new THREE.Vector3(...to);
    const midpoint=start.clone().add(end).multiplyScalar(.5);
    const mesh=cylinder(topRadius,bottomRadius,start.distanceTo(end),...midpoint.toArray(),material,parent,16);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());
    return mesh;
  }
  function sphere(r,x,y,z,material,parent=scene,scale) {
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,24,16),material);mesh.position.set(x,y,z);if(scale)mesh.scale.set(...scale);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function texture(draw,w=1024,h=512) {
    const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;ownedTextures.push(tex);return tex;
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
    button.setAttribute('aria-label',id==='dog'?'和博美犬团子互动':`打开${label}`);hotspotRoot.append(button);
    anchors.set(id,{position:new THREE.Vector3(...position),button});
  }
  function plant(x,y,z,size=1,parent=scene) {
    const model=plantModel.clone();
    model.position.set(x,y,z);model.scale.setScalar(size);
    parent.add(model);
    return model;
  }
  function books(x,y,z,count=5,scale=1,parent=scene) {
    const colors=['#75816a','#c9b58c','#986b50','#d8cfb6','#788b8b','#5a6250'];
    for(let i=0;i<count;i++) {const h=(.36+(i%3)*.07)*scale;const b=box(.1*scale,h,.3*scale,x+i*.115*scale,y+h/2,z,mat('book'+i%6,colors[i%6]),.008,parent);b.rotation.z=i===0?-.13:0;box(.104*scale,.014*scale,.006,x+i*.115*scale,y+h*.22,z+.154*scale,cream,0,parent);}
  }

  scene.add(new THREE.HemisphereLight('#fff5de','#8e957a',2.1));
  const sunlight=new THREE.DirectionalLight('#ffe1ac',3.3);sunlight.position.set(6,8,1);sunlight.castShadow=true;sunlight.shadow.mapSize.set(2048,2048);sunlight.shadow.camera.left=-10;sunlight.shadow.camera.right=10;sunlight.shadow.camera.top=9;sunlight.shadow.camera.bottom=-8;sunlight.shadow.normalBias=.035;sunlight.shadow.bias=-.00015;sunlight.shadow.radius=4;scene.add(sunlight);
  const fill=new THREE.DirectionalLight('#e4f0e1',1.2);fill.position.set(-5,4,6);scene.add(fill);
  const warm=new THREE.PointLight('#ffd399',15,7,2);warm.position.set(-4,2.5,-2.3);scene.add(warm);

  // Architecture: an open, continuous room with a living area and an adjacent desk.
  box(15,.2,18,0,-.12,3,mat('floor','#c4aa7d'));
  const floorTexture=texture((ctx,w,h)=>{
    ctx.fillStyle='#c8ae85';ctx.fillRect(0,0,w,h);
    for(let row=0;row<8;row++){
      ctx.fillStyle=['#bda078','#c7ad86','#ceb58e','#c4a980'][row%4];ctx.fillRect(0,row*h/8,w,h/8-2);
      ctx.strokeStyle='#8f795222';ctx.lineWidth=1;
      for(let k=0;k<10;k++){const yy=row*h/8+5+k*5;ctx.beginPath();ctx.moveTo(0,yy);ctx.bezierCurveTo(w*.3,yy-2,w*.6,yy+4,w,yy);ctx.stroke();}
      ctx.fillStyle='#8d765040';const offset=row%2?w*.35:w*.7;ctx.fillRect(offset,row*h/8,1,h/8);
    }
  });floorTexture.wrapS=floorTexture.wrapT=THREE.RepeatWrapping;floorTexture.repeat.set(3,4);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(15,18),new THREE.MeshStandardMaterial({map:floorTexture,roughness:.83}));floor.rotation.x=-Math.PI/2;floor.position.set(0,-.012,3);floor.receiveShadow=true;scene.add(floor);
  box(15,6,.18,0,2.99,-4.5,plaster);
  box(.18,6,17,-7.45,2.99,3.9,plaster);
  box(.18,6,17,7.45,2.99,3.9,sideWall);
  box(15,.13,.08,0,.07,-4.35,wood);
  box(.08,.13,17,7.32,.07,3.9,wood);
  // Soft sunlight shapes across the floor.
  const patchMat=new THREE.MeshBasicMaterial({color:'#ffe6af',transparent:true,opacity:.16,depthWrite:false});
  for(let i=0;i<3;i++){const patch=new THREE.Mesh(new THREE.PlaneGeometry(.87,3.8),patchMat);patch.rotation.x=-Math.PI/2;patch.rotation.z=-.55;patch.position.set(2.3+i*1.15,.005,-.8);scene.add(patch);}

  // A framed landscape window, including deep reveals and linen curtains.
  const windowView=texture((ctx,w,h)=>{
    const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#c7d9cf');g.addColorStop(.55,'#e1e4ca');g.addColorStop(1,'#829178');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#f7e9b8';ctx.beginPath();ctx.arc(w*.72,h*.25,45,0,Math.PI*2);ctx.fill();
    ['#b3c0a3','#91a78c','#6f8b75'].forEach((color,i)=>{ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,h);for(let x=0;x<=w;x+=10)ctx.lineTo(x,h*(.59+i*.11)+Math.sin(x*.009+i*2)*h*.07+Math.sin(x*.022+i)*h*.02);ctx.lineTo(w,h);ctx.fill();});
    for(let i=0;i<12;i++){ctx.fillStyle=i%2?'#687e65':'#7f9471';const x=i*91;ctx.fillRect(x,h*.73,5,h*.3);ctx.beginPath();ctx.ellipse(x,h*.74,22,65,-.2,0,Math.PI*2);ctx.fill();}
  },1024,768);
  box(3.65,2.8,.14,4.55,2.95,-4.3,cream,.025);
  picture(windowView,3.4,2.55,4.55,2.95,-4.2,false);
  box(.07,2.58,.1,4.55,2.95,-4.09,wood);box(3.45,.07,.1,4.55,3.12,-4.08,wood);
  box(3.8,.12,.38,4.55,1.59,-4.04,wood,.025);
  box(4.1,.07,.09,4.5,4.55,-3.98,brass,.02);
  for(const side of [-1,1])for(let i=0;i<7;i++) {const curtain=cylinder(.1,.11,2.95,4.55+side*1.86+i*.045*side,3.02,-3.94,mat('curtain','#dcd8c4'));curtain.scale.z=.6;}

  // Living area: low oak media console, screen, books, and a game console.
  const media=new THREE.Group();scene.add(media);
  box(4.4,.56,.66,-1.25,.51,-3.85,wood,.035,media);
  box(4.5,.1,.76,-1.25,.83,-3.85,wood,.025,media);
  for(const x of [-3.15,.65])for(const z of [-4.05,-3.62])cylinder(.035,.045,.23,x,.12,z,darkWood,media);
  for(let i=0;i<31;i++)box(.055,.4,.025,-3.33+i*.072,.51,-3.502,darkWood,.005,media);
  box(1.68,.41,.02,.05,.51,-3.505,mat('shelfShadow','#6d5539'));
  box(.055,.47,.58,-.68,.51,-3.81,wood);
  books(-.42,.31,-3.6,5,.72);
  box(.45,.08,.37,.51,.35,-3.65,cream,.01);box(.38,.04,.34,.53,.42,-3.65,green,.01);
  const tv=new THREE.Group();scene.add(tv);
  box(3.12,1.78,.12,-1.45,2.04,-3.91,black,.045,tv);
  const screen=texture((ctx,w,h)=>{
    ctx.fillStyle='#263b30';ctx.fillRect(0,0,w,h);
    const grd=ctx.createRadialGradient(w*.72,h*.4,20,w*.7,h*.5,w*.8);grd.addColorStop(0,'#839974');grd.addColorStop(1,'#263e31');ctx.fillStyle=grd;ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#d6d6ac';ctx.beginPath();ctx.arc(w*.75,h*.3,63,0,Math.PI*2);ctx.fill();
    ['#64785c','#465f48','#354e3d'].forEach((color,i)=>{ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,h);for(let x=0;x<=w;x+=12)ctx.lineTo(x,h*(.61+i*.13)+Math.sin(x*.006+i*2)*h*.13);ctx.lineTo(w,h);ctx.fill();});
    ctx.fillStyle='#f2edcf';ctx.font='italic 52px Georgia';ctx.fillText('a little more',70,205);ctx.fillText('wonder.',70,267);ctx.font='13px sans-serif';ctx.fillText('FILMS & EVERYDAY STORIES',73,324);ctx.fillStyle='#e7e5cf99';ctx.font='10px sans-serif';ctx.fillText('SISSEL  /  VOL. 01',73,65);
  });picture(screen,2.96,1.62,-1.45,2.04,-3.838,false,tv);
  for(const x of [-2.45,-.45]){
    const outward=x<-1?-.09:.09;
    support([x+outward,.901,-3.58],[x,1.19,-3.91],.018,.023,black,tv);
    support([x+outward,.901,-4.1],[x,1.19,-3.91],.018,.023,black,tv);
    for(const z of [-3.58,-4.1])box(.095,.025,.09,x+outward,.893,z,black,.009,tv);
  }
  sphere(.012,-.08,1.19,-3.838,mat('led','#bdca8e'),tv);
  interact(tv,'videos',[-1.5,3.17,-3.8],'看点影像','FILMS');
  const consoleGroup=new THREE.Group();scene.add(consoleGroup);
  box(.31,.64,.42,.65,1.19,-3.83,cream,.045,consoleGroup);box(.12,.59,.43,.65,1.19,-3.82,black,.025,consoleGroup);
  box(.018,.45,.01,.715,1.22,-3.595,mat('consoleLed','#9db9bd'),.003,consoleGroup);
  const controller=new THREE.Group();controller.position.set(.05,.94,-3.51);controller.rotation.x=.2;scene.add(controller);
  box(.4,.1,.2,0,0,0,cream,.045,controller);sphere(.09,-.16,-.015,.055,cream,controller,[.7,.7,1]);sphere(.09,.16,-.015,.055,cream,controller,[.7,.7,1]);
  for(const x of [-.095,.06]){const knob=cylinder(.025,.025,.016,x,.06,.035,black,controller,16);knob.rotation.x=.1;}
  box(.06,.015,.02,-.1,.06,-.04,dark,.004,controller);box(.02,.015,.06,-.1,.06,-.04,dark,.004,controller);
  for(let i=0;i<4;i++)sphere(.009,.1+Math.sin(i*Math.PI/2)*.025,.06,-.025+Math.cos(i*Math.PI/2)*.025,clay,controller);
  controller.traverse(m=>{if(m.isMesh){m.userData.content='gaming';clickables.push(m);}});
  interact(consoleGroup,'gaming',[.7,1.78,-3.46],'玩乐时间','PLAY');

  // Sofa: softly rounded sage upholstery, separate cushions and a draped throw.
  const sofa=new THREE.Group();sofa.position.set(-2.5,0,1.25);
  sofa.rotation.y=Math.atan2(-1.45-sofa.position.x,-3.91-sofa.position.z);scene.add(sofa);
  for(const x of [-1.3,1.3])for(const z of [-.46,.46])cylinder(.045,.035,.21,x,.14,z,darkWood,sofa);
  box(3.05,.4,1.3,0,.43,0,green,.12,sofa);box(2.91,.83,.28,0,.96,-.56,green,.11,sofa);
  box(.29,.67,1.33,-1.44,.73,0,green,.12,sofa);box(.29,.67,1.33,1.44,.73,0,green,.12,sofa);
  for(const x of [-.66,.66]){box(1.28,.25,1.02,x,.7,.08,mat('seat','#8b9270'),.1,sofa);const cushion=box(1.28,.61,.22,x,1.06,-.37,mat('back','#87906d'),.1,sofa);cushion.rotation.x=-.12;}
  const pillow1=box(.54,.52,.2,-.97,1.04,.04,cream,.13,sofa);pillow1.rotation.set(-.23,.1,-.22);
  const pillow2=box(.52,.48,.21,.98,1.01,-.03,clay,.12,sofa);pillow2.rotation.set(-.19,-.1,.22);
  box(.61,.025,.94,.67,.844,.14,linen,.012,sofa);box(.61,.52,.035,.67,.6,.62,linen,.02,sofa);
  for(let i=0;i<12;i++)box(.018,.1,.025,.39+i*.05,.3,.635,cream,.003,sofa);
  // Woven rug and low coffee table.
  const rugTex=texture((ctx,w,h)=>{ctx.fillStyle='#dbd1af';ctx.fillRect(0,0,w,h);for(let i=0;i<h;i+=4){ctx.strokeStyle=i%8?'#c0b68e50':'#f6e9c155';ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(w,i);ctx.stroke();}ctx.strokeStyle='#9a9b7555';ctx.lineWidth=7;ctx.strokeRect(35,30,w-70,h-60);ctx.lineWidth=2;ctx.strokeRect(48,43,w-96,h-86);},1024,768);
  const rug=new THREE.Mesh(new THREE.PlaneGeometry(4.4,4.65),new THREE.MeshStandardMaterial({map:rugTex,roughness:1}));rug.rotation.x=-Math.PI/2;rug.rotation.z=.2;rug.position.set(-2,.013,-.1);rug.receiveShadow=true;scene.add(rug);
  const coffee=new THREE.Group();coffee.position.set(-1.9,0,-1.1);coffee.rotation.y=-.2;scene.add(coffee);
  box(2,.12,1.12,0,.61,0,wood,.18,coffee);for(const x of [-.65,.65]){const leg=box(.12,.55,.65,x,.29,0,darkWood,.025,coffee);leg.rotation.z=x<0?-.1:.1;}
  const book=box(.55,.055,.4,-.3,.7,.08,cream,.008,coffee);book.rotation.y=-.15;const book2=box(.48,.04,.37,-.28,.75,.08,mat('orangeBook','#a96849'),.008,coffee);book2.rotation.y=-.08;
  cylinder(.11,.08,.15,.48,.755,-.12,cream,coffee);cylinder(.089,.089,.006,.48,.833,-.12,darkWood,coffee);
  const handle=new THREE.Mesh(new THREE.TorusGeometry(.05,.012,8,16),cream);handle.position.set(.6,.77,-.12);coffee.add(handle);
  cylinder(.16,.16,.02,.48,.68,-.12,linen,coffee);

  // A little roommate in the open living area, with a linen mat and a toy ball.
  const dog = createDog({ reducedMotion });scene.add(dog.root);
  const dogMat = cylinder(.67,.67,.025,.15,.015,.55,linen);dogMat.scale.z=.86;
  sphere(.11,.78,.115,.82,clay);
  interact(dog.root,'dog',[.15,1.65,.55],'团子 · 摸摸头','HELLO');

  // Gallery print, tall plant, standing reading lamp.
  const poster=texture((ctx,w,h)=>{ctx.fillStyle='#e8dfca';ctx.fillRect(0,0,w,h);ctx.fillStyle='#ab6546';ctx.beginPath();ctx.arc(w*.5,h*.35,w*.26,Math.PI,0);ctx.lineTo(w*.76,h*.8);ctx.lineTo(w*.24,h*.8);ctx.fill();ctx.fillStyle='#c5b995';ctx.beginPath();ctx.arc(w*.6,h*.54,w*.18,0,Math.PI*2);ctx.fill();ctx.fillStyle='#4e6249';ctx.beginPath();ctx.ellipse(w*.3,h*.65,w*.16,h*.28,-.5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#6d725d';ctx.font='17px Georgia';ctx.fillText('THE ART OF SLOW LIVING',w*.17,h*.93);},512,680);
  picture(poster,1.02,1.34,-4.65,2.8,-4.34);
  plant(-5.7,.05,-2.9,2.05);
  cylinder(.3,.34,.055,-3.8,.03,-2.65,dark);cylinder(.025,.025,2.52,-3.8,1.28,-2.65,brass);
  cylinder(.29,.5,.48,-3.8,2.55,-2.65,cream);sphere(.11,-3.8,2.3,-2.65,mat('lampBulb','#ffedb4'));

  // Work area: desk, chair, computer, keyboard, camera and shelf.
  const desk=new THREE.Group();scene.add(desk);
  box(3.25,.12,1.1,3.82,1.15,-3.1,wood,.035,desk);
  for(const x of [2.4,5.24])for(const z of [-3.51,-2.69]){const leg=box(.075,1.1,.075,x,.56,z,darkWood,.01,desk);leg.rotation.z=x<3?-.07:.07;}
  box(2.84,.15,.07,3.82,.92,-3.5,darkWood,.01,desk);
  box(.72,.17,.68,4.79,.99,-3.1,wood,.02,desk);box(.16,.025,.025,4.79,.98,-2.75,brass,.006,desk);
  const computer=new THREE.Group();scene.add(computer);
  box(1.37,.9,.065,3.45,1.91,-3.29,black,.03,computer);
  const monitorTex=texture((ctx,w,h)=>{
    ctx.fillStyle='#28352f';ctx.fillRect(0,0,w,h);ctx.fillStyle='#35463b';ctx.fillRect(0,0,w*.2,h);ctx.fillStyle='#738466';ctx.fillRect(0,0,w,30);
    ctx.fillStyle='#bdcbb2';ctx.font='11px monospace';['EXPLORER','about.md','research/','notes/','ideas.txt'].forEach((s,i)=>ctx.fillText(s,15,70+i*28));
    ctx.fillStyle='#ede6cb';ctx.font='26px monospace';ctx.fillText('Hello, world.',w*.25,115);ctx.fillStyle='#95ae8b';ctx.font='14px monospace';ctx.fillText('I am Sissel.',w*.25,152);ctx.fillStyle='#bbc5ae';ctx.font='11px monospace';ctx.fillText('// Always a work in progress.',w*.25,198);
    for(let i=0;i<7;i++){ctx.fillStyle=['#9aa987','#c2ac85','#7d998c'][i%3];ctx.fillRect(w*.25+(i%3)*12,235+i*21,90+(i*47)%180,5);}
  },768,512);picture(monitorTex,1.28,.8,3.45,1.91,-3.246,false,computer);
  box(.09,.28,.09,3.45,1.34,-3.3,black,.01,computer);box(.46,.035,.3,3.45,1.23,-3.27,black,.025,computer);
  const keyboard=box(.82,.04,.26,3.42,1.24,-2.79,cream,.02,computer);
  for(let r=0;r<4;r++)for(let c=0;c<13;c++)box(.047,.013,.043,3.05+c*.059,1.267,-2.88+r*.057,mat('keycap','#c2c7b7'),.004,computer);
  sphere(.075,4.04,1.25,-2.78,cream,computer,[.7,.3,1.2]);
  box(1.36,.008,.5,3.59,1.217,-2.85,mat('deskMat','#7d896c'),.035,desk);
  interact(computer,'work',[3.45,2.56,-3.1],'认识一下','ABOUT');
  const cameraGroup=new THREE.Group();cameraGroup.position.set(4.69,1.42,-2.99);cameraGroup.rotation.y=-.2;scene.add(cameraGroup);
  box(.42,.27,.21,0,0,0,black,.035,cameraGroup);box(.15,.07,.16,.04,.16,0,black,.018,cameraGroup);box(.42,.045,.21,0,.1,0,mat('cameraSilver','#a2a69a',.4,.4),.015,cameraGroup);
  const lens=cylinder(.105,.11,.16,0,0,.17,black,cameraGroup);lens.rotation.x=Math.PI/2;
  const glass=cylinder(.08,.08,.01,0,0,.256,mat('lens','#334f4e',.16,.55),cameraGroup);glass.rotation.x=Math.PI/2;
  cylinder(.035,.035,.02,.15,.14,0,brass,cameraGroup);box(.045,.035,.008,-.135,.075,.112,clay,.006,cameraGroup);
  interact(cameraGroup,'photos',[4.78,1.9,-2.71],'光影收藏','PHOTOS');
  plant(5.13,1.22,-3.36,.6);
  books(2.4,1.22,-3.36,4,.75);
  const mug=cylinder(.075,.065,.17,2.61,1.31,-2.77,clay);cylinder(.06,.06,.006,2.61,1.399,-2.77,darkWood);
  // Desk chair.
  const chair=new THREE.Group();chair.position.set(3.53,0,-1.59);chair.rotation.y=-.18;scene.add(chair);
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
  const bookcase=new THREE.Group();bookcase.position.set(7.02,0,-2.6);bookcase.rotation.y=-Math.PI/2;scene.add(bookcase);
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
  cylinder(.095,.16,.28,.82,2.305,.015,clay,bookcase);
  cylinder(.075,.095,.12,.82,2.505,.015,clay,bookcase);
  plant(-.84,1.525,.045,.34,bookcase);
  picture(poster,.3,.4,-.85,3.025,.06,true,bookcase);
  const bookplate=texture((ctx,w,h)=>{
    ctx.fillStyle='#e3d8ba';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#5d6e50';ctx.font='24px Georgia';ctx.fillText('THE READING ROOM',36,48);
    ctx.font='10px sans-serif';ctx.fillText('BOOKS  /  FILM  /  MUSIC',38,76);
  },384,104);
  box(.83,.4,.16,.25,1.725,.015,cream,.008,bookcase);
  picture(bookplate,.79,.215,.25,1.81,.105,false,bookcase);
  interact(bookcase,'culture',[6.69,3.57,-3.2],'书影音','CULTURE');
  // Floating shelf and small objects connecting both corners.
  box(1.55,.08,.28,1.1,3.44,-4.22,wood,.01);books(.53,3.49,-4.23,4,.7);plant(1.58,3.48,-4.2,.43);
  const clockGroup=new THREE.Group();clockGroup.position.set(1.25,2.65,-4.29);scene.add(clockGroup);
  const clockBody=cylinder(.22,.22,.04,0,0,0,cream,clockGroup);clockBody.rotation.x=Math.PI/2;
  box(.012,.14,.012,0,.055,.028,dark,.002,clockGroup);const hand=box(.11,.012,.012,.045,0,.029,dark,.002,clockGroup);hand.rotation.z=-.3;
  // A paper pendant, kept high in the architecture.
  cylinder(.008,.008,1.25,-.2,5.3,-.7,dark);sphere(.48,-.2,4.48,-.7,cream,scene,[1,.8,1]);
  for(let i=0;i<9;i++){const angle=(i+1)/10*Math.PI;const torus=new THREE.Mesh(new THREE.TorusGeometry(Math.sin(angle)*.48,.004,6,64),linen);torus.rotation.x=Math.PI/2;torus.position.set(-.2,4.48+Math.cos(angle)*.38,-.7);scene.add(torus);}

  scene.updateMatrixWorld(true);
  const cabinetBounds=new THREE.Box3().setFromObject(bookcase);
  const cabinetCorners=[];
  for(const x of [cabinetBounds.min.x,cabinetBounds.max.x])
    for(const y of [cabinetBounds.min.y,cabinetBounds.max.y])
      for(const z of [cabinetBounds.min.z,cabinetBounds.max.z])cabinetCorners.push(new THREE.Vector3(x,y,z));
  function aim(atYaw){
    camera.lookAt(camera.position.x+Math.sin(atYaw)*10,1.56,camera.position.z-Math.cos(atYaw)*10);
    camera.updateMatrixWorld();
  }
  function resize(){
    renderNeeded=true;
    const w=canvas.clientWidth,h=canvas.clientHeight;
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=w<760?59:49;camera.updateProjectionMatrix();
    yawLimits=[YAW_LIMITS[0],fitRightYaw(atYaw=>{
      aim(atYaw);
      return Math.max(...cabinetCorners.map(point=>point.clone().project(camera).x));
    })];
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
      targetYaw=clampYaw(startYaw-delta/canvas.clientWidth*.95,yawLimits);return;
    }
    if(event.pointerType!=='mouse')return;
    const hit=event.target===canvas?ray(event):null;
    const rect=canvas.getBoundingClientRect();
    // The same screen position always sets the same target, regardless of the
    // element under the cursor. Moving labels cannot feed back into camera motion.
    if(follow)targetYaw=pointerYaw(view,(event.clientX-rect.left)/rect.width*2-1,yawLimits);
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
    if(dogChanged&&(!dog.active||now-lastShadowUpdate>80)){renderer.shadowMap.needsUpdate=true;lastShadowUpdate=now;}
    if(Math.abs(yaw-previousYaw)>.000001||renderNeeded||dogChanged){
      aim(yaw);
      for(const {position,button} of anchors.values()){
        const p=position.clone().project(camera);const x=(p.x*.5+.5)*canvas.clientWidth,y=(-p.y*.5+.5)*canvas.clientHeight;
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
    setFollow(value){follow=value;pauseLook();},
    playDog(action){dog.play(action);renderNeeded=true;renderer.shadowMap.needsUpdate=true;},
    dispose(){
      disposed=true;cancelAnimationFrame(raf);window.removeEventListener('resize',resize);
      surface.removeEventListener('pointermove',pointerMove);
      canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointerup',up);
      canvas.removeEventListener('click',clickCanvas);canvas.removeEventListener('pointercancel',cancel);
      scene.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of [o.material].flat())m.dispose();}});
      ownedTextures.forEach(t=>t.dispose());renderer.dispose();hotspotRoot.replaceChildren();
    },
  };
}
