import * as THREE from 'three';

// Small bitmap lettering stays crisp on the room's low-resolution displays.
const glyphs = {
  A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',
  E:'111100110100111',F:'111100110100100',G:'011100101101011',H:'101101111101101',
  I:'111010010010111',J:'001001001101010',K:'101101110101101',L:'100100100100111',
  M:'101111111101101',N:'101111111111101',O:'010101101101010',P:'110101110100100',
  Q:'010101101111011',R:'110101110101101',S:'011100010001110',T:'111010010010010',
  U:'101101101101111',V:'101101101101010',W:'101101111111101',X:'101101010101101',
  Y:'101101010010010',Z:'111001010100111',0:'111101101101111',1:'010110010010111',
  2:'110001010100111',3:'110001010001110',4:'101101111001001',5:'111100110001110',
  6:'011100111101111',7:'111001010010010',8:'111101111101111',9:'111101111001110',
  '/':'001001010100100','>':'100010001010100','$':'011110010011110',
  '.':'000000000000010','-':'000000111000000',':':'000010000010000',
};
function lettering(ctx, text, x, y, color, scale=1) {
  ctx.fillStyle=color;
  for(const char of text.toUpperCase()) {
    const glyph=glyphs[char];
    if(glyph)for(let i=0;i<15;i++)if(glyph[i]==='1')ctx.fillRect(x+(i%3)*scale,y+Math.floor(i/3)*scale,scale,scale);
    x+=4*scale;
  }
}
function screenCanvas(width,height) {
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;
  return {canvas,ctx:canvas.getContext('2d'),texture};
}

export function createVideoScreen() {
  const {ctx,texture}=screenCanvas(128,72);
  ctx.fillStyle='#203640';ctx.fillRect(0,0,128,72);
  // Pixel rendition of bilibili's little-TV mark: antennae, single frame and face.
  ctx.fillStyle='#69c3df';
  [[15,5,3,3],[18,8,3,3],[36,5,3,3],[33,8,3,3],
    [10,12,34,3],[7,15,3,16],[44,15,3,16],[10,31,34,3]].forEach(r=>ctx.fillRect(...r));
  [[16,19,3,7],[35,19,3,7],[23,25,3,3],[29,25,3,3],[26,28,3,2]].forEach(r=>ctx.fillRect(...r));
  lettering(ctx,'BILIBILI',57,13,'#8bd4e7',2);
  ctx.fillStyle='#6c858c';ctx.fillRect(58,28,21,2);ctx.fillRect(83,28,13,2);ctx.fillRect(100,28,17,2);
  // Three deliberately coarse, low-contrast thumbnails: travel, gaming, everyday life.
  const palettes=[['#95b6bc','#dfc796','#79928b','#547976'],['#8b9ea9','#bcc7b1','#658274','#475d68'],['#bea99a','#dcc7ac','#9c8278','#7c9692']];
  for(let card=0;card<3;card++) {
    const x=7+card*40,y=40,p=palettes[card];
    ctx.fillStyle=p[0];ctx.fillRect(x,y,34,20);
    if(card===0) {
      ctx.fillStyle=p[1];ctx.fillRect(x+24,y+3,6,6);
      ctx.fillStyle=p[2];ctx.fillRect(x,y+11,10,9);ctx.fillRect(x+8,y+7,10,13);ctx.fillRect(x+18,y+13,16,7);
      ctx.fillStyle=p[3];ctx.fillRect(x,y+16,34,4);
    } else if(card===1) {
      ctx.fillStyle=p[1];ctx.fillRect(x+3,y+4,10,3);
      ctx.fillStyle=p[3];ctx.fillRect(x+20,y+6,8,14);ctx.fillRect(x+16,y+11,16,9);
      ctx.fillStyle=p[2];ctx.fillRect(x,y+15,16,5);ctx.fillRect(x+9,y+11,7,4);
    } else {
      ctx.fillStyle=p[1];ctx.fillRect(x+3,y+3,13,11);
      ctx.fillStyle=p[3];ctx.fillRect(x+23,y+4,6,10);ctx.fillRect(x+19,y+7,14,4);
      ctx.fillStyle=p[2];ctx.fillRect(x,y+15,34,5);ctx.fillRect(x+24,y+12,5,5);
    }
    ctx.fillStyle='#314650';ctx.fillRect(x+25,y+16,8,3);
    ctx.fillStyle='#9eb1b4';ctx.fillRect(x,64,25-card*3,2);
    ctx.fillStyle='#607b83';ctx.fillRect(x,68,15,1);
  }
  texture.needsUpdate=true;
  return texture;
}

export const TERMINAL_LINES = [
  ['$ NODE STUDIO.JS','command'],['LOADING IDEAS...','muted'],['OK / READY','success'],
  ['$ NPM RUN BUILD','command'],['> COMPILE MODULES','muted'],['OK / BUNDLE READY','success'],
  ['$ NPM TEST','command'],['> RUNNING TESTS','muted'],['PASS / CAMERA','success'],
  ['PASS / INTERACTIONS','success'],['OK / ALL PASSED','success'],['$ NODE NOTES.JS','command'],
  ['> COLLECTING IDEAS','muted'],['> SAVE DRAFT','muted'],['OK / SAVED','success'],
];

// Sample only changes while a line moves. Long pauses never replay missed scrolls.
export function createTerminalTimeline({reducedMotion=false}={}) {
  let index=0,offset=0,nextAt=null,started=null;
  return {
    sample(now) {
      if(reducedMotion)return null;
      if(nextAt===null){nextAt=now+6000;return null;}
      if(now<nextAt)return null;
      if(started===null)started=now;
      const progress=Math.min(1,Math.max(0,(now-started)/1000));
      const nextOffset=Math.floor(progress*9);
      if(progress===1){index=(index+1)%TERMINAL_LINES.length;offset=0;started=null;nextAt=now+5000+(index%3)*1000;return {index,offset};}
      if(nextOffset===offset)return null;
      offset=nextOffset;return {index,offset};
    },
  };
}

export function createTerminalScreen(options) {
  const {ctx,texture}=screenCanvas(112,70),timeline=createTerminalTimeline(options);
  function draw({index=0,offset=0}={}) {
    ctx.fillStyle='#182e2b';ctx.fillRect(0,0,112,70);
    ctx.fillStyle='#3d5b51';ctx.fillRect(0,0,112,9);
    lettering(ctx,'SISSEL / TERM',5,2,'#d5dfbc');
    ctx.fillStyle='#9eb78a';ctx.fillRect(100,3,3,3);ctx.fillRect(105,3,3,3);
    ctx.save();ctx.beginPath();ctx.rect(0,12,112,54);ctx.clip();
    for(let row=0;row<7;row++) {
      const [text,kind]=TERMINAL_LINES[(index+row)%TERMINAL_LINES.length];
      const color={command:'#ecce91',muted:'#8fa89b',success:'#b4cc99'}[kind];
      lettering(ctx,text,5,13+row*9-offset,color);
    }
    ctx.restore();texture.needsUpdate=true;
  }
  draw();
  return {texture,update(now){const state=timeline.sample(now);if(!state)return false;draw(state);return true;}};
}
