const nf = new Intl.NumberFormat();

export function formatCount(n: number) {
  return nf.format(n);
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}

export function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function trackUrl(id: string) {
  return `https://open.spotify.com/track/${id}`;
}

export function artistUrl(id: string) {
  return `https://open.spotify.com/artist/${id}`;
}

// Libraries come from other people's browsers, so only load Spotify CDN images and previews.
export function safeCdnUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return parsed.protocol === 'https:' && (host.endsWith('.scdn.co') || host.endsWith('.spotifycdn.com')) ? url : null;
  } catch {
    return null;
  }
}
