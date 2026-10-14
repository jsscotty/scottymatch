import { gunzipSync, gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleShareRequest, type ShareStore } from './share';

function memoryStore(): ShareStore & { data: Map<string, Uint8Array>; purged: string[] } {
  const data = new Map<string, Uint8Array>();
  const purged: string[] = [];
  return {
    data,
    purged,
    async purge(tags) {
      purged.push(...tags);
    },
    async get(key) {
      return data.get(key) ?? null;
    },
    async set(key, body) {
      data.set(key, typeof body === 'string' ? new TextEncoder().encode(body) : body);
    },
    async list(prefix) {
      return [...data.keys()].filter((key) => key.startsWith(prefix));
    },
    async delete(key) {
      data.delete(key);
    },
  };
}

const users: Record<string, { id: string; display_name: string }> = {
  'token-anna': { id: 'anna', display_name: 'Anna Example' },
  'token-ben': { id: 'ben', display_name: 'Ben Example' },
};

const T1 = '1111111111111111111111';
const T2 = '2222222222222222222222';
const AR = 'aaaaaaaaaaaaaaaaaaaaaa';

function library(userId: string, trackIds: string[]) {
  return {
    v: 1,
    user: { id: userId, name: 'spoofed name', image: 'https://evil.example/pixel.png' },
    createdAt: '2026-10-13T00:00:00Z',
    tracks: [
      ...trackIds.map((id) => ({ id, name: `Song ${id[0]}`, artists: [{ id: AR, name: 'Band' }], album: 'LP', image: 'https://i.scdn.co/image/abc', isrc: null, ms: 1000, added: '2026-01-01T00:00:00Z', preview: null })),
      { id: 'not-a-spotify-id', name: 'junk', artists: [] },
    ],
    artists: { [AR]: { name: 'Band', image: 'https://evil.example/x.png', genres: ['indie'] } },
  };
}

function request(method: string, query: string, { body, token, ownerKey }: { body?: unknown; token?: string; ownerKey?: string } = {}) {
  const headers: Record<string, string> = {};
  if (token) headers['X-Spotify-Token'] = token;
  if (ownerKey) headers['X-Owner-Key'] = ownerKey;
  return new Request(`https://example.test/api/share${query}`, {
    method,
    headers,
    body: body === undefined ? undefined : gzipSync(JSON.stringify(body)),
  });
}

async function readLibrary(res: Response) {
  return JSON.parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf8'));
}

let store: ReturnType<typeof memoryStore>;

beforeEach(() => {
  store = memoryStore();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const auth = new Headers(init?.headers).get('authorization') ?? '';
      const user = users[auth.replace('Bearer ', '')];
      return user ? Response.json({ ...user, images: [] }) : new Response('{"error":{"status":401}}', { status: 401 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('share API', () => {
  it('runs the full create → join → list → read → delete flow', async () => {
    const created = await handleShareRequest(request('POST', '', { body: library('anna', [T1, T2]), token: 'token-anna' }), store);
    expect(created.status).toBe(201);
    const { id, ownerKey } = await created.json();
    expect(id).toMatch(/^[A-Za-z0-9]{12}$/);

    const summary = await (await handleShareRequest(request('GET', `?id=${id}&action=summary`), store)).json();
    expect(summary).toMatchObject({ user: { id: 'anna', name: 'Anna Example' }, trackCount: 2, topArtists: [{ name: 'Band', image: 'https://i.scdn.co/image/abc' }] });
    expect(JSON.stringify(summary)).not.toContain('ownerKey');

    const ownerResponse = await handleShareRequest(request('GET', `?id=${id}`), store);
    expect(ownerResponse.headers.get('Netlify-Cache-Tag')).toBe(`share-${id}`);
    const owner = await readLibrary(ownerResponse);
    expect(owner.user.name).toBe('Anna Example');
    expect(owner.tracks).toHaveLength(2);
    expect(owner.artists[AR].image).toBeNull();

    const joined = await handleShareRequest(request('POST', `?id=${id}&action=join`, { body: library('ben', [T2]), token: 'token-ben' }), store);
    expect(joined.status).toBe(201);
    const { joinId } = await joined.json();

    const again = await (await handleShareRequest(request('POST', `?id=${id}&action=join`, { body: library('ben', [T1]), token: 'token-ben' }), store)).json();
    expect(again.joinId).toBe(joinId);
    expect(store.purged).toContain(`join-${id}-${joinId}`);

    expect((await handleShareRequest(request('GET', `?id=${id}&action=joins`), store)).status).toBe(403);
    const { joins } = await (await handleShareRequest(request('GET', `?id=${id}&action=joins`, { ownerKey }), store)).json();
    expect(joins).toHaveLength(1);
    expect(joins[0]).toMatchObject({ joinId, user: { id: 'ben' }, trackCount: 1, stats: { sharedTracks: 1, sharedArtists: 1, topArtists: ['Band'] } });

    const friend = await readLibrary(await handleShareRequest(request('GET', `?id=${id}&join=${joinId}`), store));
    expect(friend.tracks.map((t: { id: string }) => t.id)).toEqual([T1]);

    expect((await handleShareRequest(request('DELETE', `?id=${id}`, { ownerKey: 'wrong' }), store)).status).toBe(403);
    expect((await handleShareRequest(request('DELETE', `?id=${id}`, { ownerKey }), store)).status).toBe(200);
    expect(store.data.size).toBe(0);
    expect(store.purged).toContain(`share-${id}`);
    const gone = await handleShareRequest(request('GET', `?id=${id}&action=summary`), store);
    expect(gone.status).toBe(404);
    expect(gone.headers.get('Netlify-CDN-Cache-Control')).toBeNull();
  });

  it('lets only the owner refresh their songs, and re-scores friends', async () => {
    const { id, ownerKey } = await (await handleShareRequest(request('POST', '', { body: library('anna', [T1]), token: 'token-anna' }), store)).json();
    const { joinId } = await (await handleShareRequest(request('POST', `?id=${id}&action=join`, { body: library('ben', [T2]), token: 'token-ben' }), store)).json();
    const before = (await (await handleShareRequest(request('GET', `?id=${id}&action=joins`, { ownerKey }), store)).json()).joins[0];
    expect(before.stats.sharedTracks).toBe(0);

    const refresh = (opts: { token?: string; ownerKey?: string }) => handleShareRequest(request('POST', `?id=${id}&action=refresh`, { body: library('anna', [T1, T2]), ...opts }), store);
    expect((await refresh({ token: 'token-anna' })).status).toBe(403);
    expect((await refresh({ token: 'token-ben', ownerKey })).status).toBe(403);
    const ok = await refresh({ token: 'token-anna', ownerKey });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ updated: true, trackCount: 2 });

    const summary = await (await handleShareRequest(request('GET', `?id=${id}&action=summary`), store)).json();
    expect(summary.trackCount).toBe(2);
    const after = (await (await handleShareRequest(request('GET', `?id=${id}&action=joins`, { ownerKey }), store)).json()).joins[0];
    expect(after).toMatchObject({ joinId, stats: { sharedTracks: 1 } });
    expect(store.purged).toContain(`share-${id}`);
  });

  it('gives the owner key back when the owner opens their own link', async () => {
    const { id, ownerKey } = await (await handleShareRequest(request('POST', '', { body: library('anna', [T1]), token: 'token-anna' }), store)).json();
    const res = await handleShareRequest(request('POST', `?id=${id}&action=join`, { body: library('anna', [T1]), token: 'token-anna' }), store);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'same_user', ownerKey });
  });

  it('rejects uploads without a valid Spotify login', async () => {
    expect((await handleShareRequest(request('POST', '', { body: library('anna', [T1]) }), store)).status).toBe(401);
    expect((await handleShareRequest(request('POST', '', { body: library('anna', [T1]), token: 'stolen' }), store)).status).toBe(401);
    expect(store.data.size).toBe(0);
  });

  it('404s on unknown or malformed ids', async () => {
    expect((await handleShareRequest(request('GET', '?id=nope&action=summary'), store)).status).toBe(404);
    expect((await handleShareRequest(request('GET', '?id=abcdefghijkl&join=../../x'), store)).status).toBe(404);
  });
});
