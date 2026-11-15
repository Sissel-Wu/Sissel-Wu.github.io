import './style.css';
import { createRoom } from './scene.js';
import { profile, publications, posts, videos, photos } from './data.js';

const dialog=document.querySelector('#content-dialog');
const content=document.querySelector('#panel-content');
const kicker=document.querySelector('#panel-kicker');
let room, lastFocus, currentPanel, reelCleanup=()=>{}, photoIndex=0;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
let following=!reducedMotion;
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const heading=(eyebrow,title,description)=>`<div class="panel-heading"><div class="eyebrow">${eyebrow}</div><h2 id="panel-title">${title}</h2><p>${description}</p><span class="sample-label">MVP · 示例内容，等待真实故事入住</span></div>`;
const postList=category=>posts.filter(p=>p.category===category).map(p=>`<button class="post" data-post="${p.id}"><div><span class="post-tag">${p.tag}</span><h3>${p.title}</h3><small>${p.date} &nbsp; / &nbsp; ${p.read} read</small></div><span>↗</span></button>`).join('');
function renderPanel(type){
  reelCleanup();reelCleanup=()=>{};currentPanel=type;dialog.scrollTop=0;
  const titles={videos:'01 / THE TELEVISION',gaming:'02 / THE GAME CONSOLE',work:'03 / THE COMPUTER',photos:'04 / THE CAMERA',index:'MAKE YOURSELF AT HOME'};
  kicker.textContent=titles[type];
  if(type==='videos')content.innerHTML=heading('MOVING PICTURES','一些会动的记忆。','用镜头收集日常，也给平凡的时刻多一点时间。')+videos.map((v,i)=>`<button class="video-card" data-video="${i}"><div class="video-image"><img src="${v.image}" alt="${v.title}的示例封面" loading="lazy"><span class="play">▶</span><span class="duration">${v.time}</span></div><div class="card-meta"><h3>${v.title}</h3><span>${v.tag}</span></div><p>${v.subtitle}</p></button>`).join('');
  if(type==='gaming')content.innerHTML=heading('PRESS PAUSE. PRESS PLAY.','认真生活，尽情玩。','关于游戏、虚构世界，以及那些不必有用的快乐。')+postList('gaming');
  if(type==='work')content.innerHTML=`<div class="panel-heading"><div class="profile-hero"><div class="avatar" aria-hidden="true">s.</div><div><h2 id="panel-title">${profile.name}</h2><p>${profile.role}</p></div></div><span class="sample-label">以下简介、论文与文章均为演示占位</span></div><p class="bio">${profile.bio}</p><div class="tags">${profile.interests.map(t=>`<span>${t}</span>`).join('')}</div><a class="contact-link" href="https://github.com/Sissel-Wu" target="_blank" rel="noreferrer">Find me on GitHub ↗</a><div class="section-title"><h3>Selected publications</h3><span>RESEARCH / 01</span></div>${publications.map(p=>`<details class="publication"><summary><h4>${p.title}</h4><small>${p.authors}<br>${p.venue}</small></summary><p>${p.abstract}</p></details>`).join('')}<div class="section-title"><h3>思考与记录</h3><span>WRITING / 02</span></div>${postList('work')}`;
  if(type==='photos')content.innerHTML=heading('THROUGH THE VIEWFINDER','把瞬间，留在这里。','路过的风景、偶然的光线，和生活里的小小停顿。')+`<div class="photo-grid">${photos.map((p,i)=>`<button class="photo-card" data-photo="${i}" aria-label="查看照片：${p.title}"><img src="${p.src}" alt="${p.title}" loading="lazy"><h3>${p.title}</h3><small>${p.location} &nbsp; / &nbsp; ${p.year}</small></button>`).join('')}</div><p class="bio">照片为 Unsplash 演示素材，不代表作者本人作品。</p>`;
  if(type==='index')content.innerHTML=heading('FOUR OBJECTS. MANY STORIES.','随意看看。','这个房间里的每一件物品，都是一扇小小的门。')+`<div class="directory">${[['videos','01 / TELEVISION','看点影像','视频、旅行与视觉日记'],['gaming','02 / GAME CONSOLE','玩乐时间','游戏体验与生活碎片'],['work','03 / COMPUTER','认识一下','个人简介、论文与研究笔记'],['photos','04 / CAMERA','光影收藏','照片、风景与城市漫步']].map(([id,num,title,desc])=>`<button data-open="${id}"><small>${num}</small><h3>${title} ↗</h3><p>${desc}</p></button>`).join('')}</div>`;
}
function openPanel(type){
  if(!dialog.open){lastFocus=document.activeElement;renderPanel(type);dialog.showModal();document.querySelector('#close-dialog').focus();}else renderPanel(type);
}
function closePanel(){dialog.close();}
dialog.addEventListener('close',()=>{reelCleanup();reelCleanup=()=>{};lastFocus?.focus({preventScroll:true});});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closePanel();}});
document.querySelector('#close-dialog').addEventListener('click',closePanel);
document.querySelector('#index-button').addEventListener('click',()=>openPanel('index'));
function showArticle(id){
  const post=posts.find(p=>p.id===id);if(!post)return;
  content.innerHTML=`<button class="back-button" data-back="${post.category==='gaming'?'gaming':'work'}">← 返回列表</button>`+heading(post.tag,post.title,`${post.date} · ${post.read} read`)+`<article class="article">${post.body.map(p=>`<p>${escapeHTML(p)}</p>`).join('')}</article>`;dialog.scrollTop=0;content.querySelector('.back-button').focus();
}
function showVideo(index){
  const v=videos[index];if(!v)return;
  reelCleanup();
  content.innerHTML=`<button class="back-button" data-back="videos">← 所有影像</button>`+heading(v.tag,v.title,v.subtitle)+`<div class="demo-reel"><img src="${v.image}" alt="${v.title}动态分镜"><div class="reel-title">${v.title}</div></div><div class="reel-controls"><button id="reel-play" aria-label="播放示例分镜">▶ 播放</button><progress max="12" value="0" aria-label="播放进度"></progress><span id="reel-time">00:00 / 00:12</span></div><p class="bio">这是一段 12 秒的动态分镜示例。真正的故事正在路上，先在这片风景里待一会儿。</p>`;
  const reel=content.querySelector('.demo-reel'),play=content.querySelector('#reel-play'),progress=content.querySelector('progress'),time=content.querySelector('#reel-time');
  let elapsed=0,playing=false,last=0,frame;
  const paint=()=>{play.textContent=playing?'Ⅱ 暂停':elapsed>=12?'↻ 重播':'▶ 播放';play.setAttribute('aria-label',playing?'暂停示例分镜':'播放示例分镜');reel.classList.toggle('playing',playing);};
  const tick=now=>{if(playing){elapsed=Math.min(12,elapsed+(now-last)/1000);progress.value=elapsed;time.textContent=`00:${String(Math.floor(elapsed)).padStart(2,'0')} / 00:12`;if(elapsed>=12){playing=false;paint();}}last=now;frame=requestAnimationFrame(tick);};
  play.addEventListener('click',()=>{if(elapsed>=12){elapsed=0;const img=reel.querySelector('img');img.style.animation='none';void img.offsetWidth;img.style.animation='';}playing=!playing;last=performance.now();paint();});
  last=performance.now();frame=requestAnimationFrame(tick);reelCleanup=()=>cancelAnimationFrame(frame);dialog.scrollTop=0;content.querySelector('.back-button').focus();
}
function showPhoto(index){
  photoIndex=(index+photos.length)%photos.length;const p=photos[photoIndex];
  content.innerHTML=`<button class="back-button" data-back="photos">← 返回照片墙</button>`+heading(`${p.location} / ${p.year}`,p.title,`${photoIndex+1} / ${photos.length} · 示例摄影`)+`<div class="photo-view"><img src="${p.src}" alt="${p.title}"></div><div class="photo-controls"><button data-photo-step="-1" aria-label="上一张照片">← 上一张</button><button data-photo-step="1" aria-label="下一张照片">下一张 →</button></div>`;dialog.scrollTop=0;content.querySelector('.back-button').focus();
}
document.addEventListener('click',e=>{
  const button=e.target.closest('button');if(!button)return;
  if(button.dataset.open)openPanel(button.dataset.open);
  if(button.dataset.back)renderPanel(button.dataset.back);
  if(button.dataset.post)showArticle(button.dataset.post);
  if(button.dataset.video!==undefined)showVideo(Number(button.dataset.video));
  if(button.dataset.photo!==undefined)showPhoto(Number(button.dataset.photo));
  if(button.dataset.photoStep)showPhoto(photoIndex+Number(button.dataset.photoStep));
  if(button.dataset.view){room?.setView(button.dataset.view);updateView(button.dataset.view);}
});
document.addEventListener('keydown',e=>{
  if(dialog.open){if(currentPanel==='photos'&&content.querySelector('.photo-view')&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();showPhoto(photoIndex+(e.key==='ArrowRight'?1:-1));}return;}
  if(e.target instanceof HTMLButtonElement||e.target instanceof HTMLAnchorElement)return;
  if(e.key==='ArrowRight')room?.setView('desk');if(e.key==='ArrowLeft')room?.setView('living');
});
function updateView(view){
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));});
  document.querySelector('#view-number').textContent=view==='living'?'01':'02';document.querySelector('#view-title').textContent=view==='living'?'客厅':'书桌';document.querySelector('#view-subtitle').textContent=view==='living'?'THE LIVING ROOM':'THE CREATIVE CORNER';
}
const motionButton=document.querySelector('#motion-button');
function updateMotion(){motionButton.setAttribute('aria-pressed',String(!following));motionButton.querySelector('span').textContent=following?'视角跟随中':'视角已固定';motionButton.title=following?'暂停鼠标跟随':'启用鼠标跟随';}
motionButton.addEventListener('click',()=>{following=!following;room?.setFollow(following);updateMotion();});updateMotion();
document.querySelector('#year').textContent=new Date().getFullYear();
function ready(){const loading=document.querySelector('#loading');loading.classList.add('done');loading.setAttribute('aria-hidden','true');}
function fallback(){document.querySelector('#fallback').hidden=false;document.querySelector('#room').style.display='none';document.querySelector('.intro').style.display='none';document.querySelector('.navigation').style.visibility='hidden';document.querySelector('#hotspots').replaceChildren();motionButton.hidden=true;ready();}
try {room=createRoom(document.querySelector('#room'),{onOpen:openPanel,onReady:ready,onViewChange:updateView});}catch(error){console.error('3D scene unavailable:',error);fallback();}
document.querySelector('#room').addEventListener('webglcontextlost',event=>{event.preventDefault();room?.dispose();room=null;fallback();});
window.addEventListener('pagehide',event=>{if(!event.persisted){reelCleanup();room?.dispose();}});
if(import.meta.hot)import.meta.hot.dispose(()=>{reelCleanup();room?.dispose();});
