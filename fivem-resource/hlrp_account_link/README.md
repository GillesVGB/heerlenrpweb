# Heerlen Roleplay account-link resource

This resource lets a player link the Discord account used for the HeerlenRP resident dashboard to their FiveM license. It sends the temporary one-time code, the server-side `license:` identifier, and the in-game name to the website over HTTPS.

## Website configuration

Set `FIVEM_LINK_SECRET` in the production environment of the website host to a unique random value with at least 32 characters. Never put this value in browser code, a public repository, or a client-side FiveM script.

## FiveM server configuration

Place this folder in the server's resources directory, then add the following to `server.cfg` with the *same* secret as the website environment variable:

```cfg
set hlrp_account_link_url "https://heerlenrp.nl/api/fivem/link"
set hlrp_account_link_secret "REPLACE_WITH_THE_SAME_PRIVATE_RANDOM_SECRET"
ensure hlrp_account_link
```

Keep `server.lua` server-side. Do not add a `client.lua` that forwards identifiers or the secret.

## Player flow

1. Sign in to the resident dashboard with Discord.
2. Open **FiveM-account** and generate a temporary code.
3. Join the game and run `/koppelaccount CODE` in chat before the code expires (10 minutes).
4. The dashboard will show the linked character name. The code can only be used once.

An administrator with `users:manage` can unlink a character from the administration panel. A resident can unlink their own character from the dashboard.
