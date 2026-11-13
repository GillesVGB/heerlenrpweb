# Fantasy / Heerlen Roleplay website

De site is statische HTML, CSS en JavaScript met Vercel Functions voor gedeeld beheer. De bestaande uitstraling, winkel, Tebex/Cfx-login en coin-levering blijven in de huidige projectstructuur staan.

## Mappen

- `api/` — Vercel API-routes voor content, beheer, Discord OAuth en FiveM-status.
- `faq/` — doorzoekbare FAQ over whitelist, regels, aankopen en support.
- `data/initial-content.json` — volledige beginsnapshot van de bestaande drie regelboeken; versie 1 blijft als eerste gepubliceerde versie bewaard.
- `images/` — bestaande logo-, banner-, video- en winkelafbeeldingen.
- `nieuws/`, `updates/`, `staff/`, `events/`, `solliciteren/`, `helpcentrum/`, `profiel/` — losse pagina’s met eigen `index.html`.
- `scripts/` — bestaande winkel/sitecode; nieuwe browsercode staat gescheiden in `scripts/admin/` en `scripts/content/`.
- `server/` — sessiebeveiliging, Discord-rollen en gedeelde data-opslag.
- `styles/` — bestaande vormgeving plus losse content-, CMS- en communitystyles.
- `winkel/` en `hl-tebexwrapper/` — bestaande Tebex-winkel en FiveM resource.

## Lokaal

1. Kopieer `.env.example` naar `.env.local` en vul `ADMIN_PASSWORD` en `SESSION_SECRET` in voor lokaal wachtwoordbeheer.
2. Voer `npm install` uit als je de PostgreSQL- of Blob-opslag lokaal wilt testen.
3. Start `npm run preview` en open de URL die de terminal toont. De lokale preview bewaart beheerinhoud in `data/local-content.json`.

De preview werkt zonder Discord- of databasegeheimen, maar Discord-login vraagt de echte OAuth/bot-configuratie. Voeg geen geheime waarden toe aan Git.

## Vercel

Vercel installeert de dependencies uit `package.json` en bouwt de beginsnapshot met `npm run build`. Koppel voor gedeelde blijvende inhoud `DATABASE_URL` aan PostgreSQL. Een private Vercel Blob-store werkt als alternatief, maar PostgreSQL is aanbevolen wanneer meerdere medewerkers tegelijk kunnen wijzigen. Zonder gedeelde opslag geven de API-routes een fout terug in plaats van te doen alsof schrijfacties blijvend zijn.

Stel de variabelen uit `.env.example` in als geheime Vercel Environment Variables. Registreer in Discord exact `DISCORD_REDIRECT_URI` als OAuth2 redirect. De bot moet lid zijn van dezelfde guild en toegang hebben tot guildleden.

## CMS

Open `/admin.html`. Beheer kan via Discord met rol `1568033014384951366` of via het sterk ingestelde `ADMIN_PASSWORD`. De rol `1567581357004038184` krijgt alleen `staff:read` en geen beheerrechten; de openbare staffdirectory is voor iedereen toegankelijk. Discord-rollen worden server-side opnieuw opgehaald bij elk beschermd verzoek, zodat gewijzigde rollen meteen gelden. Optionele rollen met beperkte rechten configureer je met de `DISCORD_*_ROLE_ID` variabelen hierboven. Community-items, sollicitaties, beoordelingen, meldingen, reacties, profielen en onderscheidingen gaan naar de gedeelde opslag. Aanvraagbestanden zijn beperkt tot PDF/PNG/JPEG/WebP tot 400 KB; contentopslag blijft begrensd op 4 MB.

Bewoners loggen in via Discord op `/dashboard/`. Een profiel is standaard privé; inwoners kunnen per profielveld openbaar delen instellen. Evenementaanmeldingen, sollicitaties en persoonlijke meldingen zijn alleen met de eigenaarssessie beschikbaar. Nieuwe communitypagina’s zijn `/events/`, `/solliciteren/` en `/helpcentrum/`; openbare profielen staan op `/profiel/?id=...`.

De shopinstellingen worden gedeeld opgeslagen zodat categorieën, productnamen en Tebex-package-ID's op de apparaten van bezoekers gelijk zijn. De overige FiveM-velden blijven lokale browserinstellingen.

Voor live serverstatus gebruiken de homepage en `/server-statistieken/` dezelfde statusroute. Standaard gebruikt die de CFX-joincode `j48ry5k`. Een eerder ingestelde legacy-waarde `CFX_JOIN_CODE=5oayqbr` wordt genegeerd; andere expliciete `CFX_JOIN_CODE`-waarden blijven ondersteund. Voor directe status via FiveM `dynamic.json`, vul in Vercel `FIVEM_SERVER_HOST` in met de actuele publieke serverhost en optioneel `FIVEM_SERVER_PORT` (standaard `30120`). De statusroute accepteert geen host uit een browserverzoek; zonder directe host probeert hij alleen de ingestelde CFX-joincode. Als geen statusbron bereikbaar is, toont de site een onbekende status in plaats van een verzonnen spelersaantal. De grafiek op de statistiekenpagina tekent echte metingen die lokaal in de browser zijn verzameld terwijl de pagina openstaat; die gegevens worden maximaal 24 uur lokaal bewaard en zijn geen gedeelde serverhistorie.

De FAQ staat op `/faq/`. Whitelist-aanmeldvoorwaarden kunnen wijzigen en zijn daarom bewust niet als vaste voorwaarden op de website vastgelegd; de FAQ verwijst hiervoor naar de actuele Discord-instructies.

## Shop-login en checkout

Log eerst in op `/admin.html`, vul bij **Tebex + hl-tebexwrapper** de publieke Headless API-token/webstore-ID in en klik op **Opslaan**. Daarna kan iedere bezoeker in de winkel via **Inloggen** met Cfx.re aanmelden. Maak extra Tebex-pakketten eerst in Tebex Creator aan; voeg daarna in het Shop-tabblad een categorie toe en koppel het pakket met het Tebex package-ID. De prijs en pakketafbeelding worden uit Tebex gelezen. Publiceer de wijzigingen met **Opslaan**. Gebruik voor productie de gedeelde PostgreSQL- of private Blob-opslag; zonder die opslag kan de hosting de instellingen niet blijvend publiceren.

## Controles

- `npm run test:cms` controleert lokale login, oorsprongsbeveiliging, serverrechten, communityprofielprivacy, formulier- en sollicitatietoegang, evenementcapaciteit, reacties/moderatie, nieuws publiceren, staffrechten en onveranderbare APV-versies.
- `npm run test:server-status` en `npm run test:server-statistics` controleren de live statusroute en de pagina met serverstatistieken.
- FiveM-status, live Discord OAuth en gedeelde Vercel-opslag vragen externe hostingtoegang en secrets; die zijn niet met de lokale workflowtest geverifieerd.
"# heerlenrpweb" 
