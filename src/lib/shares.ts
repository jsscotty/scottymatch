import type { JoinSummary, Library, ShareSummary } from './types';

const OWNED_KEY = 'sm_owned_links';

export interface OwnedShare {
  id: string;
  ownerKey: string;
  name: string;
  createdAt: string;
}

export class ShareApiError extends Error {
  constructor(public status: number, public code: string, message: string, public body: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ShareApiError';
  }
}

async function gzipJson(data: unknown): Promise<Blob> {
  const json = JSON.stringify(data);
  if (typeof CompressionStream === 'undefined') return new Blob([json], { type: 'application/json' });
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Blob([await new Response(stream).arrayBuffer()], { type: 'application/octet-stream' });
}

async function readGzipJson<T>(res: Response): Promise<T> {
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text()) as T;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(path, init);
  if (res.ok) return res;
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    // Non-JSON error page.
  }
  const code = typeof body.error === 'string' ? body.error : `http_${res.status}`;
  const message = typeof body.message === 'string' ? body.message : `Request failed (${res.status})`;
  throw new ShareApiError(res.status, code, message, body);
}

export async function createShare(library: Library, spotifyToken: string) {
  const res = await call('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Spotify-Token': spotifyToken },
    body: await gzipJson(library),
  });
  return (await res.json()) as { id: string; ownerKey: string };
}

export async function joinShare(id: string, library: Library, spotifyToken: string) {
  const res = await call(`/api/share?id=${encodeURIComponent(id)}&action=join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Spotify-Token': spotifyToken },
    body: await gzipJson(library),
  });
  return (await res.json()) as { joinId: string };
}

export async function refreshShare(id: string, ownerKey: string, library: Library, spotifyToken: string) {
  await call(`/api/share?id=${encodeURIComponent(id)}&action=refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Spotify-Token': spotifyToken, 'X-Owner-Key': ownerKey },
    body: await gzipJson(library),
  });
}

export async function getShareSummary(id: string) {
  const res = await call(`/api/share?id=${encodeURIComponent(id)}&action=summary`);
  return (await res.json()) as ShareSummary;
}

// Libraries never change under a given link, so keep each one for the life of the tab.
const libraries = new Map<string, Promise<Library>>();

function cached(key: string, load: () => Promise<Library>) {
  let entry = libraries.get(key);
  if (!entry) {
    entry = load();
    entry.catch(() => libraries.delete(key));
    libraries.set(key, entry);
  }
  return entry;
}

export function rememberOwnerLibrary(id: string, library: Library) {
  libraries.set(`owner:${id}`, Promise.resolve(library));
}

export function rememberJoinLibrary(id: string, joinId: string, library: Library) {
  libraries.set(`join:${id}:${joinId}`, Promise.resolve(library));
}

export function getOwnerLibrary(id: string) {
  return cached(`owner:${id}`, async () => readGzipJson<Library>(await call(`/api/share?id=${encodeURIComponent(id)}`)));
}

export function getJoinLibrary(id: string, joinId: string) {
  return cached(`join:${id}:${joinId}`, async () => readGzipJson<Library>(await call(`/api/share?id=${encodeURIComponent(id)}&join=${encodeURIComponent(joinId)}`)));
}

export async function listJoins(id: string, ownerKey: string) {
  const res = await call(`/api/share?id=${encodeURIComponent(id)}&action=joins`, { headers: { 'X-Owner-Key': ownerKey } });
  return ((await res.json()) as { joins: JoinSummary[] }).joins;
}

export async function deleteShare(id: string, ownerKey: string) {
  await call(`/api/share?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'X-Owner-Key': ownerKey } });
}

export function getOwnedShares(): OwnedShare[] {
  try {
    const owned = JSON.parse(localStorage.getItem(OWNED_KEY) ?? '[]') as OwnedShare[];
    return Array.isArray(owned) ? owned : [];
  } catch {
    return [];
  }
}

export function getOwnedShare(id: string) {
  return getOwnedShares().find((share) => share.id === id) ?? null;
}

export function saveOwnedShare(share: OwnedShare) {
  try {
    const others = getOwnedShares().filter((s) => s.id !== share.id);
    localStorage.setItem(OWNED_KEY, JSON.stringify([share, ...others]));
  } catch {
    // Private mode: the link still works, this device just won't remember it.
  }
}

export function forgetOwnedShare(id: string) {
  try {
    localStorage.setItem(OWNED_KEY, JSON.stringify(getOwnedShares().filter((s) => s.id !== id)));
  } catch {
    // Ignore.
  }
}

export function shareUrl(id: string) {
  return `${window.location.origin}/c/${id}`;
}

export function resultUrl(id: string, joinId: string) {
  return `${window.location.origin}/c/${id}/${joinId}`;
}
