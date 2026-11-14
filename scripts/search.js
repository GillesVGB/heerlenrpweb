(function(){
  "use strict";
  var form=document.getElementById("siteSearchForm");
  var input=document.getElementById("siteSearchQuery");
  var type=document.getElementById("siteSearchType");
  var status=document.getElementById("siteSearchStatus");
  var results=document.getElementById("siteSearchResults");
  if(!form||!input||!results)return;
  document.querySelectorAll("[data-year]").forEach(function(el){el.textContent=String(new Date().getFullYear())});
  function render(data){
    results.replaceChildren();
    if(!data.results.length){status.textContent="Geen openbare resultaten gevonden.";return}
    status.textContent=data.results.length+" resultaat"+(data.results.length===1?"":"en")+" voor ‘"+data.query+"’.";
    data.results.forEach(function(item){
      var a=document.createElement("a");a.className="site-search-result";a.href=item.url;
      var label=document.createElement("small");label.textContent=item.label;
      var title=document.createElement("strong");title.textContent=item.title;
      var excerpt=document.createElement("span");excerpt.textContent=item.excerpt;
      a.append(label,title,excerpt);results.appendChild(a);
    });
  }
  function search(){
    var query=input.value.trim();if(query.length<2){status.textContent="Voer minimaal twee tekens in om te zoeken.";results.replaceChildren();return}
    status.textContent="Zoeken…";
    fetch("/api/search?q="+encodeURIComponent(query)+"&type="+encodeURIComponent(type.value),{headers:{Accept:"application/json"}})
      .then(function(response){return response.json().then(function(data){if(!response.ok)throw new Error(data.error||"Zoeken is mislukt.");return data})})
      .then(render).catch(function(error){status.textContent=error.message;results.replaceChildren()});
  }
  form.addEventListener("submit",function(event){event.preventDefault();search()});
  var params=new URLSearchParams(location.search);if(params.has("q")){input.value=params.get("q").slice(0,120);if(params.has("type"))type.value=params.get("type");search()}
})();
