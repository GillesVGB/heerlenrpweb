(function(){
  "use strict";
  var cards=document.getElementById("communityStatCards");
  var board=document.getElementById("communityLeaderboard");
  var status=document.getElementById("communityStatsStatus");
  if(!cards||!board)return;
  document.querySelectorAll("[data-year]").forEach(function(el){el.textContent=String(new Date().getFullYear())});
  function el(tag,className,text){var node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node}
  fetch("/api/community-stats",{headers:{Accept:"application/json"}}).then(function(response){return response.json().then(function(data){if(!response.ok)throw new Error(data.error||"Communitystatistieken konden niet worden geladen.");return data})}).then(function(data){
    cards.replaceChildren();
    [["Openbare profielen",data.stats.publicProfiles],["Onderscheidingen",data.stats.publicAchievements],["Aankomende evenementen",data.stats.publishedEvents],["Nieuwsberichten",data.stats.publishedNews]].forEach(function(item){var card=el("article","community-stat-card");card.append(el("strong","",item[1]));card.append(el("span","",item[0]));cards.append(card)});
    board.replaceChildren();
    if(!data.leaderboard.length){board.append(el("p","community-empty","Er zijn nog geen openbare prestaties om te tonen."));return}
    data.leaderboard.forEach(function(person){var row=el("article","community-rank-row");var rank=el("span","community-rank-number",String(person.rank).padStart(2,"0"));var identity=el("div","community-rank-identity");if(person.avatar){var avatar=el("img","community-rank-avatar");avatar.src=person.avatar;avatar.alt="";avatar.loading="lazy";identity.append(avatar)}var names=el("div");names.append(el("strong","",person.inGameName||person.username));if(person.inGameName)names.append(el("span","community-muted","@"+person.username));identity.append(names);row.append(rank,identity,el("strong","community-rank-score",person.achievements+" "+(person.achievements===1?"onderscheiding":"onderscheidingen")));board.append(row)});
  }).catch(function(error){cards.replaceChildren();board.replaceChildren();if(status)status.textContent=error.message});
})();
