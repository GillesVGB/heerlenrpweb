(function(){
  "use strict";
  var labels={news_published:"Nieuws gepubliceerd",site_update_published:"Website-update gepubliceerd",notice_published:"Communitymededeling gepubliceerd",event_published:"Evenement gepubliceerd",event_changed:"Evenement bijgewerkt",event_cancelled:"Evenement geannuleerd",application_submitted:"Nieuwe sollicitatie",application_status_changed:"Sollicitatiestatus gewijzigd",ticket_opened:"Supportticket geopend"};
  var list=document.getElementById("discordAutomationList"),history=document.getElementById("discordAutomationHistory");
  if(!list||!history)return;
  var controls=document.getElementById("discordAutomationControls");
  var content={},user={};
  function request(body){return fetch("/api/admin",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||"Actie mislukt.");return d})})}
  function load(){return fetch("/api/admin",{credentials:"same-origin",cache:"no-store"}).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||"Instellingen laden mislukt.");return d})}).then(function(d){content=d.content||{};user=d.user||{};render()})}
  function render(){
    var allowed=(user.permissions||[]).includes("notifications:manage");
    if(controls)controls.hidden=!allowed;
    list.replaceChildren();history.replaceChildren();
    Object.keys(labels).forEach(function(type){
      var setting=(content.discordAutomations||{})[type]||{};
      var card=document.createElement("article");card.className="cms-list-item is-static discord-automation-card";
      var title=document.createElement("strong");title.textContent=labels[type];card.appendChild(title);
      var toggleLabel=document.createElement("label");toggleLabel.className="check";var toggle=document.createElement("input");toggle.type="checkbox";toggle.checked=setting.enabled===true;toggle.dataset.enabled=type;toggleLabel.append(toggle,document.createTextNode("Actief"));card.appendChild(toggleLabel);
      var hook=document.createElement("input");hook.type="password";hook.autocomplete="new-password";hook.maxLength=300;hook.placeholder=setting.configured?"Webhook staat ingesteld · leeg laten om te behouden":"https://discord.com/api/webhooks/...";hook.dataset.webhook=type;card.appendChild(hook);
      var template=document.createElement("textarea");template.rows=2;template.maxLength=900;template.value=setting.template||"";template.placeholder="Template: {title}, {summary}, {url}, {actor}, {category}";template.dataset.template=type;card.appendChild(template);
      var actions=document.createElement("div");actions.className="cms-actions";var test=document.createElement("button");test.type="button";test.className="btn btn-ghost";test.textContent="Testbericht";test.dataset.test=type;var save=document.createElement("button");save.type="button";save.className="btn btn-blue";save.textContent="Opslaan";save.dataset.save=type;var state=document.createElement("span");state.className="cms-message";state.setAttribute("role","status");state.dataset.state=type;actions.append(test,save,state);card.appendChild(actions);list.appendChild(card);
    });
    (content.automationHistory||[]).slice(0,50).forEach(function(run){var row=document.createElement("div");row.className="cms-list-item is-static";var name=document.createElement("strong");name.textContent=run.label||labels[run.type]||run.type;var detail=document.createElement("span");detail.textContent=run.title+" · "+run.status+(run.error?" · "+run.error:"")+" · "+new Date(run.updatedAt).toLocaleString("nl-NL");row.append(name,detail);if(run.status==="failed"&&(Number(run.attempts)||0)<3&&allowed){var retry=document.createElement("button");retry.type="button";retry.className="btn btn-ghost";retry.textContent="Opnieuw proberen";retry.dataset.retry=run.id;row.appendChild(retry)}history.appendChild(row)});
    if(!history.children.length)history.textContent="Er zijn nog geen automatische Discord-meldingen verstuurd.";
  }
  list.addEventListener("click",function(event){var button=event.target.closest("button");if(!button)return;var type=button.dataset.save||button.dataset.test;if(type){var state=list.querySelector('[data-state="'+type+'"]');state.textContent=button.dataset.save?"Opslaan…":"Testen…";var webhook=list.querySelector('[data-webhook="'+type+'"]').value.trim();var promise=button.dataset.save?request({action:"save-discord-automation",type:type,enabled:list.querySelector('[data-enabled="'+type+'"]').checked,webhookUrl:webhook,template:list.querySelector('[data-template="'+type+'"]').value}):request({action:"test-discord-automation",type:type,webhookUrl:webhook});promise.then(function(){state.textContent=button.dataset.save?"Instellingen opgeslagen.":"Testbericht verzonden.";if(button.dataset.save)return load()}).catch(function(error){state.textContent=error.message})}});
  history.addEventListener("click",function(event){var button=event.target.closest("[data-retry]");if(!button)return;button.disabled=true;request({action:"retry-discord-automation",id:button.dataset.retry}).then(load).catch(function(error){button.disabled=false;button.title=error.message})});
  window.addEventListener("heerlen:admin-loaded",function(event){var detail=event.detail||{};content=detail.content||{};user=detail.user||{};render()});
  load().catch(function(error){var line=document.getElementById("automationLoadState");if(line)line.textContent=error.message});
})();
