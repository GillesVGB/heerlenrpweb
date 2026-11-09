/* Independent regulations view. The original Amsterdam React app keeps ownership of its other pages. */
(()=>{'use strict';
 const data=window.AMRP_REGULATIONS_DATA;if(!data||window.heerlenRegulations)return;
 const host=document.createElement('div');host.id='amrp-regulations';host.hidden=true;
 host.innerHTML="<main id=\"amrp-r-main\" tabindex=\"-1\">      <section class=\"hero\" id=\"amrp-r-hero\" aria-labelledby=\"amrp-r-hero-title\">\n        <div class=\"hero-copy\"><div class=\"eyebrow\"><span></span> HEERLEN ROLEPLAY · APV</div><h1 id=\"amrp-r-hero-title\">De regels van<br><em>onze stad.</em></h1><p>Goede roleplay begint met duidelijke afspraken.<br>Alles wat je moet weten, op één plek.</p><div class=\"hero-meta\"><span><span data-icon=\"book\"></span>65 artikelen</span><i></i><span><span data-icon=\"shield\"></span>Samen voor betere roleplay</span></div></div>\n        <div class=\"hero-art\" aria-hidden=\"true\"><div class=\"art-grid\"></div><div class=\"orbit orbit-one\"></div><div class=\"orbit orbit-two\"></div><span class=\"art-coordinate coordinate-one\">52°22′ N</span><span class=\"art-coordinate coordinate-two\">04°54′ E</span><img src=\"/images/heerlen-logo.png\" alt=\"\" width=\"310\" height=\"310\"><div class=\"art-caption\"><span></span> JOUW STAD. JOUW VERHAAL.</div></div>\n      </section>\n      <section id=\"amrp-r-topic-cards\" class=\"topic-cards\" aria-label=\"Blader per onderwerp\"></section>\n      <section class=\"rules-section\" aria-labelledby=\"amrp-r-section-title\">\n        <div class=\"section-heading\"><div><div class=\"eyebrow section-eyebrow\" id=\"amrp-r-section-eyebrow\">HET REGLEMENT</div><h2 id=\"amrp-r-section-title\">Algemene Plaatselijke Verordening<span class=\"heading-count\" id=\"amrp-r-heading-count\">65</span></h2><p id=\"amrp-r-section-description\">Lees de regels. Ken je grenzen. Maak het verhaal.</p></div><button class=\"text-button\" id=\"amrp-r-expand-all\" type=\"button\"><span data-icon=\"expand\"></span><span>Alles uitklappen</span></button></div>\n        <div class=\"filter-bar\"><label class=\"search-field\"><span data-icon=\"search\"></span><input id=\"amrp-r-search\" type=\"search\" placeholder=\"Zoek op artikel, onderwerp of trefwoord…\" aria-label=\"Zoek in het reglement\" autocomplete=\"off\"><kbd>/</kbd></label><label class=\"category-field\"><span data-icon=\"filter\"></span><select id=\"amrp-r-category\" aria-label=\"Filter op strafcategorie\"><option value=\"all\">Alle strafcategorieën</option></select></label></div>\n        <div class=\"results-line\"><div id=\"amrp-r-result-count\" role=\"status\" aria-live=\"polite\">65 artikelen</div><div class=\"active-filters\" id=\"amrp-r-active-filters\"></div><span id=\"amrp-r-list-hint\">Klik op een artikel om het te lezen <span data-icon=\"arrow-down\"></span></span></div>\n        <div class=\"source-note\" id=\"amrp-r-source-note\" hidden><span data-icon=\"info\"></span><p>De strafduren in sommige artikelen wijken af van dit overzicht. Beide zijn overgenomen uit de aangeleverde APV. Vraag bij twijfel een stafflid om verduidelijking.</p></div>\n        <div id=\"amrp-r-rules-list\" class=\"rules-list\"></div>\n        <div class=\"empty-state\" id=\"amrp-r-empty-state\" hidden><span data-icon=\"search\"></span><h3>Geen artikelen gevonden</h3><p id=\"amrp-r-empty-description\">Probeer een ander trefwoord of pas je filters aan.</p><button type=\"button\" id=\"amrp-r-reset-filters\" class=\"primary-button\">Filters wissen</button></div>\n      </section>\n      <section class=\"help-banner\"><div class=\"help-icon\" data-icon=\"message\"></div><div><h3>Twijfel over een regel?</h3><p>Gebruik je gezonde verstand. Ons staffteam helpt je graag verder.</p></div><a href=\"https://discord.gg/heerlenrp\" target=\"_blank\" rel=\"noopener noreferrer\">Vraag het in Discord <span data-icon=\"arrow-right\"></span></a></section>\n      <footer><div><img src=\"/images/heerlen-logo.png\" width=\"30\" height=\"30\" alt=\"\"><span>© 2026 Heerlen Roleplay</span></div><p>Samen maken we de stad.</p><button id=\"amrp-r-print-button\" type=\"button\"><span data-icon=\"print\"></span>Afdrukken / PDF</button></footer>\n</main><div id=\"amrp-r-toast\" class=\"toast\" role=\"status\" aria-live=\"polite\" hidden></div>";
 document.body.append(host);
 const wetboekLink=document.createElement('a');wetboekLink.href='/regels.html';wetboekLink.className='heerlen-wetboeken-link';wetboekLink.textContent='Wetboeken: Strafrecht en Strafvordering';host.querySelector('main').append(wetboekLink);
 const $=id=>document.getElementById('amrp-r-'+id);
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fold=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('nl');
 const icons={
    home:'<path d="m3 10 9-7 9 7v11h-7v-7h-4v7H3z"/>',
    bag:'<path d="M4 7h16l1 14H3zM8 7V6a4 4 0 0 1 8 0v1"/>',
    news:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7h10M7 11h4v5H7zM14 11h3m-3 4h3M7 19h10"/>',
    coin:'<circle cx="12" cy="12" r="9"/><path d="M9 7v10m6-10v10M9 12h6"/>',
    crown:'<path d="m3 6 5 4 4-7 4 7 5-4-2 13H5zM5 22h14"/>',
    gift:'<path d="M3 9h18v4H3zM5 13v8h14v-8M12 9v12"/><path d="M12 9s-7 0-7-4a2 2 0 0 1 4-1zM12 9s7 0 7-4a2 2 0 0 0-4-1z"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    activity:'<path d="M2 12h5l3-8 4 16 3-8h5"/>',
    refresh:'<path d="M20 7a9 9 0 0 0-15-2L2 8m0-5v5h5m-3 9a9 9 0 0 0 15 2l3-3m0 5v-5h-5"/>',
    'arrow-left':'<path d="M20 12H4m6-6-6 6 6 6"/>',
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
 const icon=name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(icons[name]||icons.book)+'</svg>';
 host.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=icon(e.dataset.icon));
 let bookmarks=[];try{bookmarks=JSON.parse(localStorage.getItem('heerlen-apv-bookmarks')||'[]');}catch{}
 const saved=new Set((Array.isArray(bookmarks)?bookmarks:[]).filter(id=>data.rules.some(r=>r.id===id)));
 let page='apv',topic='all',expanded=false,lastRoute=null,toastTimer;
 const info={apv:['Algemene Plaatselijke Verordening','HET REGLEMENT','Lees de regels. Ken je grenzen. Maak het verhaal.','APV'],sancties:['Strafcategorieën','HANDHAVING & SANCTIES','Van een mondelinge waarschuwing tot een permanente verbanning.','Strafcategorieën'],algemeen:['Algemene regels','DE BASIS VAN ONZE COMMUNITY','Respect, realisme en gezond verstand. Dit spreken we met elkaar af.','Algemene regels'],discord:['Discord-regels','ONZE COMMUNITY','Ook buiten de stad houden we het respectvol. Deze regels gelden in onze Discord.','Discord-regels'],bewaard:['Bewaarde artikelen','JOUW NASLAGWERK','De artikelen die je hebt opgeslagen, snel weer bij de hand.','Bewaarde artikelen']};
 const topicNav=document.createElement('div');topicNav.className='amrp-regulation-topics';
 topicNav.innerHTML='<div class="amrp-nav-label">APV ONDERWERPEN</div><nav aria-label="APV-onderwerpen">'+data.groups.map(g=>'<a href="/regels#apv/'+g.id+'"><i></i><span>'+escape(g.name)+'</span><small>'+g.count+'</small></a>').join('')+'</nav><a class="amrp-saved-link" href="/regels#bewaard">'+icon('bookmark')+'Bewaarde artikelen <small data-amrp-saved-count>'+saved.size+'</small></a>';
 topicNav.querySelectorAll('a').forEach(a=>a.setAttribute('data-amrp-route',''));
 document.querySelector('.amrp-sidebar nav[aria-label="Regelgeving"]')?.after(topicNav);
 $('topic-cards').innerHTML=data.groups.map(g=>'<a class="topic-card" href="/regels#apv/'+g.id+'" data-topic="'+g.id+'"><div class="topic-card-top"><span class="topic-icon">'+icon(g.icon)+'</span><span>'+g.count+' artikelen</span></div><strong>'+escape(g.name)+'<span>'+icon('arrow-right')+'</span></strong><p>'+escape(g.description)+'</p></a>').join('');
 for(let i=0;i<=9;i++)$('category').add(new Option('Categorie '+i,String(i)));
 $('category').add(new Option('Variabel / overige','var'));
 function categories(r){if(!/^Categorie/.test(r.sanctie))return ['var'];const value=r.sanctie.replace(/^Categorie\s*/,''),range=value.match(/^(\d+)\s*(?:-|t\/m)\s*(\d+)/);if(range)return Array.from({length:Number(range[2])-Number(range[1])+1},(_,i)=>String(Number(range[1])+i));return value.match(/\d+/g)||['var'];}
 function matches(r,query){if(!query)return true;const direct=query.match(/^(?:art(?:ikel)?\.?\s*)?(\d+[a-z]?)$/i);if(direct)return fold(r.num)===fold(direct[1]);const haystack=fold([r.num,r.title,r.sanctie||'',r.summary,r.content.replace(/<[^>]+>/g,' ')].join(' '));return fold(query).split(/\s+/).every(part=>haystack.includes(part));}
 function row(r,isApv){const level=r.catClass==='cat-var'?'var':Number((r.catClass||'cat0').replace('cat',''))<=2?'low':Number(r.catClass.replace('cat',''))<=4?'medium':'high';return '<article class="rule" id="amrp-r-'+r.id+'"><details><summary><span class="rule-number">'+escape(r.title==='Belangrijk'?'!':r.num)+'</span><div class="rule-title"><h3>'+escape(r.title)+'</h3><p>'+escape(r.summary)+'</p></div>'+(isApv?'<span class="sanction-badge" data-level="'+level+'">'+escape(r.sanctie)+'</span>':'')+'<span class="rule-chevron">'+icon('chevron')+'</span></summary><div class="rule-body">'+r.content+'<div class="rule-toolbar">'+(isApv?'<button type="button" data-save="'+r.id+'" class="'+(saved.has(r.id)?'saved':'')+'" aria-pressed="'+saved.has(r.id)+'">'+icon('bookmark')+'<span>'+(saved.has(r.id)?'Bewaard':'Artikel bewaren')+'</span></button>':'')+'<button type="button" data-copy="'+r.id+'">'+icon('link')+'Link kopiëren</button></div></div></details></article>';}
 function updateExpand(){const details=[...$('rules-list').querySelectorAll('details')];$('expand-all').querySelector('span:last-child').textContent=details.length&&details.every(d=>d.open)?'Alles inklappen':'Alles uitklappen';$('expand-all').disabled=!details.length;}
 function updateSaved(){topicNav.querySelector('[data-amrp-saved-count]').textContent=saved.size;}
 function render(){
  const isApv=['apv','bewaard'].includes(page),query=$('search').value.trim(),cat=$('category').value;
  $('main').classList.toggle('page-only',page!=='apv');$('hero').hidden=page!=='apv';$('topic-cards').hidden=page!=='apv';
  $('section-title').firstChild.textContent=page==='apv'&&topic!=='all'?data.groups.find(g=>g.id===topic).name:info[page][0];$('section-eyebrow').textContent=info[page][1];$('section-description').textContent=info[page][2];
  $('category').parentElement.hidden=!isApv;$('source-note').hidden=page!=='sancties';$('expand-all').hidden=page==='sancties';$('list-hint').hidden=page==='sancties';
  $('search').placeholder=page==='sancties'?'Zoek een categorie, sanctie of omschrijving…':isApv?'Zoek op artikel, onderwerp of trefwoord…':'Zoek in de '+(page==='discord'?'Discord-regels':'algemene regels')+'…';
  let filtered;
  if(page==='sancties'){filtered=data.sanctions.filter(s=>fold(s.join(' ')).includes(fold(query)));$('rules-list').innerHTML='<table class="sanction-table"><thead><tr><th scope="col">Categorie</th><th scope="col">Sanctie</th><th scope="col">Omschrijving</th></tr></thead><tbody>'+filtered.map(s=>'<tr>'+s.map(v=>'<td>'+escape(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table><div class="sanctions-followup"><strong>Strafverzwaring</strong><p>Bij herhaling wordt de straf met een categorie verhoogd (Categorie 1 → 2 → 3, etc.).</p></div>';}
  else {const source=isApv?data.rules:page==='discord'?data.discord:data.general;filtered=source.filter(r=>(page!=='bewaard'||saved.has(r.id))&&(topic==='all'||!isApv||r.group===topic)&&(!isApv||cat==='all'||categories(r).includes(cat))&&matches(r,query));$('rules-list').innerHTML=filtered.map(r=>row(r,isApv)).join('');$('rules-list').querySelectorAll('details').forEach(d=>{d.open=expanded;d.addEventListener('toggle',updateExpand);});}
  $('heading-count').textContent=filtered.length;$('result-count').textContent=filtered.length+' '+(page==='sancties'?'categorie'+(filtered.length!==1?'ën':''):isApv?'artikel'+(filtered.length!==1?'en':''):'regel'+(filtered.length!==1?'s':''));
  $('active-filters').innerHTML=(topic!=='all'&&isApv?'<button type="button" class="filter-chip" data-clear-topic>'+escape(data.groups.find(g=>g.id===topic).name)+icon('close')+'</button>':'')+(cat!=='all'&&isApv?'<button type="button" class="filter-chip" data-clear-category>'+escape(cat==='var'?'Variabel / overige':'Categorie '+cat)+icon('close')+'</button>':'');
  $('rules-list').hidden=!filtered.length;$('empty-state').hidden=!!filtered.length;$('empty-state').querySelector('h3').textContent=page==='bewaard'&&!saved.size?'Nog geen bewaarde artikelen':'Geen regels gevonden';
  $('empty-description').textContent=page==='bewaard'&&!saved.size?'Open een APV-artikel en klik op ‘Artikel bewaren’. Je vindt het daarna hier.':'Probeer een ander trefwoord of pas je filters aan.';
  $('reset-filters').textContent=page==='bewaard'&&!saved.size?'Naar de APV':'Filters wissen';
  host.querySelectorAll('[data-topic]').forEach(a=>a.classList.toggle('active',a.dataset.topic===topic));
  topicNav.querySelectorAll('a').forEach(a=>{const active=a.hash==='#'+page+(topic!=='all'?'/'+topic:'');a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  const crumb=document.querySelector('[data-amrp-current]');if(crumb)crumb.textContent=info[page][3];const section=document.querySelector('.amrp-crumb>span');if(section)section.textContent='Regelgeving';
  document.querySelectorAll('.amrp-sidebar nav[aria-label="Regelgeving"] a').forEach(a=>{if(a.hash==='#'+page)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  updateSaved();updateExpand();document.title=info[page][3]+' · Heerlen Roleplay';
 }
 function sync(){
  const active=location.pathname==='/regels'||location.pathname==='/regels/';host.hidden=!active;topicNav.hidden=!active;
  document.documentElement.toggleAttribute('data-amrp-regulations',active);if(!active){lastRoute=null;return;}
  const route=location.pathname+location.hash;if(route===lastRoute)return;const wasActive=lastRoute!==null;lastRoute=route;
  let hash;try{hash=decodeURIComponent(location.hash.slice(1));}catch{hash='apv';}
  const target=[...data.rules,...data.general,...data.discord].find(r=>r.id===hash),parts=hash.split('/');
  page=target?(target.id.startsWith('artikel-')?'apv':target.id.startsWith('algemeen-')?'algemeen':'discord'):info[parts[0]]?parts[0]:'apv';topic=page==='apv'&&data.groups.some(g=>g.id===parts[1])?parts[1]:'all';
  $('search').value='';$('category').value='all';expanded=false;render();
  if(target){const article=$(target.id);article.querySelector('details').open=true;requestAnimationFrame(()=>{article.scrollIntoView({block:'center'});article.querySelector('summary').focus({preventScroll:true});});}
  else if(wasActive)window.scrollTo({top:0,behavior:'instant'});
 }
 $('search').addEventListener('input',()=>{expanded=false;render();});$('category').addEventListener('change',()=>{expanded=false;render();});
 $('expand-all').addEventListener('click',()=>{const details=[...$('rules-list').querySelectorAll('details')];expanded=!details.every(d=>d.open);details.forEach(d=>d.open=expanded);updateExpand();});
 $('active-filters').addEventListener('click',event=>{if(event.target.closest('[data-clear-topic]')){topic='all';history.replaceState(history.state,'','/regels/#apv');lastRoute=location.pathname+location.hash;}if(event.target.closest('[data-clear-category]'))$('category').value='all';render();});
 $('reset-filters').addEventListener('click',()=>{if(page==='bewaard'&&!saved.size){location.hash='apv';return;}$('search').value='';$('category').value='all';topic='all';expanded=false;render();$('search').focus();});
 function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2800);}
 $('rules-list').addEventListener('click',async event=>{const save=event.target.closest('[data-save]'),copy=event.target.closest('[data-copy]');
  if(save){const id=save.dataset.save;if(saved.has(id))saved.delete(id);else saved.add(id);try{localStorage.setItem('heerlen-apv-bookmarks',JSON.stringify([...saved]));}catch{}save.setAttribute('aria-pressed',saved.has(id));save.classList.toggle('saved',saved.has(id));save.querySelector('span').textContent=saved.has(id)?'Bewaard':'Artikel bewaren';updateSaved();toast(saved.has(id)?'Artikel bewaard in deze browser.':'Artikel verwijderd uit je bewaarde artikelen.');if(page==='bewaard')render();}
  if(copy){const url=new URL('/regels/#'+copy.dataset.copy,location.origin);try{await navigator.clipboard.writeText(url.href);toast('Link naar deze regel gekopieerd.');}catch{history.replaceState(history.state,'',url.href);toast('De artikellink staat nu in de adresbalk.');}}
 });
 document.addEventListener('keydown',event=>{if(host.hidden)return;const editing=/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)||event.target.isContentEditable;if(event.key==='/'&&!editing){event.preventDefault();$('search').focus();$('search').scrollIntoView({block:'center'});}});
 let printState=[];window.addEventListener('beforeprint',()=>{if(host.hidden)return;printState=[...$('rules-list').querySelectorAll('details')].map(d=>[d,d.open]);printState.forEach(([d])=>d.open=true);});window.addEventListener('afterprint',()=>{printState.forEach(([d,open])=>d.open=open);printState=[];});$('print-button').addEventListener('click',()=>window.print());
 window.addEventListener('hashchange',()=>{sync();window.amsterdamHeerlenDesign?.refresh();});window.addEventListener('popstate',sync);
 window.heerlenRegulations={sync};sync();
})();
