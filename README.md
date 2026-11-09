# Fantasy / Heerlen Roleplay website

De site is statische HTML, CSS en JavaScript met Vercel Functions voor gedeeld beheer. De bestaande uitstraling, winkel, Tebex/Cfx-login en coin-levering blijven in de huidige projectstructuur staan.

## Mappen

- `api/` — Vercel API-routes voor content, beheer, Discord OAuth en FiveM-status.
- `data/initial-content.json` — volledige beginsnapshot van de bestaande drie regelboeken; versie 1 blijft als eerste gepubliceerde versie bewaard.
- `images/` — bestaande logo-, banner-, video- en winkelafbeeldingen.
- `nieuws/`, `updates/`, `staff/` — losse pagina’s met eigen `index.html`.
- `scripts/` — bestaande winkel/sitecode; nieuwe browsercode staat gescheiden in `scripts/admin/` en `scripts/content/`.
- `server/` — sessiebeveiliging, Discord-rollen en gedeelde data-opslag.
- `styles/` — bestaande vormgeving plus losse `content.css` en `cms.css`.
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

Open `/admin.html`. Beheer kan via Discord met rol `1568033014384951366` of via het sterk ingestelde `ADMIN_PASSWORD`. De rol `1567581357004038184` geeft alleen toegang tot `/staff/`; deze rol krijgt geen beheerrechten. Discord-rollen worden server-side opnieuw opgehaald bij elk beschermd verzoek, zodat gewijzigde rollen meteen gelden. Nieuws, updates, profielen, regelconcepten, gepubliceerde regelversies en het logboek gaan naar de gedeelde opslag.

De overige shop- en FiveM-velden blijven lokale browserinstellingen. De publieke Tebex-token en pakket-ID's worden gedeeld opgeslagen zodat de winkel op de apparaten van bezoekers dezelfde instellingen gebruikt.

## Shop-login en checkout

Log eerst in op `/admin.html`, vul bij **Tebex + hl-tebexwrapper** de publieke Headless API-token/webstore-ID in en klik op **Opslaan**. Daarna kan iedere bezoeker in de winkel via **Inloggen** met Cfx.re aanmelden. Voor aankopen moeten ook de Tebex package-ID's van de producten in dezelfde adminsectie worden ingevuld en gepubliceerd. Gebruik voor productie de gedeelde PostgreSQL- of private Blob-opslag; zonder die opslag kan de hosting de instellingen niet blijvend publiceren.

## Controles

- `npm run test:cms` controleert lokale login, oorsprongsbeveiliging, serverrechten, nieuws publiceren, staffrechten en onveranderbare APV-versies.
- FiveM-status, live Discord OAuth en gedeelde Vercel-opslag vragen externe hostingtoegang en secrets; die zijn niet met de lokale workflowtest geverifieerd.
"# heerlenrpweb" 
