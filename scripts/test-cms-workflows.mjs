import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unlink } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

process.env.SESSION_SECRET = 'cms-workflow-test-session-secret-not-for-production';
process.env.ADMIN_PASSWORD = 'cms-workflow-test-password-not-for-production';
process.env.CONTENT_STORE_PATH = path.join(tmpdir(), `heerlen-cms-test-${process.pid}.json`);
const originalPublicOrigin = process.env.PUBLIC_ORIGIN;

const [{ default: admin }, { default: content }, { default: avatar }, { default: donations }, { default: portal }, { default: community }, { default: discordCallback }, { makeSession, permissionsForRoleIds, readSession, sessionCookie, setOAuthState, validateOAuthState, verifyOrigin }] = await Promise.all([
  import('../api/admin.mjs'), import('../api/content.mjs'), import('../api/avatar.mjs'), import('../api/donations.mjs'), import('../api/portal.mjs'), import('../api/community.mjs'), import('../api/auth/callback.mjs'), import('../server/security.mjs')
]);
const base = 'http://127.0.0.1:8765';
const origin = { origin: base, 'content-type': 'application/json' };
const run = (handler, method, payload, cookie) => handler(new Request(base + '/api/admin', {
  method,
  headers: { ...origin, ...(cookie ? { cookie } : {}) },
  ...(method === 'GET' ? {} : { body: JSON.stringify(payload || {}) })
}));
const runPortal = (method, payload, cookie, requestOrigin = base) => portal(new Request(base + '/api/portal', {
  method,
  headers: { origin: requestOrigin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  ...(method === 'GET' ? {} : { body: JSON.stringify(payload || {}) })
}));
const runCommunity = (method, payload, cookie) => community(new Request(base + '/api/community', {
  method,
  headers: { origin: base, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  ...(method === 'GET' ? {} : { body: JSON.stringify(payload || {}) })
}));

const dashboardPage = await readFile(new URL('../dashboard/index.html', import.meta.url), 'utf8');
const dashboardClient = await readFile(new URL('./resident-dashboard.js', import.meta.url), 'utf8');
const staffPage = await readFile(new URL('../staff/index.html', import.meta.url), 'utf8');
const adminPage = await readFile(new URL('../admin.html', import.meta.url), 'utf8');
const adminStyles = await readFile(new URL('../styles/admin.css', import.meta.url), 'utf8');
const adminClient = await readFile(new URL('./admin/content-manager.js', import.meta.url), 'utf8');
const communityAdminClient = await readFile(new URL('./admin/community-manager.js', import.meta.url), 'utf8');
const publicContentScript = await readFile(new URL('./content/public-content.js', import.meta.url), 'utf8');
const eventsPage = await readFile(new URL('../events/index.html', import.meta.url), 'utf8');
const applicationsPage = await readFile(new URL('../solliciteren/index.html', import.meta.url), 'utf8');
const helpPage = await readFile(new URL('../helpcentrum/index.html', import.meta.url), 'utf8');
const faqPage = await readFile(new URL('../faq/index.html', import.meta.url), 'utf8');
const profilePage = await readFile(new URL('../profiel/index.html', import.meta.url), 'utf8');
assert.match(adminPage, /data-admin-section="overview"/, 'The admin panel opens on a dashboard overview');
assert.match(adminPage, /data-admin-section="settings" hidden/, 'The site settings stay hidden until selected so they cannot overlap the overview');
assert.match(adminPage, /class="admin-overview-profile"/, 'The overview has the Heerlen identity header');
assert.match(adminPage, /class="admin-overview-stats"/, 'The overview shows real dashboard statistic cards');
assert.match(adminPage, /data-section="overview"/, 'The admin dashboard is reachable from its sidebar navigation');
assert.match(adminPage, /id="adminOverviewStatus"/, 'The admin dashboard exposes the live server summary');
assert.match(adminClient, /fetch\("\/api\/players"/, 'The admin dashboard uses the existing live server status endpoint');
assert.match(adminClient, /data\.stale \? "Online · laatst bekend"/, 'The admin dashboard marks retained status as stale');
assert.match(adminClient, /gecontroleerd /, 'The admin dashboard displays the server status check time');
assert.match(adminPage, /id="supportTicketPanel"/, 'The admin dashboard provides a private support inbox');
assert.match(adminPage, /id="adminOverviewSupport"/, 'Support managers see open ticket counts in the admin overview');
assert.match(communityAdminClient, /manage-support-ticket/, 'Support staff can reply and update ticket status');
assert.match(dashboardPage, /id="supportTicketForm"/, 'Residents can submit support requests from their dashboard');
assert.match(dashboardClient, /create-support-ticket/, 'Resident support requests use the authenticated dashboard API');
assert.match(adminPage, /data-section="community"/, 'the admin panel exposes community management');
assert.match(communityAdminClient, /save-community-record/, 'community admins can manage content through the CMS');
assert.match(communityAdminClient, /review-application/, 'authorized staff can review applications');
assert.match(eventsPage, /data-community-page="events"/, 'the public events page is included');
assert.match(applicationsPage, /data-community-page="jobs"/, 'the dynamic application page is included');
assert.match(helpPage, /<h1>Helpcentrum<\/h1>/, 'the public Helpcentrum contains the FAQ answers');
assert.match(helpPage, /id="faqList"/, 'the Helpcentrum retains searchable FAQ entries');
assert.match(helpPage, /id="communityCards"/, 'the Helpcentrum also displays CMS-managed guide articles');
assert.match(faqPage, /http-equiv="refresh" content="0;url=\/helpcentrum\/"/, 'the legacy FAQ URL redirects to the single Helpcentrum page');
assert.match(profilePage, /data-community-page="profile"/, 'public resident profiles have a dedicated page');
assert.match(adminStyles, /#cmsTabs[\s\S]*?position: sticky/, 'Admin sections use persistent side navigation on desktop');
assert.match(adminStyles, /color: var\(--blue\)/, 'The redesigned admin dashboard keeps the existing site accent color');
assert.match(dashboardPage, /id="residentWorkspace" hidden/, 'resident dashboard details stay hidden until authentication succeeds');
assert.match(dashboardPage, /noindex,nofollow/, 'personal dashboard pages are excluded from search indexing');
assert.match(dashboardPage, /api\/auth\/discord\?next=%2Fdashboard%2F/, 'resident login requests a dashboard-scoped Discord session');
assert.match(dashboardClient, /fetch\("\/api\/portal"/, 'dashboard profile data comes from its authenticated server API');
assert.doesNotMatch(staffPage, /noindex,nofollow|Stafflogin vereist|staffLock/, 'the staff directory is public and discoverable without a staff session');
assert.match(publicContentScript, /if \(page === "staff"\)\s*\{\s*loadPublicContent\(\)\.then\(function \(data\) \{ showStaff\(data\); \}\)/, 'the public staff directory reads the sanitized public content feed');

try {
  process.env.PUBLIC_ORIGIN = 'https://heerlenrp.nl';
  assert.equal(verifyOrigin(new Request('https://www.heerlenrp.nl/api/admin', { headers: { origin: 'https://www.heerlenrp.nl' } })), true, 'canonical www domain is accepted when configured origin is apex');
  assert.equal(verifyOrigin(new Request('https://heerlenrp.nl/api/admin', { headers: { origin: 'https://heerlenrp.nl' } })), true, 'apex domain remains accepted');
  assert.equal(verifyOrigin(new Request('https://attacker.example/api/admin', { headers: { origin: 'https://attacker.example' } })), false, 'unrelated origins remain rejected');
  if (originalPublicOrigin === undefined) delete process.env.PUBLIC_ORIGIN;
  else process.env.PUBLIC_ORIGIN = originalPublicOrigin;
  const oauthState = setOAuthState(new Request(base), '/dashboard/');
  assert.equal(validateOAuthState(new Request(base, { headers: { cookie: oauthState.cookie } }), oauthState.nonce), '/dashboard/', 'Discord OAuth state preserves a signed dashboard destination');
  const tamperedOAuthState = setOAuthState(new Request(base), '/not-allowed/');
  assert.equal(validateOAuthState(new Request(base, { headers: { cookie: tamperedOAuthState.cookie } }), tamperedOAuthState.nonce), '/admin.html', 'unapproved OAuth destinations fall back to the admin page');
  const callbackEnvKeys = ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_REDIRECT_URI', 'DISCORD_GUILD_ID', 'DISCORD_BOT_TOKEN'];
  const callbackEnv = Object.fromEntries(callbackEnvKeys.map(key => [key, process.env[key]]));
  callbackEnvKeys.forEach((key, index) => { process.env[key] = `test-${index}`; });
  const callbackFetch = globalThis.fetch;
  const dashboardOAuthState = setOAuthState(new Request(base), '/dashboard/');
  try {
    globalThis.fetch = async (url) => {
      if (String(url).endsWith('/oauth2/token')) return new Response(JSON.stringify({ access_token: 'resident-test-token' }), { status: 200 });
      if (String(url).endsWith('/users/@me')) return new Response(JSON.stringify({ id: '32345678901234567', username: 'PortalTest', global_name: 'Portal Inwoner', avatar: null }), { status: 200 });
      return new Response(JSON.stringify({ roles: [] }), { status: 200 });
    };
    const callbackResponse = await discordCallback(new Request(base + '/api/auth/callback?code=resident-code&state=' + encodeURIComponent(dashboardOAuthState.nonce), { headers: { cookie: dashboardOAuthState.cookie } }));
    assert.equal(callbackResponse.status, 302, 'Discord OAuth redirects after a successful resident login');
    assert.equal(new URL(callbackResponse.headers.get('location')).pathname, '/dashboard/', 'OAuth returns residents to the dashboard');
    const sessionCookieValue = callbackResponse.headers.getSetCookie().find(value => value.startsWith('heerlen_admin_session='))?.split(';')[0];
    assert.ok(sessionCookieValue, 'OAuth establishes a signed resident session');
    const callbackSession = readSession(new Request(base, { headers: { cookie: sessionCookieValue } }));
    assert.equal(callbackSession.id, '32345678901234567', 'the resident session is tied to the verified Discord ID');
    assert.deepEqual(callbackSession.permissions, [], 'ordinary Discord members do not gain staff or admin permissions');
    const residentAdminAccess = await run(admin, 'GET', undefined, sessionCookieValue);
    assert.equal(residentAdminAccess.status, 403, 'resident sessions cannot access the staff/admin CMS');
  } finally {
    globalThis.fetch = callbackFetch;
    callbackEnvKeys.forEach((key, index) => {
      if (callbackEnv[key] === undefined) delete process.env[key];
      else process.env[key] = callbackEnv[key];
    });
  }

  const wrongOrigin = await admin(new Request(base + '/api/admin', { method: 'POST', headers: { origin: 'https://untrusted.example', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'password-login', password: process.env.ADMIN_PASSWORD }) }));
  assert.equal(wrongOrigin.status, 403, 'cross-origin state changes are rejected');

  const unauthenticated = await run(admin, 'POST', { action: 'save', type: 'news', item: { title: 'No access', content: 'No' } });
  assert.equal(unauthenticated.status, 401, 'content writes require a session');

  const login = await run(admin, 'POST', { action: 'password-login', password: process.env.ADMIN_PASSWORD });
  assert.equal(login.status, 200, 'admin password login succeeds in configured local mode');
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const adminData = await run(admin, 'GET', undefined, cookie);
  assert.equal(adminData.status, 200, 'authenticated admin can read protected CMS data');
  const data = await adminData.json();
  assert.equal(data.content.rulesVersions[0].version, '1.0', 'complete source rules were migrated as version 1');
  assert.equal(data.content.rulesDraft.documents.length, 3, 'the APV and two code books are present in the draft');

  const created = await run(admin, 'POST', { action: 'save', type: 'news', item: { id: 'test-news', title: 'Testbericht', category: 'Nieuws', excerpt: 'Intro', content: 'Eerste alinea', status: 'published', commentsEnabled: true, publishAt: new Date(Date.now() - 1000).toISOString() } }, cookie);
  assert.equal(created.status, 200, 'news can be created: ' + JSON.stringify(await created.clone().json()));
  const staffProfile = await run(admin, 'POST', { action: 'save', type: 'staff', item: { id: 'test-staff', name: 'Test Staff', username: 'teststaff', category: 'Support', role: 'Support', bio: 'Helpt inwoners.', discordId: '12345678901234567', order: 1, active: true, joinedAt: '2025-01-15T00:00:00.000Z' } }, cookie);
  assert.equal(staffProfile.status, 200, 'admins can manage a public staff profile');
  const publicData = await content(new Request(base + '/api/content'));
  const publicBody = await publicData.json();
  assert.equal(publicBody.news[0].id, 'test-news', 'published news is visible publicly');
  assert.equal('auditLog' in publicBody, false, 'private audit data is not part of the public feed');
  assert.equal(Array.isArray(publicBody.staff), true, 'active staff profiles are available to the public staff directory');
  assert.equal(publicBody.staff[0].id, 'test-staff', 'active profiles are returned in staff display order');
  assert.equal(publicBody.staff[0].joinedAt, '2025-01-15T00:00:00.000Z', 'the public staff directory includes the optional join date');
  assert.equal('discordId' in publicBody.staff[0], false, 'public staff data never exposes Discord account IDs');

  const residentSession = makeSession({ id: '12345678901234567', username: 'InwonerTest', avatar: 'https://cdn.discordapp.com/avatars/12345678901234567/test.png', roles: [], permissions: [], provider: 'discord' });
  const residentCookie = sessionCookie(residentSession, { url: base + '/api/portal' }).split(';')[0];
  const residentBefore = await runPortal('GET', undefined, residentCookie);
  assert.equal(residentBefore.status, 200, 'a Discord member without staff roles can open their own dashboard');
  assert.equal((await residentBefore.json()).profile.inGameName, '', 'new resident profiles start with no optional in-game name');
  const savedProfile = await runPortal('POST', { action: 'save-profile', inGameName: 'Test Personage' }, residentCookie);
  assert.equal(savedProfile.status, 200, 'residents can save their own profile');
  assert.equal((await savedProfile.json()).profile.inGameName, 'Test Personage');
  const publicProfileSave = await runPortal('POST', { action: 'save-profile', profile: { inGameName: 'Test Personage', bio: 'Ik speel graag in Heerlen.', isPublic: true, showBio: true, showInGameName: true, showAchievements: true } }, residentCookie);
  assert.equal(publicProfileSave.status, 200, 'residents can select public profile visibility and field-level privacy');
  const otherResidentCookie = sessionCookie(makeSession({ id: '22345678901234567', username: 'AndereInwoner', provider: 'discord', roles: [], permissions: [] }), { url: base + '/api/portal' }).split(';')[0];
  const thirdResidentCookie = sessionCookie(makeSession({ id: '32345678901234567', username: 'DerdeInwoner', provider: 'discord', roles: [], permissions: [] }), { url: base + '/api/portal' }).split(';')[0];
  const supportCreated = await runPortal('POST', { action: 'create-support-ticket', subject: 'Bestelling controleren', category: 'Aankoop', content: 'Mijn bestelling is niet zichtbaar.' }, residentCookie);
  assert.equal(supportCreated.status, 201, 'residents can create a private support ticket');
  const supportTicketId = (await supportCreated.json()).ticketId;
  const ownerTickets = (await (await runPortal('GET', undefined, residentCookie)).json()).supportTickets;
  assert.equal(ownerTickets.length, 1, 'ticket owners can read their own support conversation');
  assert.equal(ownerTickets[0].messages[0].content, 'Mijn bestelling is niet zichtbaar.');
  assert.equal('discordId' in ownerTickets[0], false, 'resident ticket views omit account identifiers');
  assert.equal('authorId' in ownerTickets[0].messages[0], false, 'resident ticket messages omit account identifiers');
  const otherResidentTickets = (await (await runPortal('GET', undefined, otherResidentCookie)).json()).supportTickets;
  assert.equal(otherResidentTickets.length, 0, 'residents cannot read another account support tickets');
  const crossAccountReply = await runPortal('POST', { action: 'reply-support-ticket', ticketId: supportTicketId, content: 'Ongeautoriseerde reactie' }, otherResidentCookie);
  assert.equal(crossAccountReply.status, 400, 'residents cannot reply to another account support ticket');
  const supportRoleOnlyCookie = sessionCookie(makeSession({ id: 'support-staff', username: 'SupportStaff', permissions: ['support:manage'], provider: 'test' }), { url: base + '/api/admin' }).split(';')[0];
  const supportAdminData = await run(admin, 'GET', undefined, supportRoleOnlyCookie);
  assert.equal(supportAdminData.status, 200, 'support-only staff can read the support inbox');
  const supportAdminBody = await supportAdminData.json();
  assert.equal(supportAdminBody.content.supportTickets[0].id, supportTicketId);
  assert.equal(supportAdminBody.content.applications, undefined, 'support-only staff cannot read unrelated application data');
  const regularStaffCookie = sessionCookie(makeSession({ id: 'regular-staff', username: 'RegularStaff', permissions: ['staff:read'], provider: 'test' }), { url: base + '/api/admin' }).split(';')[0];
  const regularStaffData = await run(admin, 'GET', undefined, regularStaffCookie);
  assert.equal(regularStaffData.status, 200);
  assert.equal((await regularStaffData.json()).content.supportTickets, undefined, 'staff without support permission cannot access support conversations');
  const deniedSupportReply = await run(admin, 'POST', { action: 'manage-support-ticket', id: supportTicketId, status: 'waiting', message: 'Geen rechten' }, regularStaffCookie);
  assert.equal(deniedSupportReply.status, 403, 'staff without support permission cannot answer tickets');
  const supportReply = await run(admin, 'POST', { action: 'manage-support-ticket', id: supportTicketId, status: 'waiting', message: 'Kun je je bestelnummer sturen?' }, supportRoleOnlyCookie);
  assert.equal(supportReply.status, 200, 'support staff can reply and change ticket status');
  const updatedResidentTickets = (await (await runPortal('GET', undefined, residentCookie)).json()).supportTickets;
  assert.equal(updatedResidentTickets[0].status, 'waiting', 'staff ticket status is reflected in the resident dashboard');
  assert.equal(updatedResidentTickets[0].messages[1].author, 'Supportteam', 'staff responses are visible to the ticket owner');
  assert.equal((await (await runPortal('GET', undefined, residentCookie)).json()).notifications[0].type, 'support', 'staff responses create a private resident notification');
  const supportAudit = (await (await run(admin, 'GET', undefined, cookie)).json()).content.auditLog;
  assert.equal(supportAudit[0].itemType, 'supportticket', 'support replies are added to the protected activity log');
  const otherResident = await runPortal('GET', undefined, otherResidentCookie);
  assert.equal((await otherResident.json()).profile.inGameName, '', 'resident profile reads are isolated by Discord account');
  assert.equal((await runCommunity('GET')).status, 401, 'community dashboard data requires a Discord session');
  const crossOriginPortalWrite = await runPortal('POST', { action: 'save-profile', inGameName: 'Overgenomen' }, residentCookie, 'https://attacker.example');
  assert.equal(crossOriginPortalWrite.status, 403, 'resident profile writes reject cross-origin requests');
  const oversizedResidentName = await runPortal('POST', { action: 'save-profile', inGameName: 'x'.repeat(81) }, residentCookie);
  assert.equal(oversizedResidentName.status, 400, 'resident profile fields are validated server-side');
  const anonymousPortal = await runPortal('GET');
  assert.equal(anonymousPortal.status, 401, 'resident data requires a valid Discord session');
  const profileFeed = await content(new Request(base + '/api/content'));
  const profileFeedBody = await profileFeed.json();
  assert.equal(profileFeedBody.profiles.length, 1, 'only opted-in profiles are included in the public feed');
  assert.equal(profileFeedBody.supportTickets, undefined, 'support conversations are never exposed in the public content feed');
  assert.equal(profileFeedBody.profiles[0].bio, 'Ik speel graag in Heerlen.', 'public profiles respect selected visible fields');
  assert.equal('discordId' in profileFeedBody.profiles[0], false, 'public profiles never expose Discord IDs');

  const formSaved = await run(admin, 'POST', { action: 'save-community-record', type: 'applicationForms', item: {
    id: 'helper-form', title: 'Sollicitatieformulier', description: 'Vertel ons over jezelf.', status: 'published',
    sections: [{ id: 'about', title: 'Over jou', description: 'Een paar vragen.' }],
    questions: [
      { id: 'about-you', title: 'Vertel iets over jezelf', type: 'long', required: true, sectionId: 'about', maxLength: 300, privateKey: 'must-not-publish' },
      { id: 'attachment', title: 'CV', type: 'file', required: false }
    ]
  } }, cookie);
  assert.equal(formSaved.status, 200, 'admins can publish versioned application forms');
  const jobSaved = await run(admin, 'POST', { action: 'save-community-record', type: 'jobs', item: {
    id: 'helper-job', title: 'Communityhelper', description: 'Help nieuwe spelers.', formId: 'helper-form', status: 'published'
  } }, cookie);
  assert.equal(jobSaved.status, 200, 'admins can publish jobs linked to published application forms');
  const invalidWebhook = await run(admin, 'POST', { action: 'save-community-record', type: 'jobs', item: {
    id: 'helper-job', title: 'Communityhelper', description: 'Help nieuwe spelers.', formId: 'helper-form', status: 'published',
    webhookUrl: 'https://attacker.example/collect'
  } }, cookie);
  assert.equal(invalidWebhook.status, 400, 'job webhooks reject non-Discord URLs');
  const webhookUrl = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz123456';
  const savedWebhook = await run(admin, 'POST', { action: 'save-community-record', type: 'jobs', item: {
    id: 'helper-job', title: 'Communityhelper', description: 'Help nieuwe spelers.', formId: 'helper-form', status: 'published', webhookUrl
  } }, cookie);
  assert.equal(savedWebhook.status, 200, 'job managers can connect a Discord webhook to a vacancy');
  const eventSaved = await run(admin, 'POST', { action: 'save-community-record', type: 'events', item: {
    id: 'community-event', title: 'Communityavond', startsAt: new Date(Date.now() + 86400000).toISOString(), capacity: 1, status: 'published'
  } }, cookie);
  assert.equal(eventSaved.status, 200, 'admins can publish events with a capacity');
  const featureFeed = await content(new Request(base + '/api/content'));
  const featureFeedBody = await featureFeed.json();
  assert.equal(featureFeedBody.jobs[0].id, 'helper-job', 'published jobs appear in the public feed');
  assert.equal(featureFeedBody.jobs[0].webhookEnabled, true, 'public vacancy data indicates when answers will also be sent to Discord');
  assert.equal(JSON.stringify(featureFeedBody.jobs).includes(webhookUrl), false, 'vacancy webhooks are never exposed in public content');
  assert.equal(featureFeedBody.events[0].id, 'community-event', 'published events appear in the public feed');
  assert.equal('privateKey' in featureFeedBody.applicationForms[0].questions[0], false, 'public application forms use a strict question-field allowlist');
  assert.equal(featureFeedBody.applicationForms[0].questions[0].sectionId, 'about', 'public application forms preserve sanitized question-section relationships');
  let webhookRequest;
  const originalWebhookFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    webhookRequest = { url: String(url), body: options.body };
    return new Response(null, { status: 204 });
  };
  let submittedApplication;
  try {
    submittedApplication = await runCommunity('POST', {
      action: 'submit-application', jobId: 'helper-job',
      answers: { 'about-you': 'Ik help graag nieuwe spelers.', 'attachment': 'data:application/pdf;base64,JVBERi0=' }
    }, residentCookie);
  } finally {
    globalThis.fetch = originalWebhookFetch;
  }
  assert.equal(submittedApplication.status, 201, 'residents can submit valid applications');
  assert.equal((await submittedApplication.clone().json()).webhook.delivered, true, 'successful Discord webhook deliveries are reported');
  assert.equal(webhookRequest.url, webhookUrl, 'application submission posts only to the configured Discord webhook');
  const webhookPayload = JSON.parse(webhookRequest.body.get('payload_json'));
  assert.deepEqual(webhookPayload.allowed_mentions, { parse: [] }, 'application webhooks cannot trigger Discord mentions');
  assert.equal(webhookRequest.body.get('files[0]').name, 'sollicitatie.txt', 'the webhook receives a readable file with all application answers');
  assert.equal(webhookRequest.body.get('files[1]').name, 'attachment.pdf', 'uploaded application files are attached to the webhook');
  const updatedForm = await run(admin, 'POST', { action: 'save-community-record', type: 'applicationForms', item: {
    id: 'helper-form', title: 'Sollicitatieformulier', description: 'Vertel ons over jezelf.', status: 'published',
    sections: [{ id: 'about', title: 'Over jou', description: 'Een paar vragen.' }],
    questions: [
      { id: 'about-you', title: 'Vertel meer over jezelf', type: 'long', required: true, maxLength: 300 },
      { id: 'attachment', title: 'CV', type: 'file', required: false }
    ]
  } }, cookie);
  assert.equal((await updatedForm.json()).item.version, 2, 'form edits create a new form version');
  const applicationState = await run(admin, 'GET', undefined, cookie);
  const storedApplication = (await applicationState.json()).content.applications[0];
  assert.equal(storedApplication.formVersion, 1, 'submitted applications retain their original form version');
  assert.equal(storedApplication.formSnapshot.questions[0].title, 'Vertel iets over jezelf', 'submitted applications preserve the original question snapshot');
  const residentCommunity = await runCommunity('GET', undefined, residentCookie);
  const residentCommunityBody = await residentCommunity.json();
  assert.equal(residentCommunityBody.applications.length, 1, 'residents can view their own application status');
  assert.equal('answers' in residentCommunityBody.applications[0], false, 'the resident status API omits private application answers');
  const otherResidentCommunity = await runCommunity('GET', undefined, otherResidentCookie);
  assert.equal((await otherResidentCommunity.json()).applications.length, 0, 'applications are isolated by Discord account');
  const invalidAnswer = await runCommunity('POST', { action: 'submit-application', jobId: 'helper-job', answers: {} }, otherResidentCookie);
  assert.equal(invalidAnswer.status, 400, 'required application questions are validated server-side');
  const firstRsvp = await runCommunity('POST', { action: 'event-rsvp', eventId: 'community-event' }, residentCookie);
  assert.equal((await firstRsvp.json()).status, 'going', 'the event capacity is reserved for the first resident');
  const secondRsvp = await runCommunity('POST', { action: 'event-rsvp', eventId: 'community-event' }, otherResidentCookie);
  assert.equal((await secondRsvp.json()).status, 'waitlist', 'event capacity overflow is placed on a waitlist');
  const thirdRsvp = await runCommunity('POST', { action: 'event-rsvp', eventId: 'community-event' }, thirdResidentCookie);
  assert.equal((await thirdRsvp.json()).status, 'waitlist', 'waitlisted residents retain their registration order');
  await runCommunity('POST', { action: 'event-rsvp', eventId: 'community-event', cancel: true }, otherResidentCookie);
  assert.equal((await runCommunity('GET', undefined, thirdResidentCookie)).status, 200, 'a waitlisted resident can cancel their own RSVP');
  const remainingRsvp = await runCommunity('POST', { action: 'event-rsvp', eventId: 'community-event' }, thirdResidentCookie);
  assert.equal((await remainingRsvp.json()).status, 'waitlist', 'cancelling a waitlist entry does not promote another resident into a full event');
  await runCommunity('POST', { action: 'event-rsvp', eventId: 'community-event', cancel: true }, residentCookie);
  const promotedResident = await runCommunity('GET', undefined, thirdResidentCookie);
  assert.equal((await promotedResident.json()).rsvps[0].status, 'going', 'the earliest waitlisted resident is promoted when a seat opens');
  const comment = await runCommunity('POST', { action: 'comment-create', newsId: 'test-news', content: 'Leuk bericht.' }, residentCookie);
  assert.equal(comment.status, 201, 'authenticated residents can comment on news that enables comments');
  let communityFeed = await (await content(new Request(base + '/api/content'))).json();
  assert.equal(communityFeed.news[0].comments[0].content, 'Leuk bericht.', 'public news comments contain only moderated public fields');
  const commentId = communityFeed.news[0].comments[0].id;
  const moderatedComment = await run(admin, 'POST', { action: 'moderate-comment', id: commentId, hidden: true }, cookie);
  assert.equal(moderatedComment.status, 200, 'admins can moderate a news comment');
  communityFeed = await (await content(new Request(base + '/api/content'))).json();
  assert.equal(communityFeed.news[0].comments.length, 0, 'hidden comments are excluded from the public feed');
  const review = await run(admin, 'POST', { action: 'review-application', id: residentCommunityBody.applications[0].id, status: 'interview', message: 'We nodigen je uit voor een gesprek.', note: 'Sterke motivatie.' }, cookie);
  assert.equal(review.status, 200, 'admins can review applications and send an applicant-facing status update: ' + JSON.stringify(await review.clone().json()));
  const updatedResident = await runCommunity('GET', undefined, residentCookie);
  const updatedResidentBody = await updatedResident.json();
  assert.equal(updatedResidentBody.applications[0].status, 'interview', 'application status updates are visible to the applicant');
  assert.equal(updatedResidentBody.notifications[0].type, 'application', 'applicant-facing review messages create private notifications');
  const readNotification = await runCommunity('POST', { action: 'notification-read', id: updatedResidentBody.notifications[0].id }, residentCookie);
  assert.equal(readNotification.status, 200, 'residents can mark their own notifications as read');

  const oldEventsRole = process.env.DISCORD_EVENTS_ROLE_ID;
  const oldSupportRole = process.env.DISCORD_SUPPORT_ROLE_ID;
  process.env.DISCORD_EVENTS_ROLE_ID = 'events-manager-role';
  assert.deepEqual(permissionsForRoleIds(['events-manager-role']), ['events:manage'], 'optional event roles receive only their configured least-privilege permission');
  if (oldEventsRole === undefined) delete process.env.DISCORD_EVENTS_ROLE_ID;
  else process.env.DISCORD_EVENTS_ROLE_ID = oldEventsRole;
  process.env.DISCORD_SUPPORT_ROLE_ID = 'support-manager-role';
  assert.deepEqual(permissionsForRoleIds(['support-manager-role']), ['support:manage'], 'optional support roles receive only their configured permission');
  if (oldSupportRole === undefined) delete process.env.DISCORD_SUPPORT_ROLE_ID;
  else process.env.DISCORD_SUPPORT_ROLE_ID = oldSupportRole;
  const eventManagerCookie = sessionCookie(makeSession({ id: 'event-manager', username: 'EventManager', permissions: ['events:manage'], provider: 'test' }), { url: base + '/api/admin' }).split(';')[0];
  const eventManagerData = await run(admin, 'GET', undefined, eventManagerCookie);
  assert.equal(eventManagerData.status, 200, 'an event-specific role can open the community CMS');
  const eventManagerContent = (await eventManagerData.json()).content;
  assert.equal(eventManagerContent.events.length, 1, 'event managers can view event data');
  assert.equal(eventManagerContent.applications, undefined, 'event managers cannot read applicant data');
  assert.equal(eventManagerContent.siteSettings, undefined, 'event managers cannot read site settings');
  const eventManagerDenied = await run(admin, 'POST', { action: 'save-community-record', type: 'jobs', item: { id: 'forbidden-job' } }, eventManagerCookie);
  assert.equal(eventManagerDenied.status, 403, 'event managers cannot edit unrelated community modules');

  const achievementSaved = await run(admin, 'POST', { action: 'save-achievement', item: { id: 'community-helper', title: 'Communityhelper', description: 'Helpt nieuwe inwoners op weg.', icon: '✦' } }, cookie);
  assert.equal(achievementSaved.status, 200, 'site admins can create dashboard achievements');
  const awardSaved = await run(admin, 'POST', { action: 'award-achievement', discordId: '12345678901234567', achievementId: 'community-helper' }, cookie);
  assert.equal(awardSaved.status, 200, 'site admins can award achievements');
  const restrictedUser = sessionCookie(makeSession({ id: 'limited-user', username: 'Limited', permissions: [], provider: 'test' }), { url: base + '/api/admin' }).split(';')[0];
  const deniedAward = await run(admin, 'POST', { action: 'award-achievement', discordId: '12345678901234567', achievementId: 'community-helper' }, restrictedUser);
  assert.equal(deniedAward.status, 403, 'achievement management checks admin permissions server-side');
  const noticeSaved = await run(admin, 'POST', { action: 'save-resident-notice', notice: { id: 'community-update', title: 'Communityupdate', message: 'Welkom in de stad.', active: true } }, cookie);
  assert.equal(noticeSaved.status, 200, 'site admins can publish resident dashboard notices');
  const residentAfter = await runPortal('GET', undefined, residentCookie);
  const residentDashboard = await residentAfter.json();
  assert.equal(residentDashboard.achievements[0].id, 'community-helper', 'only the signed-in resident receives their own awards');
  assert.equal(residentDashboard.notices[0].id, 'community-update', 'active resident notices appear on the dashboard');
  const otherDashboard = await runPortal('GET', undefined, otherResidentCookie);
  assert.deepEqual((await otherDashboard.json()).achievements, [], 'achievement data is not visible to other residents');
  const residentList = await run(admin, 'GET', undefined, cookie);
  assert.equal((await residentList.json()).content.residentProfiles.length, 1, 'resident management lists only saved profiles');
  await runPortal('POST', { action: 'save-profile', inGameName: 'Privé profiel' }, otherResidentCookie);
  const forcedPublic = await run(admin, 'POST', { action: 'moderate-profile', discordId: '22345678901234567', isPublic: true }, cookie);
  assert.equal(forcedPublic.status, 400, 'administrators cannot override a resident opt-in privacy choice');
  const logout = await runPortal('POST', { action: 'logout' }, residentCookie);
  assert.equal(logout.status, 200, 'resident logout clears the secure session');
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);

  const themeSettings = {
    seasonEnabled: true, seasonTheme: 'newyear', seasonAccentEnabled: true, seasonAccent: '#f0b44f', seasonEffects: true,
    seasonIntensity: 1.4, seasonSpeed: 1.2, seasonDensity: 22, seasonFrequency: 1.6,
    seasonPages: ['home', 'rules'], seasonStart: '2027-12-31T18:00', seasonEnd: '2028-01-01T23:59',
    tebexToken: 'public-token-test', tebexPackages: { 'coins-100': '12345' },
    shopProducts: { 'coins-100': { name: 'Test Coins', blurb: 'Aangepaste producttekst', amount: 150, bonus: 12, featured: true } },
    shopCategories: [{ id: 'cat-vehicles-a1b2c', name: 'Voertuigen' }],
    customShopProducts: [
      { id: 'custom-test-car', name: 'Test Auto', blurb: 'Een testpakket uit Tebex met een premium voertuig, aangepaste uitvoering en extra opties om je ervaring in Heerlen uit te breiden.', category: 'cat-vehicles-a1b2c', tebexId: '67890', featured: true, visible: true },
      { id: 'custom-hidden-car', name: 'Verborgen Auto', blurb: 'Niet zichtbaar voor bezoekers.', category: 'cat-vehicles-a1b2c', tebexId: '67891', featured: true, visible: false }
    ]
  };
  const savedTheme = await run(admin, 'POST', { action: 'save-site-settings', settings: themeSettings }, cookie);
  assert.equal(savedTheme.status, 200, 'site managers can publish seasonal theme settings');
  const themeFeed = await content(new Request(base + '/api/content'));
  const themeBody = await themeFeed.json();
  const publicTheme = themeBody.siteSettings;
  assert.equal(publicTheme.seasonTheme, 'newyear', 'the public feed returns the selected season');
  assert.equal(publicTheme.seasonIntensity, 1.4, 'theme intensity persists in shared storage');
  assert.equal(publicTheme.seasonFrequency, 1.6, 'theme animation frequency persists in shared storage');
  assert.deepEqual(publicTheme.seasonPages, ['home', 'rules'], 'page selection persists in shared storage');
  assert.equal(publicTheme.seasonAccent, '#f0b44f', 'custom theme accent persists in shared storage');
  assert.equal(publicTheme.seasonStart, '2027-12-31T18:00', 'theme schedule persists in shared storage');
  assert.equal(themeBody.storeSettings.tebexToken, 'public-token-test', 'public Tebex token is available to every shop visitor');
  assert.equal(themeBody.storeSettings.tebexPackages['coins-100'], '12345', 'Tebex package IDs persist in shared storage');
  assert.equal(themeBody.storeSettings.shopProducts['coins-100'].name, 'Test Coins', 'shop product edits persist in shared storage');
  assert.equal(themeBody.storeSettings.shopProducts['coins-100'].amount, 150, 'edited package coin amounts are published');
  assert.equal(themeBody.storeSettings.shopProducts['coins-100'].featured, true, 'featured coin packages are published');
  assert.equal(themeBody.storeSettings.shopCategories[0].name, 'Voertuigen', 'custom shop categories are published');
  assert.equal(themeBody.storeSettings.customShopProducts[0].tebexId, '67890', 'custom shop products retain their Tebex package ID');
  assert.equal(themeBody.storeSettings.customShopProducts[0].featured, true, 'featured custom packages are published');
  assert.equal(themeBody.storeSettings.customShopProducts[0].visible, true, 'custom products can remain visible');
  assert.equal(themeBody.storeSettings.customShopProducts[1].visible, false, 'hidden custom products retain their visibility state');
  const badTheme = await run(admin, 'POST', { action: 'save-site-settings', settings: { seasonTheme: 'unknown' } }, cookie);
  assert.equal(badTheme.status, 400, 'unknown seasonal themes are rejected server-side');
  const badPackage = await run(admin, 'POST', { action: 'save-site-settings', settings: { tebexPackages: { 'coins-100': 'not-an-id' } } }, cookie);
  assert.equal(badPackage.status, 400, 'invalid Tebex package IDs are rejected server-side');
  const badShopProduct = await run(admin, 'POST', { action: 'save-site-settings', settings: { shopProducts: { 'coins-100': { amount: 0 } } } }, cookie);
  assert.equal(badShopProduct.status, 400, 'invalid shop product values are rejected server-side');
  const badCustomProduct = await run(admin, 'POST', { action: 'save-site-settings', settings: { customShopProducts: [{ id: 'custom-bad', name: 'Fout pakket', category: 'coins', tebexId: 'not-an-id', blurb: '' }] } }, cookie);
  assert.equal(badCustomProduct.status, 400, 'invalid custom Tebex package IDs are rejected server-side');
  const badVisibility = await run(admin, 'POST', { action: 'save-site-settings', settings: { customShopProducts: [{ id: 'custom-bad', name: 'Fout pakket', category: 'coins', tebexId: '67890', visible: 'false' }] } }, cookie);
  assert.equal(badVisibility.status, 400, 'invalid custom product visibility is rejected server-side');
  const badSchedule = await run(admin, 'POST', { action: 'save-site-settings', settings: { seasonStart: '2028-01-02T00:00', seasonEnd: '2028-01-01T00:00' } }, cookie);
  assert.equal(badSchedule.status, 400, 'invalid theme date ranges are rejected server-side');

  const staffPermissions = permissionsForRoleIds(['1567581357004038184']);
  assert.deepEqual(staffPermissions, ['staff:read'], 'the configured staff-site role only grants access to the staff page');
  assert.ok(!staffPermissions.includes('rules:write') && !staffPermissions.includes('admin:site') && !staffPermissions.includes('news:write'), 'the staff-site role cannot manage the admin panel');
  const staffToken = makeSession({ id: 'staff-test', username: 'StaffTest', roles: ['1567581357004038184'], permissions: staffPermissions });
  const staffCookie = sessionCookie(staffToken, { url: base + '/api/admin' }).split(';')[0];
  const denied = await run(admin, 'POST', { action: 'publish-rules', title: 'Staff mag dit niet' }, staffCookie);
  assert.equal(denied.status, 403, 'staff role cannot publish rule versions');
  const staffNews = await run(admin, 'POST', { action: 'save', type: 'news', item: { id: 'staff-news', title: 'Staff update', content: 'Staff mag nieuws beheren.', status: 'draft' } }, staffCookie);
  assert.equal(staffNews.status, 403, 'staff-site role cannot change admin content');

  const originalFetch = globalThis.fetch;
  const oldGuildId = process.env.DISCORD_GUILD_ID;
  const oldBotToken = process.env.DISCORD_BOT_TOKEN;
  process.env.DISCORD_GUILD_ID = 'test-guild';
  process.env.DISCORD_BOT_TOKEN = 'test-bot-token';
  try {
    const discordToken = makeSession({ id: 'discord-test', username: 'DiscordTest', roles: ['1567581357004038184'], permissions: staffPermissions, provider: 'discord' });
    const discordCookie = sessionCookie(discordToken, { url: base + '/api/admin' }).split(';')[0];
    globalThis.fetch = async () => new Response(JSON.stringify({ user: { username: 'DiscordTest', global_name: 'Discord Test' }, roles: ['1568033014384951366'] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const promotedView = await run(admin, 'GET', undefined, discordCookie);
    assert.equal(promotedView.status, 200, 'Discord role changes are checked against the current guild roles');
    assert.ok((await promotedView.json()).content.rulesDraft, 'a newly assigned admin role is effective without re-login');

    globalThis.fetch = async () => new Response(JSON.stringify({ user: { username: 'DiscordTest' }, roles: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const removedRoleWrite = await run(admin, 'POST', { action: 'save', type: 'news', item: { id: 'removed-role', title: 'Geen toegang', content: 'Niet bewaren', status: 'draft' } }, discordCookie);
    assert.equal(removedRoleWrite.status, 403, 'removed Discord roles lose access immediately');
  } finally {
    globalThis.fetch = originalFetch;
    if (oldGuildId === undefined) delete process.env.DISCORD_GUILD_ID; else process.env.DISCORD_GUILD_ID = oldGuildId;
    if (oldBotToken === undefined) delete process.env.DISCORD_BOT_TOKEN; else process.env.DISCORD_BOT_TOKEN = oldBotToken;
  }

  const draftDocs = data.content.rulesDraft.documents.map(doc => ({ ...doc }));
  draftDocs[0].content += '\n### Testwijziging\n- Alleen testinhoud';
  const savedDraft = await run(admin, 'POST', { action: 'save-rules-draft', documents: draftDocs }, cookie);
  assert.equal(savedDraft.status, 200, 'rule draft can be saved');
  const published = await run(admin, 'POST', { action: 'publish-rules', title: 'Testversie' }, cookie);
  assert.equal(published.status, 200, 'rule version can be published');
  const afterPublish = await run(admin, 'GET', undefined, cookie);
  const afterBody = await afterPublish.json();
  assert.equal(afterBody.content.rulesVersions.length, 2, 'publishing adds a new version without overwriting version 1');
  assert.equal(afterBody.content.rulesVersions[0].documents[0].content.includes('Testwijziging'), false, 'historical rule snapshot stays immutable');
  assert.equal(afterBody.content.rulesVersions[1].documents[0].content.includes('Testwijziging'), true, 'new rule snapshot contains the published edit');

  const browserSettings = { tebexToken: 'stale-local-token', tebexPackages: {} };
  const browser = {
    dispatchEvent: () => {},
    HeerlenSettings: {
      load: () => browserSettings,
      save: value => Object.assign(browserSettings, value)
    }
  };
  class BrowserCustomEvent {
    constructor(type, options) { this.type = type; this.detail = options && options.detail; }
  }
  const catalogScript = await readFile(new URL('./catalog.js', import.meta.url), 'utf8');
  const browserContext = {
    window: browser,
    CustomEvent: BrowserCustomEvent,
    document: { body: { getAttribute: name => name === 'data-base' ? '../' : '' } },
    URL
  };
  runInNewContext(catalogScript, browserContext);
  const tebexScript = await readFile(new URL('./tebex.js', import.meta.url), 'utf8');
  runInNewContext(tebexScript, {
    ...browserContext,
    window: browser,
    fetch: async url => {
      if (url === '/api/content') return { ok: true, json: async () => ({ storeSettings: themeBody.storeSettings }) };
      if (url.endsWith('/sales')) return { ok: true, json: async () => ({ data: [
        {
          name: 'Test Sale', requirements: [{ type: 'minimum_basket_value', amount: 10, currency: 'EUR' }], discount: { type: 'percentage', percentage: 10 },
          applies_to: { type: 'package', packages: [{ id: 12345 }], categories: [], excluded_packages: [], variable_options: [] }
        },
        {
          name: 'Custom Sale', requirements: [], discount: { type: 'percentage', percentage: 20 },
          applies_to: { type: 'package', packages: [{ id: 67890 }], categories: [], excluded_packages: [], variable_options: [] }
        }
      ] }) };
      if (url.endsWith('/packages')) return { ok: true, json: async () => ({ data: [
        { id: 12345, category: { id: 7 }, base_price: 8, currency: 'EUR', image: 'javascript:alert(1)', media: [{ type: 'image', url: 'https://cdn.tebex.io/coins-100.jpg', primary: true }] },
        { id: 67890, category: { id: 8 }, base_price: 29.95, currency: 'EUR', image: 'https://cdn.tebex.io/test-auto.jpg' }
      ] }) };
      throw new Error('Unexpected request: ' + url);
    }
  });
  await browser.HeerlenTebex.loadStoreSettings();
  assert.equal(browserSettings.tebexToken, 'public-token-test', 'shop login loads the shared Tebex token for visitors');
  assert.equal(browser.HeerlenTebex.packageIdFor('coins-100'), '12345', 'checkout loads shared package IDs for visitors');
  assert.equal(browserSettings.shopProducts['coins-100'].name, 'Test Coins', 'shop product edits load for every visitor');
  assert.equal(browserSettings.shopProducts['coins-100'].featured, true, 'featured coin packages load for every visitor');
  assert.equal(browser.HeerlenCatalog.categories().some(category => category.id === 'cat-vehicles-a1b2c'), true, 'custom shop categories load for visitors');
  const customShopProduct = browser.HeerlenCatalog.pack('custom-test-car');
  assert.equal(customShopProduct.name, 'Test Auto', 'custom Tebex products load into the catalog');
  assert.equal(browser.HeerlenCatalog.popular().some(product => product.id === 'custom-test-car'), true, 'featured custom packages appear in the homepage selection');
  assert.equal(browser.HeerlenCatalog.pack('custom-hidden-car'), null, 'hidden custom packages are excluded from the public catalog');
  assert.equal(browser.HeerlenCatalog.popular().some(product => product.id === 'custom-hidden-car'), false, 'hidden custom packages do not appear in featured products');
  assert.equal(browser.HeerlenCatalog.popular().some(product => product.id === 'coins-100'), true, 'featured standard packages can be selected for the homepage');
  assert.equal(browser.HeerlenTebex.packageIdFor('custom-test-car'), '67890', 'custom product checkout uses its linked Tebex package ID');
  assert.equal(browser.HeerlenCatalog.productUrl(customShopProduct), '../winkel/pakket.html?id=custom-test-car', 'custom products link to their generated detail page');
  const sales = await browser.HeerlenTebex.loadActiveSales();
  assert.equal(sales[0].name, 'Test Sale', 'active Tebex sales are loaded from the public Headless API');
  const editedPack = browser.HeerlenCatalog.pack('coins-100');
  assert.equal(editedPack.name, 'Test Coins', 'product overrides are used by the store catalog');
  assert.equal(browser.HeerlenCatalog.priceInfo(editedPack).original, 8, 'the current base price is synchronized from Tebex');
  assert.equal(browser.HeerlenCatalog.priceInfo(editedPack).price, 8, 'conditional sales do not lower prices before the basket qualifies');
  assert.equal(browser.HeerlenCatalog.priceInfo(editedPack).discountedPrice, 7.2, 'the conditional discounted price is available to storefronts as a preview');
  assert.equal(browser.HeerlenCatalog.priceInfo(editedPack).sale.minimumBasketValue, 10, 'the minimum basket threshold is published with the active sale');
  assert.equal(browser.HeerlenCatalog.priceInfo(editedPack).sale.label, '10%', 'percentage sale badge contains only the percentage');
  assert.equal(browser.HeerlenCatalog.priceInfo(editedPack, 10).price, 7.2, 'active package sales lower prices once the minimum basket is reached');
  assert.equal(browser.HeerlenCatalog.priceInfo(customShopProduct).original, 29.95, 'custom product original price is synchronized from Tebex');
  assert.equal(browser.HeerlenCatalog.priceInfo(customShopProduct).price, 23.96, 'custom product price reflects its Tebex discount');
  assert.equal(browser.HeerlenCatalog.imageFor(editedPack), 'https://cdn.tebex.io/coins-100.jpg', 'unsafe package image URLs are ignored in favor of Tebex primary media');
  assert.equal(browser.HeerlenCatalog.imageFor(customShopProduct), 'https://cdn.tebex.io/test-auto.jpg', 'custom product images are synchronized from Tebex');

  const storeElements = {
    grid: { innerHTML: '', hidden: false },
    empty: { hidden: true },
    count: { textContent: '' },
    search: { value: '', addEventListener: () => {} },
    sort: { value: 'asc', addEventListener: () => {} },
    shopCategories: { innerHTML: '', addEventListener: (type, callback) => { storeElements.shopCategoryClick = callback; } },
    toolbar: { hidden: true },
    storeTitle: { textContent: '' }
  };
  const storeDocument = {
    body: { getAttribute: name => name === 'data-page' ? 'winkel' : './' },
    title: '',
    getElementById: id => storeElements[id] || null
  };
  browser.HeerlenCart = { cart: () => ({}) };
  browser.addEventListener = () => {};
  const storeScript = await readFile(new URL('./store.js', import.meta.url), 'utf8');
  runInNewContext(storeScript, {
    window: browser,
    document: storeDocument,
    URL,
    URLSearchParams,
    location: { href: 'https://heerlenrp.nl/winkel/?cat=cat-vehicles-a1b2c', search: '?cat=cat-vehicles-a1b2c' },
    history: { replaceState: (state, title, url) => { storeElements.url = url; } },
    console
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(storeElements.storeTitle.textContent, 'Voertuigen', 'the shop category selector opens the requested custom category');
  assert.ok(storeElements.shopCategories.innerHTML.includes('data-shop-category="cat-vehicles-a1b2c"'), 'shop categories render in the sidebar navigation');
  assert.ok(storeElements.shopCategories.innerHTML.includes('aria-pressed="true"'), 'the selected sidebar category is announced');
  assert.ok(storeElements.grid.innerHTML.includes('Test Auto'), 'custom Tebex products render in the storefront');
  assert.ok(storeElements.grid.innerHTML.includes('€29.95'), 'custom product cards display the live Tebex price');
  assert.ok(storeElements.grid.innerHTML.includes('<del class="price-old">€29.95</del><span class="price">€23.96</span>'), 'discounted product cards show old and updated prices together');
  assert.ok(storeElements.grid.innerHTML.includes('https://cdn.tebex.io/test-auto.jpg'), 'custom product cards display the package image from Tebex');
  assert.ok(storeElements.grid.innerHTML.includes('href="../winkel/pakket.html?id=custom-test-car"'), 'custom product cards have a working read-more link');
  storeElements.shopCategoryClick({ target: { closest: () => ({ getAttribute: () => 'coins' }) } });
  assert.equal(storeElements.storeTitle.textContent, 'Coins', 'clicking a sidebar category changes the selected category');
  assert.equal(storeElements.url, '/winkel/', 'sidebar category selection updates the category URL');

  const productElements = { productRoot: { innerHTML: '' } };
  const productDocument = {
    title: '',
    body: {
      getAttribute: name => name === 'data-page' ? 'product' : name === 'data-product' ? 'custom-package' : '../'
    },
    getElementById: id => productElements[id] || null
  };
  runInNewContext(storeScript, {
    window: browser,
    document: productDocument,
    URL,
    URLSearchParams,
    location: { href: 'https://heerlenrp.nl/winkel/pakket.html?id=custom-test-car', search: '?id=custom-test-car' },
    history: { replaceState: () => {} },
    console
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(productElements.productRoot.innerHTML.includes('Test Auto'), 'the generated package page displays the selected product');
  assert.ok(productElements.productRoot.innerHTML.includes('Voertuigen'), 'the package page displays its assigned category');
  assert.ok(productElements.productRoot.innerHTML.includes('€29.95'), 'the package page displays its Tebex price');
  assert.ok(productElements.productRoot.innerHTML.includes('https://cdn.tebex.io/test-auto.jpg'), 'the package page displays its Tebex image');
  assert.equal(productDocument.title, 'Test Auto | Heerlen Roleplay Store', 'the package page sets its product-specific title');
  const packageTemplate = await readFile(new URL('../winkel/pakket.html', import.meta.url), 'utf8');
  assert.ok(packageTemplate.includes('data-product="custom-package"'), 'the generator emits the dynamic package detail page');

  const originalAvatarFetch = globalThis.fetch;
  try {
    let avatarRequest;
    globalThis.fetch = async url => {
      avatarRequest = String(url);
      return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'Content-Type': 'image/png' } });
    };
    const avatarResponse = await avatar(new Request(base + '/api/avatar?name=TestPlayer'));
    assert.equal(avatarResponse.status, 200, 'the avatar endpoint returns a CFX image');
    assert.equal(avatarResponse.headers.get('Cache-Control'), 'public, s-maxage=86400, stale-while-revalidate=604800', 'CFX images are cached by the site');
    assert.ok(avatarRequest.includes('/user_avatar/forum.cfx.re/testplayer/96/1.png'), 'avatar requests use the normalized CFX profile name');
    const invalidAvatar = await avatar(new Request(base + '/api/avatar?name=bad%2Fhost'));
    assert.equal(invalidAvatar.status, 400, 'invalid avatar names cannot select an upstream host');
  } finally {
    globalThis.fetch = originalAvatarFetch;
  }

  const originalDonationsFetch = globalThis.fetch;
  const oldTebexCheckoutKey = process.env.TEBEX_CHECKOUT_API_KEY;
  try {
    process.env.TEBEX_CHECKOUT_API_KEY = 'test-checkout-api-key';
    globalThis.fetch = async (url, options) => {
      const requestUrl = String(url);
      if (requestUrl.endsWith('/sidebar')) {
        return new Response(JSON.stringify({ data: [
          { type: 'recent_payments', data: { payments: [
            { username: 'GlobalBuyer', package: { name: '500 Coins' }, avatar_url: 'https://forum.cfx.re/user_avatar/forum.cfx.re/globalbuyer/96/1.png', created_at: '2026-11-09T12:00:00Z', price: 25, currency: 'EUR' },
            { username: 'ProfileOnlyBuyer', avatar_url: 'https://forum.cfx.re/user_avatar/example/96/1.png' }
          ] } },
          { type: 'top_customer', data: null }
        ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (requestUrl.endsWith('/top-customers?period=none')) {
        assert.equal(options.headers.Authorization, 'Basic ' + Buffer.from('public-token-test:test-checkout-api-key').toString('base64'), 'Tebex basic auth uses the public token and keeps the private key server-side');
        return new Response(JSON.stringify({ data: { username: 'AllTimeTop', total: 240, currency: 'EUR' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error('Unexpected donations request: ' + requestUrl);
    };
    const donationResponse = await donations(new Request(base + '/api/donations'));
    assert.equal(donationResponse.status, 200, 'global donations endpoint returns Tebex data');
    const donationBody = await donationResponse.json();
    assert.equal(donationBody.topDonor.username, 'AllTimeTop', 'all-time top donor comes from Tebex');
    assert.equal(donationBody.recentPayments[0].username, 'GlobalBuyer', 'recent payments are global Tebex payments');
    assert.equal(donationBody.recentPayments[0].item, '500 Coins', 'recent payment package names are returned');
    assert.equal(donationBody.recentPayments[0].avatar, 'https://forum.cfx.re/user_avatar/forum.cfx.re/globalbuyer/96/1.png', 'CFX avatars from Tebex are retained');
    assert.equal(donationBody.recentPayments[1].username, 'ProfileOnlyBuyer', 'Tebex payments without package details are retained');
    assert.equal(donationBody.recentPayments[1].item, 'Betaling via Tebex', 'minimal public payment records get a safe generic label');
    assert.equal(JSON.stringify(donationBody).includes('test-checkout-api-key'), false, 'the Tebex checkout API key is never returned to visitors');

    delete process.env.TEBEX_CHECKOUT_API_KEY;
    const recentOnlyResponse = await donations(new Request(base + '/api/donations'));
    const recentOnlyBody = await recentOnlyResponse.json();
    assert.equal(recentOnlyBody.topDonor, null, 'the all-time top donor is omitted when its private API key is not configured');
    assert.equal(recentOnlyBody.recentPayments[0].username, 'GlobalBuyer', 'global recent payments still work without the private API key');
  } finally {
    globalThis.fetch = originalDonationsFetch;
    if (oldTebexCheckoutKey === undefined) delete process.env.TEBEX_CHECKOUT_API_KEY;
    else process.env.TEBEX_CHECKOUT_API_KEY = oldTebexCheckoutKey;
  }

  console.log('CMS, portal, and shop checks passed: origin guard, resident profile privacy, dashboard achievements/notices, public staff data, authorization, current Discord roles, shared shop settings, schedule validation, and immutable APV versions.');
} finally {
  await unlink(process.env.CONTENT_STORE_PATH).catch(() => {});
}
