import { getAccessToken, refreshAccessToken } from './auth';
import type { ArtistInfo, Library, Track } from './types';

const API_URL = 'https://api.spotify.com/v1';
const PAGE_SIZE = 50;
const CONCURRENCY = 8;
const ENRICH_ARTISTS = 150;
// Big collectors can own hundreds of playlists. Past this many, skip the rest.
const MAX_PLAYLISTS = 300;
const MAX_RETRY_WAIT_MS = 30_000;

export class SpotifyApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'SpotifyApiError';
  }
}

interface SpotifyImage {
  url: string;
  width: number | null;
}

interface SpotifyArtist {
  id: string | null;
  name: string;
  images?: SpotifyImage[];
  genres?: string[];
}

interface SpotifyTrack {
  id: string | null;
  name: string;
  type: string;
  is_local?: boolean;
  duration_ms: number;
  explicit?: boolean;
  popularity?: number;
  preview_url?: string | null;
  artists: SpotifyArtist[];
  album?: { name: string; images?: SpotifyImage[]; release_date?: string };
  external_ids?: { isrc?: string };
}

interface SavedTrack {
  added_at: string;
  track: SpotifyTrack | null;
}

interface Paging<T> {
  items: T[];
  total: number;
  next?: string | null;
}

interface SpotifyPlaylist {
  id: string;
  name: string;
  description?: string | null;
  collaborative?: boolean;
  owner?: { id: string };
  tracks?: { total: number } | null;
  items?: { total: number } | null;
}

// The Feb 2026 /items route calls the track "item"; the old /tracks route calls it "track".
interface PlaylistEntry {
  added_at: string | null;
  track?: SpotifyTrack | null;
  item?: SpotifyTrack | null;
}

interface CursorPaging<T> {
  items: T[];
  next: string | null;
  cursors?: { after?: string | null };
}

interface SpotifyUser {
  id: string;
  display_name: string | null;
  images?: SpotifyImage[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readError(res: Response) {
  const text = await res.text().catch(() => '');
  try {
    const body = JSON.parse(text) as { error?: { message?: string } | string; error_description?: string };
    if (typeof body.error === 'object' && body.error?.message) return body.error.message;
    if (body.error_description) return body.error_description;
    if (typeof body.error === 'string') return body.error;
  } catch {
    // Dev-mode rejections sometimes come back as plain text.
  }
  return text.trim() || `HTTP ${res.status}`;
}

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let refreshed = false;
  for (let attempt = 0; ; attempt++) {
    const token = await getAccessToken();
    const res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    if (res.ok) {
      // Some writes (PUT /playlists/{id}) answer 200 with an empty body.
      const text = await res.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }

    if (res.status === 401 && !refreshed) {
      refreshed = true;
      await refreshAccessToken();
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      const retryAfter = Number(res.headers.get('Retry-After'));
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
      if (waitMs <= MAX_RETRY_WAIT_MS) {
        await sleep(waitMs);
        continue;
      }
    }
    throw new SpotifyApiError(res.status, await readError(res));
  }
}

// Spotify returns 640/300/64px variants; 300 is sharp at our thumbnail sizes.
export function pickImage(images?: SpotifyImage[] | null): string | null {
  if (!images?.length) return null;
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((image) => (image.width ?? 0) >= 160) ?? sorted[sorted.length - 1]).url;
}

async function getTopArtists(): Promise<SpotifyArtist[]> {
  const page = await request<Paging<SpotifyArtist>>('/me/top/artists?limit=50&time_range=long_term');
  return page.items;
}

async function getFollowedArtists(): Promise<SpotifyArtist[]> {
  const artists: SpotifyArtist[] = [];
  let after: string | null | undefined = null;
  for (let page = 0; page < 10; page++) {
    const query: string = `/me/following?type=artist&limit=50${after ? `&after=${encodeURIComponent(after)}` : ''}`;
    const res: { artists: CursorPaging<SpotifyArtist> } = await request(query);
    artists.push(...res.artists.items);
    after = res.artists.cursors?.after;
    if (!res.artists.next || !after) break;
  }
  return artists;
}

export type ProgressFn = (loaded: number, total: number) => void;

// Runs page fetches CONCURRENCY at a time.
async function pool<T>(jobs: (() => Promise<T>)[]): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const index = next++;
      results[index] = await jobs[index]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  return results;
}

function offsetsAfterFirst(total: number, pageSize: number) {
  const offsets: number[] = [];
  for (let offset = pageSize; offset < total; offset += pageSize) offsets.push(offset);
  return offsets;
}

async function getSavedTracks(onPage: (count: number, total: number) => void): Promise<SavedTrack[]> {
  const first = await request<Paging<SavedTrack>>(`/me/tracks?limit=${PAGE_SIZE}&offset=0`);
  onPage(first.items.length, first.total);
  const rest = await pool(
    offsetsAfterFirst(first.total, PAGE_SIZE).map((offset) => async () => {
      const page = await request<Paging<SavedTrack>>(`/me/tracks?limit=${PAGE_SIZE}&offset=${offset}`);
      onPage(page.items.length, 0);
      return page.items;
    }),
  );
  return [first.items, ...rest].flat();
}

// Playlists you made or collaborate on. Ones you only follow (Spotify's
// editorial lists, other people's) say little about your taste, so they're out.
async function getOwnPlaylists(userId: string): Promise<SpotifyPlaylist[]> {
  const first = await request<Paging<SpotifyPlaylist | null>>(`/me/playlists?limit=${PAGE_SIZE}&offset=0`);
  const offsets = offsetsAfterFirst(Math.min(first.total, 2000), PAGE_SIZE);
  const rest = await pool(offsets.map((offset) => () => request<Paging<SpotifyPlaylist | null>>(`/me/playlists?limit=${PAGE_SIZE}&offset=${offset}`).then((p) => p.items)));
  return [first.items, ...rest]
    .flat()
    .filter((p): p is SpotifyPlaylist => !!p?.id && (p.owner?.id === userId || !!p.collaborative))
    // Playlists this site made would just echo old matches back.
    .filter((p) => !p.description?.includes("Made with Scotty's MusicMatch"))
    .slice(0, MAX_PLAYLISTS);
}

const PLAYLIST_PAGE = 100;
const TRACK_FIELDS = '(id,name,type,is_local,duration_ms,explicit,popularity,preview_url,artists(id,name),album(name,images,release_date),external_ids)';
const fieldsFor = (route: 'tracks' | 'items') => `total,items(added_at,${route === 'tracks' ? 'track' : 'item'}${TRACK_FIELDS})`;

let playlistRoute: 'tracks' | 'items' = 'tracks';

async function getPlaylistPage(id: string, offset: number) {
  const get = (route: 'tracks' | 'items') =>
    request<Paging<PlaylistEntry>>(`/playlists/${id}/${route}?limit=${PLAYLIST_PAGE}&offset=${offset}&fields=${encodeURIComponent(fieldsFor(route))}`);
  try {
    return await get(playlistRoute);
  } catch (error) {
    // Spotify is retiring /tracks for /items. Switch once and stay switched.
    if (error instanceof SpotifyApiError && (error.status === 400 || error.status === 404 || error.status === 403 || error.status === 410) && playlistRoute === 'tracks') {
      const page = await get('items');
      playlistRoute = 'items';
      return page;
    }
    throw error;
  }
}

function playlistSize(playlist: SpotifyPlaylist) {
  return playlist.tracks?.total ?? playlist.items?.total ?? 0;
}

async function getPlaylistTracks(playlists: SpotifyPlaylist[], onPage: (count: number) => void): Promise<SavedTrack[]> {
  const jobs: (() => Promise<PlaylistEntry[]>)[] = [];
  for (const playlist of playlists) {
    for (let offset = 0; offset < playlistSize(playlist); offset += PLAYLIST_PAGE) {
      // One broken playlist shouldn't sink the whole library.
      jobs.push(() =>
        getPlaylistPage(playlist.id, offset)
          .then((page) => page.items)
          .catch((error) => {
            if (error instanceof SpotifyApiError && error.status === 429) throw error;
            return [] as PlaylistEntry[];
          })
          .finally(() => onPage(Math.min(PLAYLIST_PAGE, playlistSize(playlist) - offset))),
      );
    }
  }
  const pages = await pool(jobs);
  return pages.flat().map((entry) => ({ added_at: entry.added_at ?? '', track: entry.track ?? entry.item ?? null }));
}

// Full artist objects (photo, genres) for the artists someone likes most.
// GET /artists is gone for apps created after Feb 2026, so failures are fine.
async function getArtists(ids: string[]): Promise<SpotifyArtist[]> {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50));
  const results = await Promise.all(
    batches.map((batch) => request<{ artists: (SpotifyArtist | null)[] }>(`/artists?ids=${batch.join(',')}`).then((r) => r.artists.filter((a): a is SpotifyArtist => !!a))),
  );
  return results.flat();
}

function releaseYear(date?: string) {
  const year = Number(date?.slice(0, 4));
  return year >= 1900 && year <= 2100 ? year : null;
}

export async function fetchLibrary(onProgress: ProgressFn): Promise<Library> {
  // Liked Songs and playlists load side by side; progress counts both.
  let loaded = 0;
  let total = 0;
  const progress = (count: number, more: number) => {
    loaded += count;
    total += more;
    onProgress(Math.min(loaded, total), total);
  };

  const me = await request<SpotifyUser>('/me');
  const [saved, playlisted, top, followed] = await Promise.all([
    getSavedTracks(progress),
    getOwnPlaylists(me.id)
      .then((playlists) => {
        progress(0, playlists.reduce((sum, p) => sum + playlistSize(p), 0));
        return getPlaylistTracks(playlists, (count) => progress(count, 0));
      })
      // Old logins lack the playlist scopes. Fall back to Liked Songs only.
      .catch((error) => {
        if (error instanceof SpotifyApiError && error.status === 429) throw error;
        return [] as SavedTrack[];
      }),
    getTopArtists().catch(() => [] as SpotifyArtist[]),
    getFollowedArtists().catch(() => [] as SpotifyArtist[]),
  ]);

  // A song can be in Liked Songs and several playlists. Keep one copy, dated
  // to whenever it first showed up anywhere.
  const byId = new Map<string, Track>();
  for (const item of [...saved, ...playlisted]) {
    const track = item?.track;
    if (!track?.id || track.is_local || track.type !== 'track') continue;
    const existing = byId.get(track.id);
    if (existing) {
      if (item.added_at && (!existing.added || item.added_at < existing.added)) existing.added = item.added_at;
      continue;
    }
    byId.set(track.id, {
      id: track.id,
      name: track.name,
      artists: track.artists.filter((a): a is SpotifyArtist & { id: string } => !!a.id).map((a) => ({ id: a.id, name: a.name })),
      album: track.album?.name ?? '',
      image: pickImage(track.album?.images),
      isrc: track.external_ids?.isrc?.toUpperCase() ?? null,
      ms: track.duration_ms,
      added: item.added_at,
      preview: track.preview_url ?? null,
      year: releaseYear(track.album?.release_date),
      explicit: !!track.explicit,
      pop: typeof track.popularity === 'number' ? track.popularity : null,
    });
  }
  const tracks = [...byId.values()];

  const counts = new Map<string, number>();
  for (const track of tracks) for (const artist of track.artists) counts.set(artist.id, (counts.get(artist.id) ?? 0) + 1);

  const artists: Record<string, ArtistInfo> = {};
  const remember = (artist: SpotifyArtist) => {
    if (!artist.id || !counts.has(artist.id)) return;
    artists[artist.id] = { name: artist.name, image: pickImage(artist.images), genres: (artist.genres ?? []).slice(0, 3) };
  };
  [...followed, ...top].forEach(remember);

  const missing = [...counts.entries()]
    .filter(([id]) => !artists[id])
    .sort((a, b) => b[1] - a[1])
    .slice(0, ENRICH_ARTISTS)
    .map(([id]) => id);
  (await getArtists(missing).catch(() => [] as SpotifyArtist[])).forEach(remember);

  return {
    v: 1,
    user: { id: me.id, name: me.display_name || me.id, image: pickImage(me.images) },
    createdAt: new Date().toISOString(),
    tracks,
    artists,
  };
}

interface CreatedPlaylist {
  id: string;
  external_urls?: { spotify?: string };
}

async function withFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>) {
  try {
    return await primary();
  } catch (error) {
    if (error instanceof SpotifyApiError && (error.status === 404 || error.status === 403 || error.status === 405)) return fallback();
    throw error;
  }
}

// Spotify moved playlist writes to /me/playlists and /playlists/{id}/items in
// Feb 2026. Older apps may still be on the old routes, so try both.
export async function createPlaylist(name: string, description: string, trackIds: string[]) {
  const me = await request<SpotifyUser>('/me');
  const body = { name, description, public: false };
  const playlist = await withFallback(
    () => request<CreatedPlaylist>('/me/playlists', { method: 'POST', body }),
    () => request<CreatedPlaylist>(`/users/${encodeURIComponent(me.id)}/playlists`, { method: 'POST', body }),
  );
  // Spotify ignores public:false here (and on PUT /playlists/{id}) as of Oct
  // 2026: the playlist comes out public but off the profile. The UI says so.
  for (let i = 0; i < trackIds.length; i += 100) {
    const uris = trackIds.slice(i, i + 100).map((id) => `spotify:track:${id}`);
    await withFallback(
      () => request(`/playlists/${playlist.id}/items`, { method: 'POST', body: { uris } }),
      () => request(`/playlists/${playlist.id}/tracks`, { method: 'POST', body: { uris } }),
    );
  }
  return playlist.external_urls?.spotify ?? `https://open.spotify.com/playlist/${playlist.id}`;
}
