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
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120"><rect width="320" height="120" rx="18" fill="#ffffff"/><text x="24" y="73" font-family="Arial, sans-serif" font-size="58" font-weight="700" fill="#0b2d50">NPS</text><rect x="24" y="88" width="132" height="6" rx="3" fill="#c7a33a"/><text x="174" y="52" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#0b2d50">National Projects</text><text x="174" y="76" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#0b2d50">Services</text></svg>`;
    return new Response(svg, {
      status: 200,
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  }
}
