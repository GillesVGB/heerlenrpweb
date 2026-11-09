# Projectstructuur

De mapindeling houdt de bestaande websitepaden in stand en groepeert nieuwe code per verantwoordelijkheid. De oorspronkelijke winkel-, Tebex- en FiveM-scripts blijven op hun bestaande paden staan.

```text
/
├── api/                       # Vercel Functions: beheer, content, Discord en spelersstatus
│   └── auth/                  # Discord OAuth-start en callback
├── data/                      # Beginsnapshot van de bestaande regelboeken
├── docs/                      # Inventaris en projectdocumentatie
├── images/                    # Bestaande site-, banner- en winkelmedia
├── nieuws/                    # Openbare nieuwspagina
├── staff/                     # Rolafgeschermde staffpagina
├── updates/                   # Openbare changelogpagina
├── winkel/                    # Bestaande winkelpagina's en productbestanden
├── hl-tebexwrapper/           # Bestaande FiveM Tebex-resource
├── scripts/
│   ├── admin/                 # Browsercode voor het CMS-beheer
│   ├── content/               # Publieke contentrendering
│   ├── _serve.js              # Lokale previewserver; behoudt lokale API- en statusroutes
│   └── overige bestaande js/  # Bestaande site-, auth-, cart-, Tebex- en productlogica
├── server/                    # Gedeelde authenticatie, validatie en data-opslag
├── styles/                    # Bestaande styling plus content.css en cms.css
├── admin.html                 # Beheerpaneel
├── index.html                 # Bestaande homepage
└── regels.html                # Bestaande regels; versiegeschiedenis is toegevoegd
```

Vercel verwacht de mappen `api/` en `server/` op deze vaste paden. De bestaande HTML- en scripts-paden zijn ook bewust behouden om de oude pagina's, Tebex-koppeling en scripts niet te breken.
