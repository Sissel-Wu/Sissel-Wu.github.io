import './style.css';
import { createRoom } from './scene.js';
import { profile, publications, posts, videos, photos, musicTracks } from './data.js';

const dialog=document.querySelector('#content-dialog');
const content=document.querySelector('#panel-content');
const panelTitle=document.querySelector('#panel-title');
const backButton=document.querySelector('#panel-back');
const closeButton=document.querySelector('#close-dialog');
const directoryTitle='探索目录';
const sectionTitles={work:'认识一下',videos:'视频',gaming:'游戏',photos:'摄影',culture:'故事',music:'音乐'};
let room, lastFocus, currentPanel, reelCleanup=()=>{}, photoIndex=0;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
function playWithDog(){
  if(!room)return;
  const fromDirectory=dialog.open;
  if(fromDirectory)dialog.close();
  const action=room.playDog(fromDirectory);
  const messages={pet:'导弹眯起眼，摇了摇尾巴。',paw:'导弹抬起一只爪子。',spin:'导弹转了一圈。'};
  document.querySelector('#dog-status').replaceChildren(reducedMotion?'导弹向你打招呼。':messages[action]);
}
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setPanelTitle(title,backTo=''){
  panelTitle.textContent=title;
  backButton.dataset.back=backTo;
  backButton.textContent=backTo==='index'?`↑ ${directoryTitle}`:'← 返回';
  backButton.hidden=!backTo;
  dialog.scrollTop=0;
}

const postList=category=>posts
  .filter(post=>post.category===category||(category==='music'&&post.topic==='music'))
  .map(post=>`<button class="list-row" data-post="${post.id}">${escapeHTML(post.title)}<span aria-hidden="true">→</span></button>`)
  .join('');

function renderPanel(type){
  reelCleanup();reelCleanup=()=>{};currentPanel=type;
  const title=type==='work'?profile.name:(sectionTitles[type]??directoryTitle);
  setPanelTitle(title,type==='index'?'':'index');
  if(type==='videos')content.innerHTML=videos.map((video,index)=>`
    <button class="list-row video-row" data-video="${index}">
      <span class="video-thumbnail"><img src="${video.image}" alt="" loading="lazy"><span aria-hidden="true">▶</span></span>
      ${escapeHTML(video.title)}
    </button>`).join('');
  if(type==='gaming'||type==='culture')content.innerHTML=postList(type);
  if(type==='music')showMusic();
  if(type==='work')content.innerHTML=`
    <p class="bio">${escapeHTML(profile.bio)}</p>
    <a class="contact-link" href="https://github.com/Sissel-Wu" target="_blank" rel="noreferrer">GitHub ↗</a>
    <h3 class="section-title">论文</h3>
    ${publications.map(publication=>`
      <details class="publication">
        <summary>
          <div>${escapeHTML(publication.title)}<small>${escapeHTML(publication.authors)} · ${escapeHTML(publication.venue)}</small></div>
          <span class="publication-toggle" aria-hidden="true"></span>
        </summary>
        <p>${escapeHTML(publication.abstract)}</p>
      </details>`).join('')}
    <h3 class="section-title">文章</h3>
    ${postList('work')}`;
  if(type==='photos')content.innerHTML=`
    <div class="photo-grid">${photos.map((photo,index)=>`
      <button class="photo-card" data-photo="${index}">
        <img src="${photo.src}" alt="" loading="lazy">
        <span>${escapeHTML(photo.title)}</span>
      </button>`).join('')}</div>
    <p class="media-note">示例照片 · Unsplash</p>`;
  if(type==='index'){
    const entries=Object.entries(sectionTitles);
    if(room)entries.push(['dog','和导弹玩']);
    content.innerHTML=entries.map(([id,title])=>`
      <button class="list-row" data-open="${id}">${title}<span aria-hidden="true">→</span></button>`).join('');
  }
}
function showMusic(){
  content.innerHTML=`
    <audio id="music-audio" controls preload="metadata" src="${musicTracks[0].src}" aria-label="音乐播放器">当前浏览器不支持音频播放。</audio>
    <p id="music-status" role="status"></p>
    <div class="music-track-list" role="group" aria-label="选择曲目">${musicTracks.map((track,index)=>`
      <button class="list-row music-track" data-track="${index}" aria-pressed="${index===0}">
        <span>${escapeHTML(track.title)}</span><span class="track-indicator" aria-hidden="true">♪</span>
      </button>`).join('')}</div>
    <h3 class="section-title">音乐随笔</h3>
    ${postList('music')}`;
  const player=content.querySelector('#music-audio'),status=content.querySelector('#music-status');
  player.volume=.45;
  player.addEventListener('playing',()=>{status.textContent='';});
  player.addEventListener('error',()=>{status.textContent='这首曲目暂时无法播放。';});
  reelCleanup=()=>{player.pause();player.removeAttribute('src');player.load();};
}
function selectTrack(index){
  const track=musicTracks[index],player=content.querySelector('#music-audio');
  if(!track||!player)return;
  player.pause();player.src=track.src;player.load();
  content.querySelectorAll('[data-track]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.track)===index)));
  const status=content.querySelector('#music-status');
  status.textContent='';
  player.play().catch(error=>{
    if(error.name==='NotAllowedError'&&player.isConnected)status.textContent='请点击播放。';
  });
}
function openPanel(type){
  if(type==='dog'){playWithDog();return;}
  if(dialog.open){renderPanel(type);panelTitle.focus({preventScroll:true});return;}
  lastFocus=document.activeElement;
  renderPanel(type);
  dialog.showModal();
  closeButton.focus();
}
function closePanel(){dialog.close();}
dialog.addEventListener('close',()=>{reelCleanup();reelCleanup=()=>{};lastFocus?.focus({preventScroll:true});});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closePanel();}});
closeButton.addEventListener('click',closePanel);
document.querySelector('#index-button').addEventListener('click',()=>openPanel('index'));
function showArticle(id){
  const post=posts.find(p=>p.id===id);if(!post)return;
  reelCleanup();reelCleanup=()=>{};
  setPanelTitle(post.title,currentPanel);
  content.innerHTML=`<article class="article">${post.body.map(paragraph=>`<p>${escapeHTML(paragraph)}</p>`).join('')}</article>`;
  backButton.focus({preventScroll:true});
}
function showVideo(index){
  const v=videos[index];if(!v)return;
  reelCleanup();
  setPanelTitle(v.title,'videos');
  content.innerHTML=`
    <div class="demo-reel"><img src="${v.image}" alt="${escapeHTML(v.title)}动态分镜"></div>
    <div class="reel-controls">
      <button id="reel-play" aria-label="播放示例分镜">▶ 播放</button>
      <progress max="12" value="0" aria-label="播放进度"></progress>
      <span id="reel-time">00:00 / 00:12</span>
    </div>
    <p class="media-note">示例分镜</p>`;
  const reel=content.querySelector('.demo-reel'),play=content.querySelector('#reel-play'),progress=content.querySelector('progress'),time=content.querySelector('#reel-time');
  let elapsed=0,playing=false,last=0,frame;
  const paint=()=>{play.textContent=playing?'Ⅱ 暂停':elapsed>=12?'↻ 重播':'▶ 播放';play.setAttribute('aria-label',playing?'暂停示例分镜':elapsed>=12?'重播示例分镜':'播放示例分镜');reel.classList.toggle('playing',playing);};
  const tick=now=>{if(playing){elapsed=Math.min(12,elapsed+(now-last)/1000);progress.value=elapsed;time.textContent=`00:${String(Math.floor(elapsed)).padStart(2,'0')} / 00:12`;if(elapsed>=12){playing=false;paint();}}last=now;frame=requestAnimationFrame(tick);};
  play.addEventListener('click',()=>{if(elapsed>=12){elapsed=0;const img=reel.querySelector('img');img.style.animation='none';void img.offsetWidth;img.style.animation='';}playing=!playing;last=performance.now();paint();});
  last=performance.now();frame=requestAnimationFrame(tick);reelCleanup=()=>cancelAnimationFrame(frame);backButton.focus({preventScroll:true});
}
function showPhoto(index){
  photoIndex=(index+photos.length)%photos.length;const p=photos[photoIndex];
  const focusedStep=document.activeElement?.dataset.photoStep;
  setPanelTitle(p.title,'photos');
  content.innerHTML=`
    <div class="photo-view"><img src="${p.src}" alt="${escapeHTML(p.title)}"></div>
    <div class="photo-controls">
      <button data-photo-step="-1" aria-label="上一张照片">← 上一张</button>
      <span>${photoIndex+1} / ${photos.length}</span>
      <button data-photo-step="1" aria-label="下一张照片">下一张 →</button>
    </div>`;
  const nextFocus=focusedStep?content.querySelector(`[data-photo-step="${focusedStep}"]`):backButton;
  nextFocus.focus({preventScroll:true});
}
document.addEventListener('click',e=>{
  const button=e.target.closest('button');if(!button)return;
  if(button.dataset.open)openPanel(button.dataset.open);
  if(button.dataset.back){renderPanel(button.dataset.back);panelTitle.focus({preventScroll:true});}
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
}
function ready(){const loading=document.querySelector('#loading');loading.classList.add('done');loading.setAttribute('aria-hidden','true');}
function fallback(){document.querySelector('#fallback').hidden=false;document.querySelector('#room').style.display='none';document.querySelector('.intro').style.display='none';document.querySelector('.navigation').style.visibility='hidden';document.querySelector('#hotspots').replaceChildren();content.querySelector('[data-open="dog"]')?.remove();ready();}
try {room=createRoom(document.querySelector('#room'),{onOpen:openPanel,onReady:ready,onViewChange:updateView});}catch(error){console.error('3D scene unavailable:',error);fallback();}
document.querySelector('#room').addEventListener('webglcontextlost',event=>{event.preventDefault();room?.dispose();room=null;fallback();});
window.addEventListener('pagehide',event=>{if(!event.persisted){reelCleanup();room?.dispose();}});
if(import.meta.hot)import.meta.hot.dispose(()=>{reelCleanup();room?.dispose();});
