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

    local endpoint = GetConvar('hlrp_account_link_url', 'https://www.heerlenrp.nl/api/fivem/link')
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
            local message = 'De code is ongeldig, verlopen of al gebruikt.'
            local ok, data = pcall(json.decode, responseText or '')
            if ok and data and data.error then message = data.error end
            reply(source, message .. ' Maak een nieuwe code aan op de website.', { 235, 100, 100 })
            return
        end
        reply(source, 'Je personage ' .. playerName .. ' is gekoppeld aan je websiteaccount.')
    end, 'POST', json.encode({ code = code, license = license, name = playerName }), {
        ['Content-Type'] = 'application/json',
        ['Authorization'] = 'Bearer ' .. secret
    })
end, false)
