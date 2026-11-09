# Inventaris bestaande scripts

De bestaande bestanden zijn vooraf geïnventariseerd. Behalve de expliciet genoemde koppelingen en navigatie zijn ze behouden; nieuwe CMS-code staat in eigen submappen.

## Bestaande scripts

- `scripts/_serve.js` — lokale statische preview en bestaande lokale FiveM-statusproxy; uitgebreid met dezelfde nieuwe API-routes voor preview.
- `scripts/_gen-products.js` — genereert de bestaande coinproductpagina’s.
- `scripts/admin.js` — bestaande adminvelden, Tebex-package commands, instellingen, koopmeldingen en lokale autosave; alleen login is omgezet naar een beveiligde servercookie.
- `scripts/auth.js` — bestaande Cfx.re- en Tebex-loginweergave en spelersaankopen.
- `scripts/cart.js` — bestaande winkelmand, checkout en terugkeer na betaling.
- `scripts/catalog.js` — statische productcatalogus en coinpakketdata.
- `scripts/live.js` — bestaande FiveM-spelertelling, fallback en aankooppopups.
- `scripts/faq.js` — doorzoekbare FAQ-filter zonder extra library.
- `scripts/nav.js` — bestaande thema- en mobiele navigatie; uitgebreid met de nieuwe pagina-links.
- `scripts/regels.js` — bestaande documenttabs, inhoudsnavigatie en artikelwissels; inhoudsnavigatie ververst nu na een gepubliceerde regelversie.
- `scripts/settings.js` — bestaande standaardinstellingen en lokale instellingenopslag.
- `scripts/store.js` — bestaande productkaarten, filters en winkelinteractie.
- `scripts/tebex.js` — bestaande Tebex Headless API, basket/checkout en Cfx-koppeling.
- `hl-tebexwrapper/` — bestaande FiveM Tebex-resource; niet aangepast.

## Nieuwe servercode

- `api/admin.mjs` — serverlogin, role checks, CMS-mutaties en auditlog.
- `api/auth/discord.mjs`, `api/auth/callback.mjs` — Discord OAuth2 en server-side guildrolcontrole.
- `api/content.mjs` — alleen publiek gepubliceerde nieuws- en regelversies.
- `api/players.mjs` — Vercel FiveM-statusproxy; directe host komt alleen uit server-side configuratie en CFX-lookup gebruikt de geconfigureerde joincode.
- `server/security.mjs` — HMAC-sessies, HttpOnly-cookie, oorsprongscontrole en Discordrol-permissies.
- `server/content-store.mjs` — lokale JSON-ontwikkeling, PostgreSQL met versiecontrole, of private Vercel Blob als alternatief.
- `server/http.mjs` — gedeelde JSON-responses, inputlimieten en validatie.
- `scripts/admin/content-manager.js` — beheerinterface voor nieuws, updates, staff en regelversies.
- `scripts/content/public-content.js` — veilige rendering van gepubliceerd nieuws/updates, rolafgeschermde staff en regelversiegeschiedenis.
- `scripts/build-initial-content.mjs` — neemt de huidige regels één keer als volledige beginversie over.
- `scripts/test-cms-workflows.mjs` — lokale workflowchecks voor auth, rollen, publicatie en APV-archief.
