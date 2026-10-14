import type { ArtistInfo, Library, Track } from './types';

export interface SharedTrack {
  a: Track;
  b: Track;
}

export interface SharedArtist {
  id: string;
  name: string;
  image: string | null;
  aCount: number;
  bCount: number;
}

export interface Era {
  decade: number;
  a: number;
  b: number;
}

export interface GenreShare {
  genre: string;
  a: number;
  b: number;
}

export interface Comparison {
  sharedTracks: SharedTrack[];
  sharedArtists: SharedArtist[];
  tasteMatch: number;
  picksForA: Track[];
  picksForB: Track[];
  venn: { onlyA: number; both: number; onlyB: number };
  // Shared songs each person liked first.
  firstFound: { a: number; b: number };
  // Shared songs both people liked within IN_SYNC_DAYS of each other, closest first.
  inSync: SharedTrack[];
  // When the two libraries first had a song in common.
  inCommonSince: string | null;
  // Share of each library (0-1) per release decade.
  eras: Era[];
  // Share of each library (0-1) per genre, for genres both people have. Empty when Spotify gave us too little genre data.
  genres: GenreShare[];
  // Average Spotify popularity (0-100) of each library and the least-known shared song. Null when Spotify didn't send popularity.
  popularity: { a: number; b: number; deepestShared: SharedTrack | null } | null;
}

const PICKS_LIMIT = 50;
const IN_SYNC_DAYS = 30;
const DAY_MS = 86_400_000;

function fold(text: string) {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

// "Song (feat. X) - Remastered 2011" and "Song" are the same song for our purposes.
export function normalizeTitle(title: string): string {
  const stripped = fold(title)
    .replace(/\s+-\s+.*$/, '')
    .replace(/[([{].*?[)\]}]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^\p{L}\p{N}]+/gu, '');
  return stripped || fold(title).replace(/\s+/g, '');
}

export function normalizeArtist(name: string): string {
  return fold(name).replace(/&/g, 'and').replace(/[^\p{L}\p{N}]+/gu, '');
}

export function songKey(track: Track): string {
  return `${normalizeTitle(track.name)}|${normalizeArtist(track.artists[0]?.name ?? '')}`;
}

interface ArtistCount {
  name: string;
  count: number;
  image: string | null;
}

function countArtists(library: Library) {
  const counts = new Map<string, ArtistCount>();
  for (const track of library.tracks) {
    for (const artist of new Map(track.artists.map((a) => [a.id, a])).values()) {
      const entry = counts.get(artist.id);
      if (entry) entry.count++;
      else counts.set(artist.id, { name: artist.name, count: 1, image: track.image });
    }
  }
  return counts;
}

function indexTracks(tracks: Track[]) {
  const byId = new Map<string, Track>();
  const byIsrc = new Map<string, Track>();
  const byKey = new Map<string, Track>();
  for (const track of tracks) {
    if (!byId.has(track.id)) byId.set(track.id, track);
    if (track.isrc && !byIsrc.has(track.isrc)) byIsrc.set(track.isrc, track);
    const key = songKey(track);
    if (!byKey.has(key)) byKey.set(key, track);
  }
  return { byId, byIsrc, byKey };
}

function knows(index: ReturnType<typeof indexTracks>, track: Track) {
  return index.byId.has(track.id) || (!!track.isrc && index.byIsrc.has(track.isrc)) || index.byKey.has(songKey(track));
}

function latest(pair: SharedTrack) {
  return pair.a.added > pair.b.added ? pair.a.added : pair.b.added;
}

// Songs one person liked from artists both people like, ranked by how much the
// other person likes that artist.
function picksFrom(source: Track[], skip: Set<string>, otherIndex: ReturnType<typeof indexTracks>, otherCounts: Map<string, ArtistCount>, shared: Set<string>) {
  const scored: { track: Track; score: number }[] = [];
  for (const track of source) {
    if (skip.has(track.id) || knows(otherIndex, track)) continue;
    let score = 0;
    for (const artist of track.artists) {
      if (shared.has(artist.id)) score = Math.max(score, otherCounts.get(artist.id)?.count ?? 0);
    }
    if (score > 0) scored.push({ track, score });
  }
  scored.sort((x, y) => y.score - x.score || (y.track.added > x.track.added ? 1 : -1));
  const perArtist = new Map<string, number>();
  const picks: Track[] = [];
  for (const { track } of scored) {
    // Keep the list varied: at most 3 picks per lead artist.
    const lead = track.artists[0]?.id ?? '';
    const used = perArtist.get(lead) ?? 0;
    if (used >= 3) continue;
    perArtist.set(lead, used + 1);
    picks.push(track);
    if (picks.length >= PICKS_LIMIT) break;
  }
  return picks;
}

export function compareLibraries(a: Library, b: Library): Comparison {
  const aIndex = indexTracks(a.tracks);
  const bIndex = indexTracks(b.tracks);

  const usedB = new Set<string>();
  const matchedA = new Set<string>();
  const sharedTracks: SharedTrack[] = [];
  for (const trackA of a.tracks) {
    const candidates = [bIndex.byId.get(trackA.id), trackA.isrc ? bIndex.byIsrc.get(trackA.isrc) : undefined, bIndex.byKey.get(songKey(trackA))];
    const trackB = candidates.find((t) => t && !usedB.has(t.id));
    if (!trackB) continue;
    usedB.add(trackB.id);
    matchedA.add(trackA.id);
    sharedTracks.push({ a: trackA, b: trackB });
  }
  sharedTracks.sort((x, y) => (latest(y) > latest(x) ? 1 : latest(y) < latest(x) ? -1 : 0));

  const aCounts = countArtists(a);
  const bCounts = countArtists(b);
  const sharedArtists: SharedArtist[] = [];
  for (const [id, aEntry] of aCounts) {
    const bEntry = bCounts.get(id);
    if (!bEntry) continue;
    sharedArtists.push({
      id,
      name: aEntry.name,
      image: a.artists[id]?.image ?? b.artists[id]?.image ?? aEntry.image ?? bEntry.image,
      aCount: aEntry.count,
      bCount: bEntry.count,
    });
  }
  sharedArtists.sort((x, y) => Math.min(y.aCount, y.bCount) - Math.min(x.aCount, x.bCount) || y.aCount + y.bCount - (x.aCount + x.bCount));

  // Cosine similarity of artist vectors (sqrt-damped so one obsession doesn't
  // dominate), then sqrt again so the number reads like a percentage people expect.
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (const [id, entry] of aCounts) {
    aNorm += entry.count;
    const other = bCounts.get(id);
    if (other) dot += Math.sqrt(entry.count * other.count);
  }
  for (const entry of bCounts.values()) bNorm += entry.count;
  const cosine = aNorm && bNorm ? dot / Math.sqrt(aNorm * bNorm) : 0;
  const tasteMatch = Math.round(Math.sqrt(Math.min(1, cosine)) * 100);

  const sharedIds = new Set(sharedArtists.map((artist) => artist.id));

  let firstA = 0;
  let firstB = 0;
  const synced: { pair: SharedTrack; gap: number }[] = [];
  let inCommonSince: string | null = null;
  for (const pair of sharedTracks) {
    const aTime = Date.parse(pair.a.added);
    const bTime = Date.parse(pair.b.added);
    if (Number.isNaN(aTime) || Number.isNaN(bTime)) continue;
    if (aTime < bTime) firstA++;
    else if (bTime < aTime) firstB++;
    const gap = Math.abs(aTime - bTime);
    if (gap <= IN_SYNC_DAYS * DAY_MS) synced.push({ pair, gap });
    const since = latest(pair);
    if (!inCommonSince || since < inCommonSince) inCommonSince = since;
  }
  synced.sort((x, y) => x.gap - y.gap);

  return {
    sharedTracks,
    sharedArtists,
    tasteMatch,
    picksForA: picksFrom(b.tracks, usedB, aIndex, aCounts, sharedIds),
    picksForB: picksFrom(a.tracks, matchedA, bIndex, bCounts, sharedIds),
    venn: { onlyA: a.tracks.length - sharedTracks.length, both: sharedTracks.length, onlyB: b.tracks.length - sharedTracks.length },
    firstFound: { a: firstA, b: firstB },
    inSync: synced.map((s) => s.pair),
    inCommonSince,
    eras: eras(a.tracks, b.tracks),
    genres: genres(a, b),
    popularity: popularity(a.tracks, b.tracks, sharedTracks),
  };
}

// Spotify reports 0 for tracks it can't rate (unavailable, relinked), so treat 0 as unknown.
function knownPopularity(track: Track) {
  return typeof track.pop === 'number' && track.pop > 0 ? track.pop : null;
}

function averagePopularity(tracks: Track[]) {
  const known = tracks.filter((t) => knownPopularity(t) !== null);
  if (!tracks.length || known.length < tracks.length / 2) return null;
  return known.reduce((sum, t) => sum + (t.pop as number), 0) / known.length;
}

function popularity(aTracks: Track[], bTracks: Track[], shared: SharedTrack[]) {
  const a = averagePopularity(aTracks);
  const b = averagePopularity(bTracks);
  if (a === null || b === null) return null;
  let deepestShared: SharedTrack | null = null;
  for (const pair of shared) {
    const pop = knownPopularity(pair.a);
    if (pop === null) continue;
    if (!deepestShared || pop < (deepestShared.a.pop as number)) deepestShared = pair;
  }
  return { a: Math.round(a), b: Math.round(b), deepestShared };
}

function decadeShares(tracks: Track[]) {
  const counts = new Map<number, number>();
  let dated = 0;
  for (const track of tracks) {
    if (!track.year) continue;
    const decade = Math.floor(track.year / 10) * 10;
    counts.set(decade, (counts.get(decade) ?? 0) + 1);
    dated++;
  }
  return { counts, dated };
}

function eras(aTracks: Track[], bTracks: Track[]): Era[] {
  const a = decadeShares(aTracks);
  const b = decadeShares(bTracks);
  if (a.dated < aTracks.length / 2 || b.dated < bTracks.length / 2) return [];
  const decades = new Set([...a.counts.keys(), ...b.counts.keys()]);
  return [...decades]
    .sort((x, y) => x - y)
    .map((decade) => ({ decade, a: (a.counts.get(decade) ?? 0) / a.dated, b: (b.counts.get(decade) ?? 0) / b.dated }))
    .filter((era) => era.a >= 0.01 || era.b >= 0.01);
}

function genreShares(library: Library, info: Record<string, ArtistInfo>) {
  const counts = new Map<string, number>();
  let covered = 0;
  for (const track of library.tracks) {
    const trackGenres = new Set(track.artists.flatMap((artist) => info[artist.id]?.genres ?? []));
    if (!trackGenres.size) continue;
    covered++;
    for (const genre of trackGenres) counts.set(genre, (counts.get(genre) ?? 0) + 1);
  }
  return { counts, covered };
}

function genres(a: Library, b: Library): GenreShare[] {
  const info = { ...b.artists, ...a.artists };
  const aShares = genreShares(a, info);
  const bShares = genreShares(b, info);
  // Genre tags only come from a slice of artists. Below 15% coverage they mislead more than they help.
  if (aShares.covered < a.tracks.length * 0.15 || bShares.covered < b.tracks.length * 0.15) return [];
  const shared: GenreShare[] = [];
  for (const [genre, count] of aShares.counts) {
    const other = bShares.counts.get(genre);
    if (other) shared.push({ genre, a: count / aShares.covered, b: other / bShares.covered });
  }
  return shared.sort((x, y) => Math.min(y.a, y.b) - Math.min(x.a, x.b)).slice(0, 12);
}

export function verdict(tasteMatch: number) {
  if (tasteMatch >= 85) return 'Practically the same library.';
  if (tasteMatch >= 70) return 'Seriously in sync.';
  if (tasteMatch >= 50) return 'Plenty in common.';
  if (tasteMatch >= 30) return 'Some real common ground.';
  if (tasteMatch >= 15) return 'A few crossovers.';
  return 'Different worlds. Great swap material.';
}

export function matchStats(comparison: Comparison) {
  return {
    sharedTracks: comparison.sharedTracks.length,
    sharedArtists: comparison.sharedArtists.length,
    tasteMatch: comparison.tasteMatch,
    topArtists: comparison.sharedArtists.slice(0, 3).map((artist) => artist.name),
  };
}
