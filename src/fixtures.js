import * as THREE from 'three';
import { blockGeometry, steppedGeometry } from './voxel.js';

function addMesh(parent, name, geometry, material, position) {
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name=name;mesh.position.set(...position);
  mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);
  return mesh;
}
function block(parent,name,size,position,material) {
  return addMesh(parent,name,blockGeometry(...size),material,position);
}

// The masonry opening follows the OUTSIDE of the frame, not the glass opening.
// Otherwise its top/bottom reveals share visible planes with the wooden rails.
export const WINDOW_OPENING=Object.freeze({width:3.64,bottom:1.54,top:4.42});

export function createWindowWallSections(material,minX,maxX) {
  const walls=new THREE.Group();walls.name='window-surround';
  const {width,bottom,top}=WINDOW_OPENING,half=width/2;
  block(walls,'wall-left',[-half-minX,6,.18],[(minX-half)/2,2.99,0],material);
  block(walls,'wall-right',[maxX-half,6,.18],[(half+maxX)/2,2.99,0],material);
  block(walls,'wall-below',[width,bottom+.01,.18],[0,(bottom-.01)/2,0],material);
  block(walls,'wall-above',[width,5.99-top,.18],[0,(top+5.99)/2,0],material);
  return walls;
}

export function createWindowFrame(material) {
  const frame=new THREE.Group();frame.name='window-frame';
  const {width,bottom,top}=WINDOW_OPENING;
  for(const side of [-1,1])block(frame,'outer-stile',[.14,top-bottom-.28,.3],
    [side*(width-.14)/2,(bottom+top)/2,.11],material);
  for(const y of [bottom+.07,top-.07])block(frame,'outer-rail',[width,.14,.3],[0,y,.11],material);
  const mullionWidth=.075,railLength=(3.36-mullionWidth)/2;
  block(frame,'center-stile',[mullionWidth,2.6,.15],[0,2.98,.195],material);
  // Butt joints: no duplicate front/back faces at the center crossing.
  for(const side of [-1,1])block(frame,'center-rail',[railLength,.075,.15],
    [side*(mullionWidth+railLength)/2,3.12,.195],material);
  // Keep the sill wholly in front of the .09-deep interior wall face.
  block(frame,'window-sill',[3.86,.12,.52],[0,bottom-.06,.36],material);
  return frame;
}

export function createPhotoCamera({body,trim,glass,shutter,accent}) {
  const camera=new THREE.Group();camera.name='photo-camera';
  // Each band owns a distinct slice of the body. An overlaid trim box would
  // share all four side planes with the body and flicker as the view rotates.
  for(const [name,bottom,top,material] of [
    ['body-lower',-.135,.075,body],
    ['body-trim',.075,.12,trim],
    ['body-upper',.12,.135,body],
  ])block(camera,name,[.42,top-bottom,.21],[0,(bottom+top)/2,0],material);
  block(camera,'viewfinder',[.15,.07,.16],[.04,.16,0],body);
  addMesh(camera,'lens-barrel',steppedGeometry(.105,.11,.16),body,[0,0,.17]).rotation.x=Math.PI/2;
  addMesh(camera,'lens-glass',steppedGeometry(.08,.08,.01),glass,[0,0,.256]).rotation.x=Math.PI/2;
  addMesh(camera,'shutter',steppedGeometry(.035,.035,.02),shutter,[.15,.14,0]);
  block(camera,'accent',[.045,.035,.008],[-.135,.075,.112],accent);
  return camera;
}

export function createRecordPlayer({wood,darkWood,black,metal,label,cloth}) {
  const player=new THREE.Group();player.name='record-player';
  // A small record cabinet, with a speaker and upright sleeves below the deck.
  for(const x of [-.74,.74])for(const z of [-.3,.3])
    block(player,'foot',[.09,.22,.09],[x,.11,z],darkWood);
  for(const x of [-.85,.85])block(player,'cabinet-side',[.1,.77,.8],[x,.665,0],wood);
  for(const y of [.23,1.1])block(player,'cabinet-shelf',[1.8,.1,.85],[0,y,0],wood);
  block(player,'cabinet-back',[1.6,.77,.06],[0,.665,-.37],darkWood);
  block(player,'divider',[.08,.77,.74],[.12,.665,0],wood);
  block(player,'speaker',[.73,.65,.08],[-.36,.65,.3],cloth);
  for(let i=0;i<7;i++)block(player,'speaker-slat',[.035,.65,.025],[-.68+i*.105,.65,.355],darkWood);
  for(let i=0;i<6;i++)block(player,'record-sleeve',[.065,.55+(i%2)*.05,.59],
    [.25+i*.09,.28+(.55+(i%2)*.05)/2,0],i%3===0?label:i%3===1?cloth:darkWood);
  block(player,'plinth',[1.46,.14,.72],[0,1.22,0],darkWood);
  block(player,'deck',[1.38,.025,.65],[0,1.3025,0],black);
  // Open lid and lining are separated in depth, so they never share a face.
  block(player,'lid',[1.46,.52,.05],[0,1.57,-.34],wood);
  block(player,'lid-lining',[1.28,.35,.016],[0,1.57,-.305],cloth);
  block(player,'lid-badge',[.24,.065,.012],[0,1.58,-.287],metal);
  const discCenter=[-.18,1.337,0];
  addMesh(player,'vinyl',new THREE.CylinderGeometry(.285,.285,.032,24),black,discCenter);
  for(const radius of [.14,.2,.25]){
    const groove=addMesh(player,'groove',new THREE.RingGeometry(radius-.003,radius,32),metal,[-.18,1.355,0]);
    groove.rotation.x=-Math.PI/2;
  }
  addMesh(player,'record-label',new THREE.CylinderGeometry(.075,.075,.008,16),label,[-.18,1.358,0]);
  block(player,'spindle',[.018,.035,.018],[-.18,1.378,0],metal);
  block(player,'arm-pivot',[.085,.09,.085],[.43,1.36,-.22],metal);
  const start=new THREE.Vector3(.43,1.415,-.22),end=new THREE.Vector3(.04,1.395,.17);
  const arm=block(player,'tonearm',[.025,start.distanceTo(end),.025],
    start.clone().add(end).multiplyScalar(.5).toArray(),metal);
  arm.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());
  block(player,'stylus',[.065,.045,.09],[.04,1.377,.17],label);
  addMesh(player,'volume-knob',new THREE.CylinderGeometry(.045,.045,.035,12),metal,[.57,1.333,.22]);
  return player;
}
