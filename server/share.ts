// Share links. One owner library per link, plus one library per friend who joins.
// Platform-neutral: takes a Web Request, returns a Web Response, and stores
// blobs through the small ShareStore interface (Netlify Blobs in production).
//
//   POST   /api/share                       create a link (body: gzipped Library)
//   GET    /api/share?id=X&action=summary   owner name, photo, song count
//   GET    /api/share?id=X                  owner library (gzipped JSON)
//   POST   /api/share?id=X&action=join      add a friend's library
//   GET    /api/share?id=X&join=J           friend library (gzipped JSON)
//   GET    /api/share?id=X&action=joins     friends who joined (owner only)
//   POST   /api/share?id=X&action=refresh   replace the owner's library, re-score friends (owner only)
//   DELETE /api/share?id=X                  delete link and everything under it (owner only)
//
// Uploads must carry the uploader's Spotify access token (X-Spotify-Token). We
// call /me with it so nobody can upload a library under someone else's name.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { compareLibraries, matchStats } from '../src/lib/compare';
import type { ArtistInfo, ArtistRef, JoinSummary, Library, LibraryUser, TeaserArtist, Track } from '../src/lib/types';

const MAX_UPLOAD_BYTES = 4_000_000;
const MAX_JSON_BYTES = 60_000_000;
const MAX_TRACKS = 100_000;
const SHARE_ID = /^[A-Za-z0-9]{10,32}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const ISRC = /^[A-Z0-9]{12}$/;

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

interface ShareMeta {
  ownerKey: string;
  ownerUserId: string;
  user: LibraryUser;
  trackCount: number;
  createdAt: string;
  updatedAt?: string;
  topArtists?: TeaserArtist[];
}

const paths = {
  meta: (id: string) => `shares/${id}/meta.json`,
  owner: (id: string) => `shares/${id}/owner.json.gz`,
  joinPrefix: (id: string) => `shares/${id}/joins/`,
  join: (id: string, joinId: string) => `shares/${id}/joins/${joinId}.json.gz`,
  joinSummary: (id: string, joinId: string) => `shares/${id}/joins/${joinId}.summary.json`,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const tags = {
  share: (id: string) => `share-${id}`,
  join: (id: string, joinId: string) => `join-${id}-${joinId}`,
};

// Link data only changes on delete (or a friend re-joining), and both purge
// these tags, so the CDN can hold responses indefinitely.
function cdnCached(response: Response, cacheTags: string[]) {
  response.headers.set('Netlify-CDN-Cache-Control', 'public, durable, max-age=31536000');
  response.headers.set('Netlify-Cache-Tag', cacheTags.join(','));
  response.headers.set('Netlify-Vary', 'query');
  return response;
}

function base62(bytes: Buffer) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(bytes, (b) => chars[b % 62]).join('');
}

function sha256(text: string) {
  return createHash('sha256').update(text).digest();
}

function sameSecret(a: string, b: string) {
  return timingSafeEqual(sha256(a), sha256(b));
}

// ---- Storage ------------------------------------------------------------

export interface ShareStore {
  get(key: string): Promise<Uint8Array | null>;
  set(key: string, body: Uint8Array | string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  delete(key: string): Promise<void>;
  // Drop CDN-cached responses carrying these tags. Optional: no CDN, nothing to purge.
  purge?(tags: string[]): Promise<void>;
}

// Set by handleShareRequest. Every request in a deployment uses the same store.
let store: ShareStore;

async function readJson<T>(key: string): Promise<T | null> {
  const bytes = await store.get(key);
  return bytes ? (JSON.parse(Buffer.from(bytes).toString('utf8')) as T) : null;
}

async function requireMeta(id: string) {
  if (!SHARE_ID.test(id)) throw new HttpError(404, 'not_found', 'This link does not exist.');
  const meta = await readJson<ShareMeta>(paths.meta(id));
  if (!meta) throw new HttpError(404, 'not_found', 'This link does not exist.');
  return meta;
}

function requireOwner(request: Request, meta: ShareMeta) {
  const key = request.headers.get('x-owner-key') ?? '';
  if (!key || !sameSecret(key, meta.ownerKey)) throw new HttpError(403, 'forbidden', 'Only the person who made this link can do that.');
}

// ---- Validation ---------------------------------------------------------

function str(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length <= max ? value : null;
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 500) return null;
  try {
    const url = new URL(value);
    const host = url.hostname;
    return url.protocol === 'https:' && (host.endsWith('.scdn.co') || host.endsWith('.spotifycdn.com')) ? value : null;
  } catch {
    return null;
  }
}

function sanitizeLibrary(raw: unknown, user: LibraryUser): Library {
  if (!raw || typeof raw !== 'object') throw new HttpError(400, 'bad_library', 'Library is not an object.');
  const input = raw as Record<string, unknown>;
  if (input.v !== 1 || !Array.isArray(input.tracks)) throw new HttpError(400, 'bad_library', 'Unknown library format.');
  if (input.tracks.length > MAX_TRACKS) throw new HttpError(413, 'too_many_tracks', 'That library is too big to store.');

  const tracks: Track[] = [];
  for (const item of input.tracks as unknown[]) {
    if (!item || typeof item !== 'object') continue;
    const t = item as Record<string, unknown>;
    const id = str(t.id, 22);
    const name = str(t.name, 500);
    if (!id || !SPOTIFY_ID.test(id) || name === null || !Array.isArray(t.artists)) continue;
    const artists: ArtistRef[] = [];
    for (const a of (t.artists as unknown[]).slice(0, 20)) {
      const artist = a as Record<string, unknown> | null;
      const artistId = str(artist?.id, 22);
      const artistName = str(artist?.name, 300);
      if (artistId && SPOTIFY_ID.test(artistId) && artistName !== null) artists.push({ id: artistId, name: artistName });
    }
    const isrc = typeof t.isrc === 'string' && ISRC.test(t.isrc.toUpperCase()) ? t.isrc.toUpperCase() : null;
    const ms = typeof t.ms === 'number' && Number.isFinite(t.ms) && t.ms >= 0 && t.ms < 36_000_000 ? Math.round(t.ms) : 0;
    const added = str(t.added, 40) ?? '';
    const year = typeof t.year === 'number' && Number.isInteger(t.year) && t.year >= 1900 && t.year <= 2100 ? t.year : null;
    const pop = typeof t.pop === 'number' && t.pop >= 0 && t.pop <= 100 ? Math.round(t.pop) : null;
    tracks.push({ id, name, artists, album: str(t.album, 500) ?? '', image: safeUrl(t.image), isrc, ms, added, preview: safeUrl(t.preview), year, explicit: t.explicit === true, pop });
  }

  const artists: Record<string, ArtistInfo> = {};
  if (input.artists && typeof input.artists === 'object') {
    for (const [id, value] of Object.entries(input.artists as Record<string, unknown>).slice(0, 50_000)) {
      const info = value as Record<string, unknown> | null;
      const name = str(info?.name, 300);
      if (!SPOTIFY_ID.test(id) || name === null) continue;
      const genres = Array.isArray(info?.genres) ? (info.genres as unknown[]).map((g) => str(g, 100)).filter((g): g is string => !!g).slice(0, 3) : [];
      artists[id] = { name, image: safeUrl(info?.image), genres };
    }
  }

  return { v: 1, user, createdAt: new Date().toISOString(), tracks, artists };
}

async function readUpload(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_UPLOAD_BYTES) throw new HttpError(413, 'too_large', 'Upload too large.');
  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.length > MAX_UPLOAD_BYTES) throw new HttpError(413, 'too_large', 'Upload too large.');
  let text: string;
  try {
    text = buffer[0] === 0x1f && buffer[1] === 0x8b ? gunzipSync(buffer, { maxOutputLength: MAX_JSON_BYTES }).toString('utf8') : buffer.toString('utf8');
  } catch {
    throw new HttpError(400, 'bad_upload', 'Could not decompress upload.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'bad_upload', 'Upload is not valid JSON.');
  }
}

// Confirms who is uploading by asking Spotify, and uses Spotify's answer for
// the name and photo instead of trusting the client.
async function verifySpotifyUser(request: Request): Promise<LibraryUser> {
  const token = request.headers.get('x-spotify-token');
  if (!token) throw new HttpError(401, 'missing_token', 'Missing Spotify token.');
  const res = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) throw new HttpError(503, 'spotify_busy', 'Spotify is rate limiting right now. Try again in a minute.');
  if (!res.ok) throw new HttpError(401, 'spotify_rejected', `Spotify did not accept the login (HTTP ${res.status}).`);
  const me = (await res.json()) as { id: string; display_name: string | null; images?: { url: string; width: number | null }[] };
  const images = [...(me.images ?? [])].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  const image = (images.find((i) => (i.width ?? 0) >= 160) ?? images[images.length - 1])?.url ?? null;
  return { id: me.id, name: (me.display_name || me.id).slice(0, 200), image: safeUrl(image) };
}

// The friend's invite page shows these before they connect.
function teaserArtists(library: Library): TeaserArtist[] {
  const counts = new Map<string, { name: string; count: number; image: string | null }>();
  for (const track of library.tracks) {
    for (const artist of track.artists) {
      const entry = counts.get(artist.id) ?? { name: artist.name, count: 0, image: track.image };
      entry.count++;
      counts.set(artist.id, entry);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([id, entry]) => ({ name: entry.name, image: library.artists[id]?.image ?? entry.image }));
}

// ---- Handlers -----------------------------------------------------------

async function createLink(request: Request) {
  const raw = await readUpload(request);
  const user = await verifySpotifyUser(request);
  const library = sanitizeLibrary(raw, user);
  const id = base62(randomBytes(12));
  const ownerKey = base62(randomBytes(32));
  const meta: ShareMeta = { ownerKey, ownerUserId: user.id, user, trackCount: library.tracks.length, createdAt: library.createdAt, topArtists: teaserArtists(library) };
  await store.set(paths.owner(id), gzipSync(JSON.stringify(library)));
  await store.set(paths.meta(id), JSON.stringify(meta));
  return json({ id, ownerKey }, 201);
}

async function joinLink(request: Request, id: string) {
  const meta = await requireMeta(id);
  const raw = await readUpload(request);
  const user = await verifySpotifyUser(request);
  if (user.id === meta.ownerUserId) {
    // Verified by Spotify as the owner, so it's safe to hand back the key.
    throw new HttpError(409, 'same_user', 'This is your own link.', { ownerKey: meta.ownerKey });
  }
  const library = sanitizeLibrary(raw, user);
  // Same friend joining twice replaces their earlier upload instead of piling up.
  const joinId = base62(sha256(`${id}:${user.id}`).subarray(0, 16));
  // Score it now so the owner's list of friends can show match numbers without downloading every library.
  const ownerBytes = await store.get(paths.owner(id));
  const owner = ownerBytes ? (JSON.parse(gunzipSync(ownerBytes).toString('utf8')) as Library) : null;
  const stats = owner ? matchStats(compareLibraries(owner, library)) : undefined;
  const summary: JoinSummary = { joinId, user, trackCount: library.tracks.length, createdAt: library.createdAt, stats };
  await store.set(paths.join(id, joinId), gzipSync(JSON.stringify(library)));
  await store.set(paths.joinSummary(id, joinId), JSON.stringify(summary));
  await store.purge?.([tags.join(id, joinId)]);
  return json({ joinId }, 201);
}

async function refreshLink(request: Request, id: string) {
  const meta = await requireMeta(id);
  requireOwner(request, meta);
  const raw = await readUpload(request);
  const user = await verifySpotifyUser(request);
  if (user.id !== meta.ownerUserId) throw new HttpError(403, 'wrong_account', 'Log in with the Spotify account that made this link.');
  const library = sanitizeLibrary(raw, user);
  await store.set(paths.owner(id), gzipSync(JSON.stringify(library)));
  const updated: ShareMeta = { ...meta, user, trackCount: library.tracks.length, updatedAt: library.createdAt, topArtists: teaserArtists(library) };
  await store.set(paths.meta(id), JSON.stringify(updated));

  // Friends' match numbers depend on the owner's songs, so score them again.
  const summaryKeys = (await store.list(paths.joinPrefix(id))).filter((key) => key.endsWith('.summary.json'));
  await Promise.all(
    summaryKeys.map(async (key) => {
      const summary = await readJson<JoinSummary>(key);
      const bytes = summary && (await store.get(paths.join(id, summary.joinId)));
      if (!summary || !bytes) return;
      const friend = JSON.parse(gunzipSync(bytes).toString('utf8')) as Library;
      await store.set(key, JSON.stringify({ ...summary, stats: matchStats(compareLibraries(library, friend)) }));
    }),
  );
  await store.purge?.([tags.share(id)]);
  return json({ updated: true, trackCount: library.tracks.length });
}

async function sendLibrary(key: string, cacheTags: string[]) {
  const bytes = await store.get(key);
  if (!bytes) throw new HttpError(404, 'not_found', 'Not found.');
  const response = new Response(bytes, {
    headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'private, max-age=600' },
  });
  return cdnCached(response, cacheTags);
}

async function listJoins(request: Request, id: string) {
  const meta = await requireMeta(id);
  requireOwner(request, meta);
  const summaries = (await store.list(paths.joinPrefix(id))).filter((key) => key.endsWith('.summary.json'));
  const joins = (await Promise.all(summaries.map((p) => readJson<JoinSummary>(p)))).filter((j): j is JoinSummary => !!j);
  joins.sort((a, b) => (b.stats?.tasteMatch ?? -1) - (a.stats?.tasteMatch ?? -1) || (a.createdAt < b.createdAt ? 1 : -1));
  return json({ joins });
}

async function deleteLink(request: Request, id: string) {
  const meta = await requireMeta(id);
  requireOwner(request, meta);
  // Meta last, so a half-finished delete still leaves the link marked as existing and retryable.
  const keys = (await store.list(`shares/${id}/`)).filter((key) => key !== paths.meta(id));
  await Promise.all(keys.map((key) => store.delete(key)));
  await store.delete(paths.meta(id));
  await store.purge?.([tags.share(id)]);
  return json({ deleted: true });
}

export async function handleShareRequest(request: Request, shareStore: ShareStore): Promise<Response> {
  store = shareStore;
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id') ?? '';
    const action = url.searchParams.get('action');
    const joinId = url.searchParams.get('join');

    if (request.method === 'POST' && !id) return await createLink(request);
    if (request.method === 'POST' && action === 'join') return await joinLink(request, id);
    if (request.method === 'POST' && action === 'refresh') return await refreshLink(request, id);
    if (request.method === 'DELETE') return await deleteLink(request, id);
    if (request.method === 'GET') {
      if (action === 'summary') {
        const meta = await requireMeta(id);
        return cdnCached(json({ user: meta.user, trackCount: meta.trackCount, createdAt: meta.createdAt, updatedAt: meta.updatedAt ?? meta.createdAt, topArtists: meta.topArtists ?? [] }), [tags.share(id)]);
      }
      if (action === 'joins') return await listJoins(request, id);
      await requireMeta(id);
      if (joinId) {
        if (!SHARE_ID.test(joinId)) throw new HttpError(404, 'not_found', 'Not found.');
        return await sendLibrary(paths.join(id, joinId), [tags.share(id), tags.join(id, joinId)]);
      }
      return await sendLibrary(paths.owner(id), [tags.share(id)]);
    }
    return json({ error: 'method_not_allowed', message: 'Method not allowed.' }, 405);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.code, message: error.message, ...error.extra }, error.status);
    console.error(error);
    return json({ error: 'server_error', message: 'Something broke on our side. Try again.' }, 500);
  }
}
