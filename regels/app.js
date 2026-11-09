'use strict';
(() => {
  const data = window.APV_DATA;
  const $ = id => document.getElementById(id);
  const icons = {
    book:'<path d="M4 3h6a3 3 0 0 1 3 3v15a4 4 0 0 0-4-3H4z"/><path d="M13 6a3 3 0 0 1 3-3h5v15h-4a4 4 0 0 0-4 3"/>',
    shield:'<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z"/><path d="m8.5 12 2.3 2.3 4.8-5"/>',
    scale:'<path d="M12 3v18M7 21h10M4 7l8-3 8 3M4 7 1 14h6zM20 7l-3 7h6z"/>',
    check:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 9 1.5 1.5L12 8M14 10h3m-9 6 1.5 1.5L12 15m2 2h3"/>',
    discord:'<path d="M8 5a15 15 0 0 0-4 1C2 10 1 14 2 17a13 13 0 0 0 5 2l1-2m8-12a15 15 0 0 1 4 1c2 4 3 8 2 11a13 13 0 0 1-5 2l-1-2M7 5l1-2m9 2-1-2M6 16a13 13 0 0 0 12 0"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/>',
    users:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m3 11v-3a6 6 0 0 0-3-5"/>',
    target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',
    car:'<path d="m4 10 2-6h12l2 6M3 10h18v8H3zM5 18v3m14-3v3M6 14h2m8 0h2"/>',
    bookmark:'<path d="M6 3h12v18l-6-4-6 4z"/>',
    external:'<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
    chevron:'<path d="m9 5 7 7-7 7"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l1.5 1.5m13 13L20 20M4 20l1.5-1.5m13-13L20 4"/>',
    moon:'<path d="M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11z"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    expand:'<path d="m8 7 4-4 4 4m-4-4v7m-4 7 4 4 4-4m-4 4v-7"/>',
    filter:'<path d="M4 6h16M7 12h10M10 18h4"/>',
    'arrow-down':'<path d="M12 4v16m-6-6 6 6 6-6"/>',
    'arrow-up':'<path d="M12 20V4m-6 6 6-6 6 6"/>',
    'arrow-right':'<path d="M4 12h16m-6-6 6 6-6 6"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
    message:'<path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z"/><path d="M7 8h10M7 12h7"/>',
    print:'<path d="M6 8V3h12v5M6 16H3V8h18v8h-3M6 13h12v8H6zM17 10h1"/>',
    link:'<path d="m10 13 4-4M8 15l-2 2a4 4 0 0 1-5-6l4-4a4 4 0 0 1 6 0m2 2 2-2a4 4 0 0 1 6 5l-4 4a4 4 0 0 1-6 0"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>'
  };
  const icon = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(icons[name]||icons.book)+'</svg>';
  document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
  const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fold = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const readStorage = (key,fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const saveStorage = (key,value) => { try { localStorage.setItem(key,JSON.stringify(value)); } catch {} };
  const storedBookmarks=readStorage('heerlen-apv-bookmarks',[]);
  const saved = new Set((Array.isArray(storedBookmarks)?storedBookmarks:[]).filter(id=>data.rules.some(r=>r.id===id)));
  let page='apv', topic='all', expanded=false, toastTimer;
  const pageInfo={
    apv:{title:'Algemene Plaatselijke Verordening',short:'APV',eyebrow:'HET REGLEMENT',description:''},
    algemeen:{title:'Algemene regels',short:'Algemene regels',eyebrow:'DE BASIS VAN ONZE COMMUNITY',description:'Respect, realisme en gezond verstand. Dit spreken we met elkaar af.'},
    discord:{title:'Discord-regels',short:'Discord-regels',eyebrow:'ONZE COMMUNITY',description:'Ook buiten de stad houden we het respectvol. Deze regels gelden in onze Discord.'},
    sancties:{title:'Strafcategorieën',short:'Strafcategorieën',eyebrow:'HANDHAVING & SANCTIES',description:'Van een mondelinge waarschuwing tot een permanente verbanning.'},
    bewaard:{title:'Bewaarde artikelen',short:'Bewaarde artikelen',eyebrow:'JOUW NASLAGWERK',description:'De artikelen die je hebt opgeslagen, snel weer bij de hand.'}
  };
  function applyTheme(theme) { document.documentElement.dataset.theme=theme; const button=$('themeBtn'); if(button){button.innerHTML=icon(theme==='dark'?'sun':'moon');button.setAttribute('aria-label',theme==='dark'?'Licht thema inschakelen':'Donker thema inschakelen');} }
  let sharedTheme='';
  try { sharedTheme=localStorage.getItem('heerlenrp_theme')||''; } catch {}
  applyTheme(sharedTheme==='light'?'light':sharedTheme==='dark'?'dark':readStorage('heerlen-apv-theme','dark')==='light'?'light':'dark');
  $('topic-nav').innerHTML=data.groups.map(g=>'<a href="#apv/'+g.id+'" data-topic="'+g.id+'"><span class="topic-dot"></span>'+escape(g.name)+'<span class="topic-number">'+g.count+'</span></a>').join('');
  $('topic-cards').innerHTML=data.groups.map(g=>'<a class="topic-card" href="#apv/'+g.id+'" data-topic="'+g.id+'"><div class="topic-card-top"><span class="topic-icon">'+icon(g.icon)+'</span><span>'+g.count+' artikelen</span></div><strong>'+escape(g.name)+'<span>'+icon('arrow-right')+'</span></strong><p>'+escape(g.description)+'</p></a>').join('');
  for(let i=0;i<=9;i++){const option=document.createElement('option');option.value=String(i);option.textContent='Categorie '+i;$('category').appendChild(option);}
  const varOption=document.createElement('option');varOption.value='var';varOption.textContent='Variabel / overige';$('category').appendChild(varOption);
  function categories(rule) {
    if(!/^Categorie/.test(rule.sanctie)) return ['var'];
    const text=rule.sanctie.replace(/^Categorie\s*/,''),range=text.match(/^(\d+)\s*(?:-|t\/m)\s*(\d+)/);
    if(range){const numbers=[];for(let i=Number(range[1]);i<=Number(range[2]);i++)numbers.push(String(i));return numbers;}
    return text.match(/\d+/g)||['var'];
  }
  function row(rule,isApv) {
    const level=isApv?(rule.catClass==='cat-var'?'var':Number(rule.catClass.replace('cat',''))<=2?'low':Number(rule.catClass.replace('cat',''))<=4?'medium':'high'):'var';
    const num=isApv?rule.num:(rule.title==='Belangrijk'?'!':rule.num);
    return '<article class="rule" id="'+rule.id+'"><details><summary><span class="rule-number">'+escape(num)+'</span><div class="rule-title"><h3>'+escape(rule.title)+'</h3><p>'+escape(rule.summary)+'</p></div>'+(isApv?'<span class="sanction-badge" data-level="'+level+'">'+escape(rule.sanctie)+'</span>':'')+'<span class="rule-chevron">'+icon('chevron')+'</span></summary><div class="rule-body">'+rule.content+'<div class="rule-toolbar">'+(isApv?'<button type="button" data-save="'+rule.id+'" class="'+(saved.has(rule.id)?'saved':'')+'" aria-pressed="'+saved.has(rule.id)+'">'+icon('bookmark')+'<span>'+(saved.has(rule.id)?'Bewaard':'Artikel bewaren')+'</span></button>':'')+'<button type="button" data-copy="'+rule.id+'">'+icon('link')+'Link kopiëren</button></div></div></details></article>';
  }
  function matchesQuery(rule,query) {
    if(!query)return true;
    const direct=query.match(/^(?:art(?:ikel)?\.?\s*)?(\d+[a-z]?)$/i);
    if(direct)return fold(rule.num)===fold(direct[1]);
    const haystack=fold([rule.num,rule.title,rule.sanctie||'',rule.summary,rule.content.replace(/<[^>]+>/g,' ')].join(' '));
    return fold(query).split(/\s+/).every(part=>haystack.includes(part));
  }
  function updateSavedCount() { const count=$('saved-count');if(!count)return;count.textContent=saved.size;count.hidden=saved.size===0; }
  function render() {
    const query=$('search').value.trim(),cat=$('category').value,isApv=page==='apv'||page==='bewaard';
    const info=pageInfo[page];
    $('hero').hidden=page!=='apv';$('topic-cards').hidden=page!=='apv';$('main').classList.toggle('page-only',page!=='apv');
    $('section-title').firstChild.textContent=topic!=='all'&&page==='apv'?data.groups.find(g=>g.id===topic).name:info.title;
    $('section-description').textContent=info.description;$('section-eyebrow').textContent=info.eyebrow;
    document.title=info.short+' · Heerlen Roleplay';
    $('category').parentElement.hidden=!isApv;$('source-note').hidden=page!=='sancties';$('expand-all').hidden=page==='sancties';
    document.querySelectorAll('.nav-rules-menu [data-page]').forEach(a=>{const active=a.dataset.page===page;a.classList.toggle('is-current',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    document.querySelectorAll('[data-topic]').forEach(a=>a.classList.toggle('active',page==='apv'&&a.dataset.topic===topic));
    $('search').placeholder=page==='sancties'?'Zoek een categorie, sanctie of omschrijving…':isApv?'Zoek op artikel, onderwerp of trefwoord…':'Zoek in de '+(page==='discord'?'Discord-regels':'algemene regels')+'…';
    const list=$('rules-list');
    let filtered;
    if(page==='sancties') {
      filtered=data.sanctions.filter(s=>fold(s.join(' ')).includes(fold(query)));
      list.innerHTML='<table class="sanction-table"><thead><tr><th scope="col">Categorie</th><th scope="col">Sanctie</th><th scope="col">Omschrijving</th></tr></thead><tbody>'+filtered.map(s=>'<tr>'+s.map(value=>'<td>'+escape(value)+'</td>').join('')+'</tr>').join('')+'</tbody></table><div class="sanctions-followup"><strong>Strafverzwaring</strong><p>Bij herhaling wordt de straf met een categorie verhoogd (Categorie 1 → 2 → 3, etc.).</p></div>';
    } else {
      const source=isApv?data.rules:page==='discord'?data.discord:data.general;
      filtered=source.filter(r=>(page!=='bewaard'||saved.has(r.id))&&(topic==='all'||!isApv||r.group===topic)&&(!isApv||cat==='all'||categories(r).includes(cat))&&matchesQuery(r,query));
      list.innerHTML=filtered.map(r=>row(r,isApv)).join('');
      list.querySelectorAll('details').forEach(d=>{d.open=expanded;d.addEventListener('toggle',updateExpandButton);});
    }
    $('heading-count').textContent=filtered.length;$('result-count').textContent=filtered.length+' '+(page==='sancties'?'categorie'+(filtered.length!==1?'ën':''):isApv?'artikel'+(filtered.length!==1?'en':''):'regel'+(filtered.length!==1?'s':''));
    $('list-hint').hidden=page==='sancties';
    $('active-filters').innerHTML=(topic!=='all'&&isApv?'<button class="filter-chip" type="button" data-clear-topic>'+escape(data.groups.find(g=>g.id===topic).name)+icon('close')+'</button>':'')+(cat!=='all'&&isApv?'<button class="filter-chip" type="button" data-clear-cat>'+escape(cat==='var'?'Variabel / overige':'Categorie '+cat)+icon('close')+'</button>':'');
    list.hidden=!filtered.length;$('empty-state').hidden=!!filtered.length;
    const emptySaved=page==='bewaard'&&!saved.size;
    $('empty-state').querySelector('h3').textContent=emptySaved?'Nog geen bewaarde artikelen':page==='sancties'?'Geen categorieën gevonden':'Geen regels gevonden';
    $('empty-description').textContent=emptySaved?'Open een APV-artikel en klik op ‘Artikel bewaren’. Je vindt het daarna hier.':'Probeer een ander trefwoord of pas je filters aan.';
    $('reset-filters').textContent=emptySaved?'Naar de APV':'Filters wissen';
    updateSavedCount();updateExpandButton();
  }
  function updateExpandButton() {
    const details=[...$('rules-list').querySelectorAll('details')],allOpen=details.length>0&&details.every(d=>d.open);
    $('expand-all').querySelector('span:last-child').textContent=allOpen?'Alles inklappen':'Alles uitklappen';
    $('expand-all').disabled=!details.length;
  }
  function closeMenu() {document.body.classList.remove('nav-open');const button=$('menuBtn');if(button)button.setAttribute('aria-expanded','false');}
  function route(scroll=true) {
    let hash;try{hash=decodeURIComponent(location.hash.slice(1));}catch{hash='apv';}const parts=hash.split('/');
    const target=data.rules.find(r=>r.id===hash)||data.general.find(r=>r.id===hash)||data.discord.find(r=>r.id===hash);
    if(target){page=hash.startsWith('artikel-')?'apv':hash.startsWith('algemeen-')?'algemeen':'discord';topic='all';}
    else {page=pageInfo[parts[0]]?parts[0]:'apv';topic=page==='apv'&&data.groups.some(g=>g.id===parts[1])?parts[1]:'all';}
    $('search').value='';$('category').value='all';expanded=false;closeMenu();render();
    if(target){const el=$(target.id);el.querySelector('details').open=true;requestAnimationFrame(()=>{el.scrollIntoView({behavior:'auto',block:'center'});const summary=el.querySelector('summary');summary.focus({preventScroll:true});});}
    else if(scroll) window.scrollTo({top:0,behavior:'auto'});
  }
  $('search').addEventListener('input',()=>{expanded=false;render();});
  $('category').addEventListener('change',()=>{expanded=false;render();});
  $('expand-all').addEventListener('click',()=>{const details=[...$('rules-list').querySelectorAll('details')];expanded=!details.every(d=>d.open);details.forEach(d=>d.open=expanded);updateExpandButton();});
  $('active-filters').addEventListener('click',event=>{if(event.target.closest('[data-clear-topic]')){topic='all';history.replaceState(null,'','#apv');}if(event.target.closest('[data-clear-cat]'))$('category').value='all';render();});
  $('reset-filters').addEventListener('click',()=>{if(page==='bewaard'&&!saved.size){location.hash='apv';return;}$('search').value='';$('category').value='all';topic='all';expanded=false;render();$('search').focus();});
  function toast(message) {$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2800);}
  async function copyLink(id) {
    const url=new URL(location.href);url.hash=id;
    try {await navigator.clipboard.writeText(url.href);toast('Link naar deze regel gekopieerd.');}
    catch {const input=document.createElement('textarea');input.value=url.href;input.className='copy-input';document.body.appendChild(input);input.select();const copied=document.execCommand('copy');input.remove();if(copied)toast('Link naar deze regel gekopieerd.');else{history.replaceState(null,'',url.href);toast('De artikellink staat nu in de adresbalk.');}}
  }
  $('rules-list').addEventListener('click',event=>{
    const save=event.target.closest('[data-save]'),copy=event.target.closest('[data-copy]');
    if(save){const id=save.dataset.save;if(saved.has(id))saved.delete(id);else saved.add(id);saveStorage('heerlen-apv-bookmarks',[...saved]);save.setAttribute('aria-pressed',saved.has(id));save.classList.toggle('saved',saved.has(id));save.querySelector('span').textContent=saved.has(id)?'Bewaard':'Artikel bewaren';updateSavedCount();toast(saved.has(id)?'Artikel bewaard in deze browser.':'Artikel verwijderd uit je bewaarde artikelen.');if(page==='bewaard')render();}
    if(copy)copyLink(copy.dataset.copy);
  });
  document.addEventListener('keydown',event=>{
    const editing=/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)||event.target.isContentEditable;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'||event.key==='/'&&!editing){event.preventDefault();$('search').focus();$('search').scrollIntoView({block:'center',behavior:'smooth'});}
    if(event.key==='Escape')closeMenu();
  });
  $('back-top').addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
  window.addEventListener('scroll',()=>$('back-top').hidden=window.scrollY<600,{passive:true});
  let printState=[];
  window.addEventListener('beforeprint',()=>{printState=[...$('rules-list').querySelectorAll('details')].map(d=>[d,d.open]);printState.forEach(([d])=>d.open=true);});
  window.addEventListener('afterprint',()=>{printState.forEach(([d,open])=>d.open=open);printState=[];});
  $('print-button').addEventListener('click',()=>window.print());
  window.addEventListener('hashchange',()=>route());
  route(false);
})();
