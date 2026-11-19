import './style.css';
import { createRoom } from './scene.js';
import { profile, posts, videos, photoAlbums } from './data.js';
import { escapeHTML } from './content/markdown.js';

const dialog=document.querySelector('#content-dialog');
const content=document.querySelector('#panel-content');
const panelTitle=document.querySelector('#panel-title');
const backButton=document.querySelector('#panel-back');
const closeButton=document.querySelector('#close-dialog');
const directoryTitle='探索目录';
const sectionTitles={work:'认识一下',videos:'视频',photos:'摄影',gaming:'游戏',culture:'故事',music:'音乐'};
const tbaSections=new Set(['gaming','culture','music']);
let room, lastFocus, currentPanel, currentAlbum, photoIndex=0;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
function playWithDog(){
  if(!room)return;
  const fromDirectory=dialog.open;
  if(fromDirectory)dialog.close();
  const action=room.playDog(fromDirectory);
  const messages={pet:'导弹眯起眼，摇了摇尾巴。',paw:'导弹抬起一只爪子。',spin:'导弹转了一圈。'};
  document.querySelector('#dog-status').replaceChildren(reducedMotion?'导弹向你打招呼。':messages[action]);
}
function setPanelTitle(title,backTo=''){
  panelTitle.textContent=title;
  backButton.dataset.back=backTo;
  backButton.textContent=backTo==='index'?`↑ ${directoryTitle}`:'← 返回';
  backButton.hidden=!backTo;
  dialog.scrollTop=0;
}

const postList=category=>posts
  .filter(post=>post.category===category)
  .map(post=>`<button class="list-row" data-post="${escapeHTML(post.id)}">${escapeHTML(post.title)}<span aria-hidden="true">→</span></button>`)
  .join('');

function renderPanel(type){
  currentPanel=type;
  const title=type==='work'?profile.name:(sectionTitles[type]??directoryTitle);
  setPanelTitle(title,type==='index'?'':'index');
  if(tbaSections.has(type)){
    content.innerHTML='<p>TBA</p>';
    return;
  }
  if(type==='videos')content.innerHTML=videos.map(video=>{
    const url=video.url??`https://search.bilibili.com/all?keyword=${encodeURIComponent(video.title)}`;
    const thumbnail=video.image
      ? `<span class="video-thumbnail"><img src="${escapeHTML(video.image)}" alt="" loading="lazy"></span>`
      : '';
    return `
      <a class="list-row video-row" href="${escapeHTML(url)}" target="_blank" rel="noreferrer">
        ${thumbnail}
        ${escapeHTML(video.title)}
      </a>`;
  }).join('');
  if(type==='work'){
    const bio=profile.bioHtml||`<p>${escapeHTML(profile.bio)}</p>`;
    const links=profile.links?.length
      ? `<div class="contact-links">${profile.links.map(link=>`<a class="contact-link" href="${escapeHTML(link.url)}" target="_blank" rel="noreferrer">${escapeHTML(link.label)} ↗</a>`).join('')}</div>`
      : '';
    content.innerHTML=`
    <div class="bio">${bio}</div>
    ${links}
    <h3 class="section-title">文章</h3>
    ${postList('work')}`;
  }
  if(type==='photos')content.innerHTML=`
    <div class="photo-grid">${photoAlbums.map((album,index)=>`
      <button class="photo-card" type="button" data-album="${index}">
        <img src="${escapeHTML(album.cover)}" alt="" loading="lazy">
        <span>${escapeHTML(album.title)}</span>
      </button>`).join('')}</div>`;
  if(type==='index'){
    const entries=Object.entries(sectionTitles);
    if(room)entries.push(['dog','和导弹玩']);
    content.innerHTML=entries.map(([id,title])=>`
      <button class="list-row${tbaSections.has(id)?' tba-row':''}" data-open="${id}">${title}<span aria-hidden="true">→</span></button>`).join('');
  }
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
dialog.addEventListener('close',()=>{lastFocus?.focus({preventScroll:true});});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closePanel();}});
closeButton.addEventListener('click',closePanel);
document.querySelector('#index-button').addEventListener('click',()=>openPanel('index'));
function showArticle(id){
  const post=posts.find(p=>p.id===id);if(!post)return;
  setPanelTitle(post.title,currentPanel);
  const articleHtml=post.html||post.body.map(paragraph=>`<p>${escapeHTML(paragraph)}</p>`).join('');
  content.innerHTML=`<article class="article">${articleHtml}</article>`;
  backButton.focus({preventScroll:true});
}
function showAlbum(index){
  const album=photoAlbums[index];
  if(!album?.photos.length)return;
  currentAlbum=album;
  currentPanel='album';
  showPhoto(0);
}
function showPhoto(index){
  const photos=currentAlbum.photos;
  photoIndex=(index+photos.length)%photos.length;
  const photo=photos[photoIndex];
  const focusedStep=document.activeElement?.dataset.photoStep;
  setPanelTitle(photo.title,'photos');
  content.innerHTML=`
    <div class="photo-view"><img src="${escapeHTML(photo.src)}" alt="${escapeHTML(photo.title)}"></div>
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
  if(button.dataset.album!==undefined)showAlbum(Number(button.dataset.album));
  if(button.dataset.photoStep)showPhoto(photoIndex+Number(button.dataset.photoStep));
  if(button.dataset.view){room?.setView(button.dataset.view);updateView(button.dataset.view);}
});
document.addEventListener('keydown',e=>{
  if(dialog.open){
    if(currentPanel==='album'&&['ArrowLeft','ArrowRight'].includes(e.key)){
      e.preventDefault();
      showPhoto(photoIndex+(e.key==='ArrowRight'?1:-1));
    }
    return;
  }
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
window.addEventListener('pagehide',event=>{if(!event.persisted)room?.dispose();});
if(import.meta.hot)import.meta.hot.dispose(()=>{room?.dispose();});
