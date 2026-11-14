local function reply(source, message, color)
    TriggerClientEvent('chat:addMessage', source, {
        color = color or { 80, 170, 255 },
        multiline = true,
        args = { 'Heerlen Roleplay', message }
    })
end

RegisterCommand('koppelaccount', function(source, args)
    if source == 0 then
        print('[hlrp_account_link] Gebruik dit commando in-game als speler.')
        return
    end
    local code = string.upper(tostring(args[1] or ''))
    if not string.match(code, '^[A-F0-9][A-F0-9][A-F0-9][A-F0-9][A-F0-9][A-F0-9][A-F0-9][A-F0-9][A-F0-9][A-F0-9]$') then
        reply(source, 'Gebruik /koppelaccount CODE. Maak eerst een code aan in je inwonersdashboard.')
        return
    end

    local endpoint = GetConvar('hlrp_account_link_url', 'https://heerlenrp.nl/api/fivem/link')
    local secret = GetConvar('hlrp_account_link_secret', '')
    if string.sub(endpoint, 1, 8) ~= 'https://' or secret == '' then
        print('[hlrp_account_link] Stel hlrp_account_link_url (HTTPS) en hlrp_account_link_secret in server.cfg in.')
        reply(source, 'De accountkoppeling is tijdelijk niet beschikbaar. Meld dit bij staff.', { 235, 100, 100 })
        return
    end

    local license
    for _, identifier in ipairs(GetPlayerIdentifiers(source)) do
        if string.sub(identifier, 1, 8) == 'license:' then license = identifier break end
    end
    if not license then
        reply(source, 'FiveM gaf geen geldig speler-ID terug. Probeer opnieuw of neem contact op met staff.', { 235, 100, 100 })
        return
    end
    local playerName = GetPlayerName(source) or 'Inwoner'
    PerformHttpRequest(endpoint, function(status, responseText)
        if status ~= 200 then
            local message
            local ok, data = pcall(json.decode, responseText or '')
            if status == 409 then
                message = ok and data and data.error or 'De code is ongeldig, verlopen of al gebruikt.'
                reply(source, message .. ' Maak zo nodig een nieuwe code aan op het inwonersdashboard.', { 235, 100, 100 })
            elseif status == 401 then
                print('[hlrp_account_link] Website-authenticatie geweigerd (HTTP 401). Controleer of het servergeheim overeenkomt met FIVEM_LINK_SECRET in Vercel.')
                reply(source, 'De koppeling is niet goed ingesteld. Meld dit bij staff.', { 235, 100, 100 })
            elseif status >= 300 and status < 400 then
                print('[hlrp_account_link] De website stuurde een redirect (HTTP ' .. tostring(status) .. '). Gebruik https://heerlenrp.nl/api/fivem/link zonder www in server.cfg.')
                reply(source, 'De websitekoppeling gebruikt een verouderd adres. Meld dit bij staff.', { 235, 100, 100 })
            elseif status == 0 then
                print('[hlrp_account_link] Geen verbinding met de website. Controleer DNS, firewall en de HTTPS-URL.')
                reply(source, 'De website is tijdelijk niet bereikbaar. Probeer het later opnieuw.', { 235, 100, 100 })
            elseif status == 503 then
                print('[hlrp_account_link] De websitekoppeling is niet geconfigureerd of de gedeelde opslag is niet beschikbaar (HTTP 503).')
                reply(source, 'De accountkoppeling is tijdelijk niet beschikbaar. Meld dit bij staff.', { 235, 100, 100 })
            else
                print('[hlrp_account_link] Onverwachte websitefout (HTTP ' .. tostring(status) .. ').')
                reply(source, 'De accountkoppeling is mislukt. Probeer het later opnieuw.', { 235, 100, 100 })
            end
            return
        end
        reply(source, 'Je personage ' .. playerName .. ' is gekoppeld aan je websiteaccount.')
    end, 'POST', json.encode({ code = code, license = license, name = playerName }), {
        ['Content-Type'] = 'application/json',
        ['Authorization'] = 'Bearer ' .. secret
    })
end, false)
