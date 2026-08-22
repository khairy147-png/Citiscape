export default async function handler() {
  try {
    const home = await fetch('https://nps.ae/', { headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!home.ok) throw new Error('Unable to load NPS website');
    const html = await home.text();
    const tags = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0]);
    let best = null;
    let bestScore = -1;
    for (const tag of tags) {
      const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i);
      if (!srcMatch) continue;
      const text = tag.toLowerCase();
      let score = 0;
      if (text.includes('custom-logo')) score += 100;
      if (text.includes('site-logo')) score += 80;
      if (text.includes('logo')) score += 50;
      if (text.includes('nps')) score += 20;
      if (score > bestScore) {
        bestScore = score;
        best = srcMatch[1];
      }
    }
    if (!best || bestScore < 20) throw new Error('Official logo not found');
    const url = new URL(best, 'https://nps.ae/').href;
    return new Response(null, {
      status: 302,
      headers: {
        location: url,
        'cache-control': 'public, max-age=3600, s-maxage=3600'
      }
    });
  } catch {
    return new Response('NPS', {
      status: 200,
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  }
}
