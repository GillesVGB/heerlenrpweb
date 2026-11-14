import { readContent, publicContent } from '../server/content-store.mjs';
import { badMethod, json } from '../server/http.mjs';
import { vercelHandler } from '../server/vercel-adapter.mjs';

async function handler(request) {
  if (request.method !== 'GET') return badMethod('GET');
  try {
    const content = publicContent(await readContent());
    const profiles = (content.profiles || []).filter(profile => profile.showAchievements && profile.achievements?.length);
    const leaderboard = profiles.map(profile => ({
      username: profile.username,
      inGameName: profile.inGameName || '',
      avatar: profile.avatar || '',
      achievements: profile.achievements.length,
      latestAchievementAt: profile.achievements.map(item => Date.parse(item.awardedAt)).filter(Number.isFinite).sort((a, b) => b - a)[0] || 0,
      slug: profile.slug
    })).sort((a, b) => b.achievements - a.achievements || b.latestAchievementAt - a.latestAchievementAt || a.username.localeCompare(b.username, 'nl'))
      .slice(0, 25).map(({ latestAchievementAt, ...item }, index) => ({ ...item, rank: index + 1 }));
    return json({
      stats: {
        publicProfiles: (content.profiles || []).length,
        publicAchievements: profiles.reduce((sum, profile) => sum + profile.achievements.length, 0),
        publishedEvents: (content.events || []).length,
        publishedNews: (content.news || []).length
      },
      leaderboard
    }, 200, { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' });
  } catch (error) {
    console.error('[api/community-stats] Failed to load public metrics', error instanceof Error ? { name: error.name, message: error.message } : String(error));
    return json({ error: 'Communitygegevens zijn tijdelijk niet beschikbaar.' }, 503, { 'Cache-Control': 'no-store' });
  }
}

export default vercelHandler(handler);
