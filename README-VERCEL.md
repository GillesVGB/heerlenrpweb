# Heerlen Roleplay — Vercel deploy

This deploy folder keeps the public website separate from the server-only API and CMS data. The build creates dist/ from the existing pages and generates data/initial-content.json from regels.html.

## Vercel project settings

- Root Directory: this project folder (the folder containing package.json).
- Framework Preset: Other.
- Build Command: npm run build (already in vercel.json).
- Output Directory: dist (already in vercel.json).
- Unknown routes show the branded `404.html` from the build output with HTTP 404. No catch-all rewrite is used, so existing pages and API routes keep their normal routing.
- Install Command: leave Vercel's default.
- Enable Web Analytics in Project → Analytics. Public pages load Vercel's HTML analytics script; the admin panel is excluded. This is a plain HTML site, so the documented HTML integration does not require the `@vercel/analytics` package or a React component.

## Required environment variables

Copy the keys and public values from .env.example into Vercel → Project → Settings → Environment Variables. Set them for Production; also set Preview if Discord login should work on preview URLs. Do not upload .env.local or commit secret values.

Required for persistent CMS/admin changes:
- Supabase: set `SUPABASE_URL` to the project URL and `SUPABASE_SERVICE_ROLE_KEY` to the server-side service role key. Never use the anon key for this private CMS store. Run `docs/supabase-content-store.sql` once in the Supabase SQL Editor to create the table.
- Or, for Neon only, set `DATABASE_URL` to the Neon pooled PostgreSQL connection string. The app creates its single content table when first used.
- SESSION_SECRET: a fresh random string, at least 32 characters.
- PUBLIC_ORIGIN=https://www.heerlenrp.nl
- DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI, DISCORD_GUILD_ID, DISCORD_BOT_TOKEN.
- ADMIN_PASSWORD: optional password fallback; use at least 12 characters. Discord admin role login is preferred.

BLOB_READ_WRITE_TOKEN is an alternative persistent store if PostgreSQL is not used. Do not set both unless you intend PostgreSQL to take priority.

If `/api/content` or admin saves return HTTP 503, check the selected provider's environment variables in Vercel Production and verify the database is reachable. For Supabase, confirm the table setup SQL was run. Redeploy after changing variables. The API intentionally keeps returning 503 while shared storage is unavailable; it does not switch to temporary serverless disk storage, so admin changes cannot be saved until the database connection works.

## Shop and Tebex sales

Site administrators can edit product names, descriptions, coin amounts, and the shop promo from the admin panel's **Shop** tab. Product package IDs and the public Headless API token are managed there as well. The storefront synchronizes mapped package base prices and reads active sales and package/category data from Tebex's public Headless API; only unconditional percentage or fixed-amount sales are shown as fixed discounted prices. Sales with customer or basket requirements remain controlled by Tebex at checkout. Use the public Headless API token from Tebex Integrations; never put a Tebex secret key in the site settings.

To add extra storefront categories and products, first create the category/package in Tebex Creator. In the admin panel's **Shop** tab, add a category, then add the package using its Tebex package ID and choose that category. Its price, image, and eligible Tebex sales are read from the public Headless API; **Lees meer** opens the package's generated detail page. Publish the shop changes with **Opslaan**.

The shop shows recent payments for all visitors using Tebex's public sidebar data. To show the all-time top donor, add the Tebex **Private Key** from Creator → Developers → API Keys to Vercel as `TEBEX_CHECKOUT_API_KEY`, then redeploy. Keep it server-side; it is never sent to the browser.

## FiveM server status

The homepage and `/server-statistieken/` read status from `/api/players`. The route uses the CFX join code `j48ry5k` by default and never accepts a server host from a browser request. A stale legacy `CFX_JOIN_CODE=5oayqbr` value is ignored; other explicit `CFX_JOIN_CODE` values remain supported. For direct `dynamic.json` status, set `FIVEM_SERVER_HOST` to the current public FiveM server host in Vercel Environment Variables. `FIVEM_SERVER_PORT` is optional and defaults to `30120`. The optional direct host should be verified by the server owner before deployment. If it is unset or unreachable, the route falls back to the CFX listing/join-code lookup. If all status sources fail, the site displays an unavailable status rather than a fabricated online state or player count. The statistics chart records measured values locally in the visitor's browser while the page is open and retains them there for up to 24 hours; it is not shared server history or uptime data. Redeploy after changing these values.

## Inwonersdashboard and staff directory

`/dashboard/` uses the existing Discord OAuth app and requires membership in the configured Discord guild. The signed, HttpOnly dashboard session is separate from the Cfx.re/Tebex shop login. An authenticated resident can save an optional in-game name; admins can manage dashboard distinctions, grant them by Discord ID, publish community notices, and inspect saved profile IDs in the **Inwoners** admin tab. These private profile fields and award assignments are returned only from authenticated APIs. The public `/staff/` directory uses active profiles managed in the existing **Staff** admin tab and does not expose their Discord IDs. No additional polling service or database table is introduced; resident data uses the existing shared content store.

The searchable player Helpcentrum is available at `/helpcentrum/`; the former `/faq/` route redirects there. Whitelist details are kept linked to the current Discord instructions because the repository does not contain authoritative application requirements.

## Generate a SESSION_SECRET in Windows PowerShell

$bytes = [byte[]]::new(48)
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)

Paste the generated value directly into Vercel Environment Variables. Do not save production secrets in this folder.

## Discord settings

Add this exact OAuth2 Redirect URL in the Discord Developer Portal:

https://www.heerlenrp.nl/api/auth/callback

Register the redirect URL above both in the Discord Developer Portal and as `DISCORD_REDIRECT_URI` in Vercel. The canonical site domain is `www.heerlenrp.nl`; the apex domain redirects there. The configured admin role 1568033014384951366 grants site management. The configured staff role 1567581357004038184 grants read access to protected staff APIs; the public staff directory itself is available to all visitors. Ensure the bot is in the configured Discord server and can read member roles. Verify the guild and role IDs belong to the Heerlen server.

## Domain and deploy

Connect heerlenrp.nl to this Vercel project under Project → Settings → Domains. After all Production environment variables are saved, redeploy so the functions receive them.

Static image and video assets are cached for one day; HTML and API responses keep their own cache behavior.

## Kept outside this Vercel website deploy

hl-tebexwrapper is a FiveM server resource, not a Vercel website asset. Keep and install it separately on the FiveM server; it is intentionally not exposed as public website files. Local .env.local, .vercel authentication/link files, and data/local-content.json are also excluded. Use the database or private Blob storage for shared persistent CMS content.
