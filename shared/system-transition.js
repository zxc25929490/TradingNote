(()=>{
  const links=[...document.querySelectorAll('.system-switcher a')];
  if(!links.length)return;
  const track=document.createElement('div'),bar=document.createElement('div'),guard=document.createElement('div'),label=document.createElement('div');
  track.className='system-transition-track';bar.className='system-transition-bar';guard.className='system-transition-guard';label.className='system-transition-label';track.appendChild(bar);document.body.append(track,guard,label);
  const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let switching=false;
  function enterPage(){
    let continued=false;try{continued=sessionStorage.getItem('tradingnote.system-switching')==='1';sessionStorage.removeItem('tradingnote.system-switching')}catch(_){continued=false}
    if(!continued){document.documentElement.classList.remove('system-transition-pending');return}
    document.body.classList.add('system-entry-complete');bar.style.width='76%';
    requestAnimationFrame(()=>{bar.style.width='100%';document.documentElement.classList.add('system-transition-ready')});
    setTimeout(()=>{document.documentElement.classList.remove('system-transition-pending','system-transition-ready');document.body.classList.remove('system-entry-complete');bar.style.width='0'},reduceMotion?80:360);
  }
  function switchSystem(anchor){
    if(switching)return;switching=true;
    const name=anchor.querySelector('b')?.textContent.trim()||'目標系統';
    label.textContent=`正在載入 ${name}`;document.body.classList.add('system-is-switching');bar.style.width='8%';
    requestAnimationFrame(()=>{bar.style.width='68%'});
    setTimeout(()=>{bar.style.width='88%'},reduceMotion?80:330);
    try{sessionStorage.setItem('tradingnote.system-switching','1')}catch(_){}
    setTimeout(()=>{bar.style.width='96%';window.location.assign(anchor.href)},reduceMotion?180:720);
  }
  links.forEach(anchor=>anchor.addEventListener('click',event=>{
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||anchor.classList.contains('active'))return;
    event.preventDefault();switchSystem(anchor);
  }));
  window.addEventListener('pageshow',event=>{if(event.persisted){switching=false;document.body.classList.remove('system-is-switching');bar.style.width='0'}});
  enterPage();
})();
