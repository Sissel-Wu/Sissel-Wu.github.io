import './style.css';
import { createRoom } from './scene.js';
import { profile, publications, posts, videos, photos, musicTracks } from './data.js';

const dialog=document.querySelector('#content-dialog');
const content=document.querySelector('#panel-content');
const kicker=document.querySelector('#panel-kicker');
let room, lastFocus, currentPanel, reelCleanup=()=>{}, photoIndex=0;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
let following=!reducedMotion;
function playWithDog(){
  if(!room)return;
  const fromDirectory=dialog.open;
  if(fromDirectory)dialog.close();
  const action=room.playDog(fromDirectory);
  const messages={pet:'导弹眯起眼，摇了摇尾巴。',paw:'导弹抬起一只爪子。',spin:'导弹转了一圈。'};
  document.querySelector('#dog-status').replaceChildren(reducedMotion?'导弹向你打招呼。':messages[action]);
}
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const heading=(eyebrow,title,description)=>`<div class="panel-heading"><div class="eyebrow">${eyebrow}</div><h2 id="panel-title">${title}</h2><p>${description}</p><span class="sample-label">MVP · 示例内容，等待真实故事入住</span></div>`;
const postList=category=>posts.filter(p=>p.category===category||(category==='music'&&p.topic==='music')).map(p=>`<button class="post" data-post="${p.id}"><div><span class="post-tag">${p.tag}</span><h3>${p.title}</h3><small>${p.date} &nbsp; / &nbsp; ${p.read} read</small></div><span>↗</span></button>`).join('');
function renderPanel(type){
  reelCleanup();reelCleanup=()=>{};currentPanel=type;dialog.scrollTop=0;
  const titles={videos:'01 / THE TELEVISION',gaming:'02 / THE GAME CONSOLE',work:'03 / THE COMPUTER',photos:'04 / THE CAMERA',culture:'05 / THE BOOKCASE',music:'06 / THE RECORD PLAYER',index:'MAKE YOURSELF AT HOME'};
  kicker.textContent=titles[type];
  if(type==='videos')content.innerHTML=heading('MOVING PICTURES','一些会动的记忆。','用镜头收集日常，也给平凡的时刻多一点时间。')+videos.map((v,i)=>`<button class="video-card" data-video="${i}"><div class="video-image"><img src="${v.image}" alt="${v.title}的示例封面" loading="lazy"><span class="play">▶</span><span class="duration">${v.time}</span></div><div class="card-meta"><h3>${v.title}</h3><span>${v.tag}</span></div><p>${v.subtitle}</p></button>`).join('');
  if(type==='gaming')content.innerHTML=heading('PRESS PAUSE. PRESS PLAY.','认真生活，尽情玩。','关于游戏、虚构世界，以及那些不必有用的快乐。')+postList('gaming');
  if(type==='culture')content.innerHTML=heading('READ. WATCH. LISTEN.','故事之外，还有回响。','读过的书、看过的电影、反复听的音乐，以及它们留下的念头。')+postList('culture');
  if(type==='music')showMusic();
  if(type==='work')content.innerHTML=`<div class="panel-heading"><div class="profile-hero"><div class="avatar" aria-hidden="true">s.</div><div><h2 id="panel-title">${profile.name}</h2><p>${profile.role}</p></div></div><span class="sample-label">以下简介、论文与文章均为演示占位</span></div><p class="bio">${profile.bio}</p><div class="tags">${profile.interests.map(t=>`<span>${t}</span>`).join('')}</div><a class="contact-link" href="https://github.com/Sissel-Wu" target="_blank" rel="noreferrer">Find me on GitHub ↗</a><div class="section-title"><h3>Selected publications</h3><span>RESEARCH / 01</span></div>${publications.map(p=>`<details class="publication"><summary><h4>${p.title}</h4><small>${p.authors}<br>${p.venue}</small></summary><p>${p.abstract}</p></details>`).join('')}<div class="section-title"><h3>思考与记录</h3><span>WRITING / 02</span></div>${postList('work')}`;
  if(type==='photos')content.innerHTML=heading('THROUGH THE VIEWFINDER','把瞬间，留在这里。','路过的风景、偶然的光线，和生活里的小小停顿。')+`<div class="photo-grid">${photos.map((p,i)=>`<button class="photo-card" data-photo="${i}" aria-label="查看照片：${p.title}"><img src="${p.src}" alt="${p.title}" loading="lazy"><h3>${p.title}</h3><small>${p.location} &nbsp; / &nbsp; ${p.year}</small></button>`).join('')}</div><p class="bio">照片为 Unsplash 演示素材，不代表作者本人作品。</p>`;
  if(type==='index'){
    const entries=[
      ['videos','01 / TELEVISION','看点影像','视频、旅行与视觉日记'],
      ['gaming','02 / GAME CONSOLE','玩乐时间','游戏体验与生活碎片'],
      ['work','03 / COMPUTER','认识一下','个人简介、论文与研究笔记'],
      ['photos','04 / CAMERA','光影收藏','照片、风景与城市漫步'],
      ['culture','05 / BOOKCASE','书影音','阅读笔记、电影与音乐随笔'],
      ['music','06 / RECORD PLAYER','放张唱片','音乐试听与聆听随笔'],
    ];
    if(room)entries.push(['dog','07 / LITTLE ROOMMATE','和导弹玩','看看博美小室友会做什么动作']);
    content.innerHTML=heading('A ROOM FULL OF STORIES.','随意看看。','这个房间里的每一件物品，都是一扇小小的门。')+
      `<div class="directory">${entries.map(([id,num,title,desc])=>`<button data-open="${id}"><small>${num}</small><h3>${title} ↗</h3><p>${desc}</p></button>`).join('')}</div>`;
  }
}
function showMusic(){
  const first=musicTracks[0];
  content.innerHTML=heading('A LITTLE MUSIC FOR THE ROOM.','让房间慢下来。','选一首，坐一会儿。这里先放了两段工作室示例音乐。')+
    `<section class="music-player" aria-label="唱片播放器"><div class="music-now"><div class="music-disc" aria-hidden="true"><span>33⅓</span></div><div><span class="eyebrow">ON THE TURNTABLE</span><h3 id="music-track-title">${escapeHTML(first.title)}</h3><p id="music-track-mood">${escapeHTML(first.mood)}</p></div></div><audio id="music-audio" controls preload="metadata" src="${first.src}" aria-label="音乐播放、暂停和进度控制">当前浏览器不支持音频播放。</audio><p id="music-status" role="status">点击播放，听一会儿。</p></section>`+
    `<div class="music-track-list" role="group" aria-label="选择唱片">${musicTracks.map((track,i)=>`<button class="music-track${i===0?' is-selected':''}" data-track="${i}" aria-pressed="${i===0}"><span class="music-track-number">${String(i+1).padStart(2,'0')}</span><span><strong>${escapeHTML(track.title)}</strong><small>${escapeHTML(track.mood)}</small></span><span class="music-track-duration">${track.duration}</span></button>`).join('')}</div>`+
    `<div class="section-title"><h3>听完以后</h3><span>LISTENING NOTES</span></div>`+postList('music');
  const player=content.querySelector('#music-audio'),card=content.querySelector('.music-player'),status=content.querySelector('#music-status'),trackTitle=content.querySelector('#music-track-title');
  player.volume=.45;
  player.addEventListener('playing',()=>{card.classList.add('is-playing');status.textContent='正在播放 · '+trackTitle.textContent;});
  player.addEventListener('pause',()=>{card.classList.remove('is-playing');status.textContent=player.ended?'唱片放完了，再听一遍也好。':'已暂停，随时继续。';});
  player.addEventListener('ended',()=>{card.classList.remove('is-playing');status.textContent='唱片放完了，再听一遍也好。';});
  player.addEventListener('error',()=>{card.classList.remove('is-playing');status.textContent='这首音乐暂时无法播放，请试试另一首。';});
  reelCleanup=()=>{player.pause();player.removeAttribute('src');player.load();};
}
function selectTrack(index){
  const track=musicTracks[index],player=content.querySelector('#music-audio');
  if(!track||!player)return;
  player.pause();player.src=track.src;player.load();
  content.querySelector('#music-track-title').textContent=track.title;
  content.querySelector('#music-track-mood').textContent=track.mood;
  content.querySelectorAll('[data-track]').forEach(button=>{const active=Number(button.dataset.track)===index;button.classList.toggle('is-selected',active);button.setAttribute('aria-pressed',String(active));});
  content.querySelector('#music-status').textContent='正在准备 · '+track.title;
  player.play().catch(error=>{if(error.name!=='AbortError'&&player.isConnected)content.querySelector('#music-status').textContent='点击播放器的播放按钮，开始聆听。';});
}
function openPanel(type){
  if(type==='dog'){playWithDog();return;}
  if(!dialog.open){lastFocus=document.activeElement;renderPanel(type);dialog.showModal();document.querySelector('#close-dialog').focus();}else renderPanel(type);
}
function closePanel(){dialog.close();}
dialog.addEventListener('close',()=>{reelCleanup();reelCleanup=()=>{};lastFocus?.focus({preventScroll:true});});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closePanel();}});
document.querySelector('#close-dialog').addEventListener('click',closePanel);
document.querySelector('#index-button').addEventListener('click',()=>openPanel('index'));
function showArticle(id){
  const post=posts.find(p=>p.id===id);if(!post)return;
  reelCleanup();reelCleanup=()=>{};
  content.innerHTML=`<button class="back-button" data-back="${currentPanel}">← 返回列表</button>`+heading(post.tag,post.title,`${post.date} · ${post.read} read`)+`<article class="article">${post.body.map(p=>`<p>${escapeHTML(p)}</p>`).join('')}</article>`;dialog.scrollTop=0;content.querySelector('.back-button').focus();
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
  if(button.dataset.track!==undefined)selectTrack(Number(button.dataset.track));
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
function fallback(){document.querySelector('#fallback').hidden=false;document.querySelector('#room').style.display='none';document.querySelector('.intro').style.display='none';document.querySelector('.navigation').style.visibility='hidden';document.querySelector('#hotspots').replaceChildren();content.querySelector('[data-open="dog"]')?.remove();motionButton.hidden=true;ready();}
try {room=createRoom(document.querySelector('#room'),{onOpen:openPanel,onReady:ready,onViewChange:updateView});}catch(error){console.error('3D scene unavailable:',error);fallback();}
document.querySelector('#room').addEventListener('webglcontextlost',event=>{event.preventDefault();room?.dispose();room=null;fallback();});
window.addEventListener('pagehide',event=>{if(!event.persisted){reelCleanup();room?.dispose();}});
if(import.meta.hot)import.meta.hot.dispose(()=>{reelCleanup();room?.dispose();});
