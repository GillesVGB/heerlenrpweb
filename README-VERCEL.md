# Heerlen Roleplay — Vercel deploy

This deploy folder keeps the public website separate from the server-only API and CMS data. The build creates dist/ from the existing pages and generates data/initial-content.json from regels.html.

## Vercel project settings

- Root Directory: this project folder (the folder containing package.json).
- Framework Preset: Other.
- Build Command: npm run build (already in vercel.json).
- Output Directory: dist (already in vercel.json).
- Install Command: leave Vercel's default.

## Required environment variables

Copy the keys and public values from .env.example into Vercel → Project → Settings → Environment Variables. Set them for Production; also set Preview if Discord login should work on preview URLs. Do not upload .env.local or commit secret values.

Required for persistent CMS/admin changes:
- DATABASE_URL: Neon pooled PostgreSQL connection string. The app creates its single content table when first used.
- SESSION_SECRET: a fresh random string, at least 32 characters.
- PUBLIC_ORIGIN=https://www.heerlenrp.nl
- DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI, DISCORD_GUILD_ID, DISCORD_BOT_TOKEN.
- ADMIN_PASSWORD: optional password fallback; use at least 12 characters. Discord admin role login is preferred.

BLOB_READ_WRITE_TOKEN is an alternative persistent store if PostgreSQL is not used. Do not set both unless you intend PostgreSQL to take priority.

If `/api/content` or admin saves return HTTP 503 with a database-connection message, check that `DATABASE_URL` is the current Neon pooled connection string and is enabled for the Production environment. Verify the Neon project is active and reachable, then redeploy the Vercel project. The API intentionally keeps returning 503 while shared storage is unavailable; it does not switch to temporary serverless disk storage, so admin changes cannot be saved until the database connection works.

## Generate a SESSION_SECRET in Windows PowerShell

$bytes = [byte[]]::new(48)
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)

Paste the generated value directly into Vercel Environment Variables. Do not save production secrets in this folder.

## Discord settings

Add this exact OAuth2 Redirect URL in the Discord Developer Portal:

https://www.heerlenrp.nl/api/auth/callback

Register the redirect URL above both in the Discord Developer Portal and as `DISCORD_REDIRECT_URI` in Vercel. The canonical site domain is `www.heerlenrp.nl`; the apex domain redirects there. The configured admin role 1568033014384951366 grants site management. The configured staff role 1567581357004038184 grants staff-page access only. Ensure the bot is in the configured Discord server and can read member roles. Verify the guild and role IDs belong to the Heerlen server.

## Domain and deploy

Connect heerlenrp.nl to this Vercel project under Project → Settings → Domains. After all Production environment variables are saved, redeploy so the functions receive them.

Static image and video assets are cached for one day; HTML and API responses keep their own cache behavior.

## Kept outside this Vercel website deploy

hl-tebexwrapper is a FiveM server resource, not a Vercel website asset. Keep and install it separately on the FiveM server; it is intentionally not exposed as public website files. Local .env.local, .vercel authentication/link files, and data/local-content.json are also excluded. Use the database or private Blob storage for shared persistent CMS content.
