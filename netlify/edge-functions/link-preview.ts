// Rewrites the Open Graph tags on /c/* pages so a link pasted into iMessage,
// WhatsApp or Slack says who sent it (or how two people matched) instead of
// showing the generic site card.
import { getStore } from '@netlify/blobs';
import type { Config, Context } from '@netlify/edge-functions';

interface Person {
  name: string;
  image: string | null;
}
interface Meta {
  user: Person;
  trackCount: number;
}
interface JoinSummary {
  user: Person;
  stats?: { sharedTracks: number; tasteMatch: number; topArtists: string[] };
}

const ID = '[A-Za-z0-9]{10,32}';
// Only link unfurlers read these tags. Real visitors skip the blob lookups.
const PREVIEW_BOTS = /bot|facebookexternalhit|facebot|whatsapp|slack|discord|telegram|signal|skype|embedly|iframely|vkshare|pinterest|linkedin|preview|crawler|spider|curl/i;
const PATH = new RegExp(`^/c/(${ID})(?:/(${ID}))?/?$`);

function escape(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function first(name: string) {
  return name.split(' ')[0] || name;
}

function spotifyImage(url: string | null) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    return host.endsWith('.scdn.co') || host.endsWith('.spotifycdn.com') ? url : null;
  } catch {
    return null;
  }
}

function setMeta(html: string, attr: 'property' | 'name', key: string, value: string) {
  const tag = `<meta ${attr}="${key}" content="${escape(value)}" />`;
  const pattern = new RegExp(`<meta ${attr}="${key}"[^>]*>`);
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
}

export default async (request: Request, context: Context) => {
  const match = new URL(request.url).pathname.match(PATH);
  if (!match || !PREVIEW_BOTS.test(request.headers.get('user-agent') ?? '')) return context.next();
  const response = await context.next();
  if (!response.headers.get('content-type')?.includes('text/html')) return response;

  try {
    const store = getStore({ name: 'shares', consistency: 'strong' });
    const meta = (await store.get(`shares/${match[1]}/meta.json`, { type: 'json' })) as Meta | null;
    if (!meta) return response;

    let title = `${meta.user.name} wants to compare Spotify songs with you`;
    let description = `${first(meta.user.name)} has ${meta.trackCount.toLocaleString('en-US')} songs on Spotify. Connect yours to see which ones you both have.`;
    let image = spotifyImage(meta.user.image);

    if (match[2]) {
      const join = (await store.get(`shares/${match[1]}/joins/${match[2]}.summary.json`, { type: 'json' })) as JoinSummary | null;
      if (join?.stats) {
        title = `${first(meta.user.name)} & ${first(join.user.name)}: ${join.stats.tasteMatch}% taste match`;
        description = `${join.stats.sharedTracks.toLocaleString('en-US')} songs in both their libraries.${join.stats.topArtists.length ? ` Both into ${join.stats.topArtists.join(', ')}.` : ''}`;
        image = null;
      }
    }

    let html = await response.text();
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`);
    html = setMeta(html, 'name', 'description', description);
    html = setMeta(html, 'property', 'og:title', title);
    html = setMeta(html, 'property', 'og:description', description);
    html = setMeta(html, 'property', 'og:url', request.url);
    html = setMeta(html, 'name', 'twitter:title', title);
    html = setMeta(html, 'name', 'twitter:description', description);
    if (image) {
      html = setMeta(html, 'property', 'og:image', image);
      html = setMeta(html, 'name', 'twitter:image', image);
      html = setMeta(html, 'name', 'twitter:card', 'summary');
    }

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.set('cache-control', 'public, max-age=0, must-revalidate');
    return new Response(html, { status: response.status, headers });
  } catch (error) {
    console.error('link-preview failed', error);
    return response;
  }
};

export const config: Config = { path: '/c/*' };
