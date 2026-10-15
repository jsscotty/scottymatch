import { describe, expect, it } from 'vitest';
import { compareLibraries, normalizeTitle, songKey } from './compare';
import type { Library, Track } from './types';

let seq = 0;
function id() {
  seq++;
  return `T${String(seq).padStart(21, '0')}`;
}

function artist(name: string) {
  return { id: `A${name.replace(/\W/g, '').padEnd(21, 'x').slice(0, 21)}`, name };
}

function track(name: string, artistNames: string[], extra: Partial<Track> = {}): Track {
  return { id: id(), name, artists: artistNames.map(artist), album: '', image: null, isrc: null, ms: 200000, added: '2026-01-01T00:00:00Z', preview: null, ...extra };
}

function library(userId: string, tracks: Track[]): Library {
  return { v: 1, user: { id: userId, name: userId, image: null }, createdAt: '2026-10-13T00:00:00Z', tracks, artists: {} };
}

describe('normalizeTitle', () => {
  it('drops versions, features and punctuation', () => {
    expect(normalizeTitle('Here Comes The Sun - Remastered 2009')).toBe('herecomesthesun');
    expect(normalizeTitle('Stay (with Justin Bieber)')).toBe('stay');
    expect(normalizeTitle('Beyoncé [Live]')).toBe('beyonce');
    expect(normalizeTitle('Rock & Roll')).toBe('rockandroll');
  });

  it('keeps non-Latin titles', () => {
    expect(normalizeTitle('夜に駆ける')).toBe('夜に駆ける');
    expect(normalizeTitle('Кино - Группа крови')).toBe('кино');
  });

  it('falls back to the raw title when stripping would empty it', () => {
    expect(normalizeTitle('(Intro)')).toBe('(intro)');
  });
});

describe('compareLibraries', () => {
  it('matches the same track id', () => {
    const shared = track('Song', ['Band']);
    const result = compareLibraries(library('a', [shared, track('Other', ['X'])]), library('b', [{ ...shared }, track('Else', ['Y'])]));
    expect(result.sharedTracks.map((p) => p.a.name)).toEqual(['Song']);
  });

  it('matches single vs album releases by ISRC', () => {
    const a = track('Song', ['Band'], { isrc: 'USABC1234567' });
    const b = track('Song', ['Band'], { isrc: 'USABC1234567' });
    expect(a.id).not.toBe(b.id);
    expect(compareLibraries(library('a', [a]), library('b', [b])).sharedTracks).toHaveLength(1);
  });

  it('matches remasters by title and lead artist', () => {
    const a = track('Here Comes The Sun', ['The Beatles']);
    const b = track('Here Comes The Sun - Remastered 2009', ['The Beatles']);
    expect(songKey(a)).toBe(songKey(b));
    expect(compareLibraries(library('a', [a]), library('b', [b])).sharedTracks).toHaveLength(1);
  });

  it('does not match the same title by a different artist', () => {
    const result = compareLibraries(library('a', [track('Hello', ['Adele'])]), library('b', [track('Hello', ['Lionel Richie'])]));
    expect(result.sharedTracks).toHaveLength(0);
  });

  it('never pairs one track twice', () => {
    const b = track('Song', ['Band']);
    const a1 = track('Song', ['Band']);
    const a2 = track('Song - Live', ['Band']);
    expect(compareLibraries(library('a', [a1, a2]), library('b', [b])).sharedTracks).toHaveLength(1);
  });

  it('ranks shared artists by the smaller count', () => {
    const a = library('a', [track('1', ['Big']), track('2', ['Big']), track('3', ['Big']), track('4', ['Small'])]);
    const b = library('b', [track('5', ['Big']), track('6', ['Small']), track('7', ['Small'])]);
    const result = compareLibraries(a, b);
    expect(result.sharedArtists.map((x) => [x.name, x.aCount, x.bCount])).toEqual([
      ['Big', 3, 1],
      ['Small', 1, 2],
    ]);
  });

  it('scores identical libraries 100 and disjoint ones 0', () => {
    const tracks = [track('1', ['A']), track('2', ['B']), track('3', ['B'])];
    expect(compareLibraries(library('a', tracks), library('b', tracks)).tasteMatch).toBe(100);
    expect(compareLibraries(library('a', [track('1', ['A'])]), library('b', [track('2', ['B'])])).tasteMatch).toBe(0);
  });

  it('suggests songs from shared artists the other person has not liked', () => {
    const shared = track('Both', ['Band']);
    const onlyB = track('Deep Cut', ['Band']);
    const unrelated = track('Random', ['Nobody']);
    const result = compareLibraries(library('a', [shared]), library('b', [{ ...shared }, onlyB, unrelated]));
    expect(result.picksForA.map((t) => t.name)).toEqual(['Deep Cut']);
    expect(result.picksForB).toEqual([]);
  });

  it('handles empty libraries', () => {
    const result = compareLibraries(library('a', []), library('b', []));
    expect(result).toMatchObject({ sharedTracks: [], sharedArtists: [], tasteMatch: 0 });
  });
});

describe('analysis', () => {
  it('counts the venn split, who found songs first, and in-sync likes', () => {
    const t1 = track('One', ['Band']);
    const t2 = track('Two', ['Band']);
    const a = library('a', [{ ...t1, added: '2025-01-01T00:00:00Z' }, { ...t2, added: '2025-06-01T00:00:00Z' }, track('Mine', ['Solo'])]);
    const b = library('b', [{ ...t1, added: '2025-01-10T00:00:00Z' }, { ...t2, added: '2024-01-01T00:00:00Z' }]);
    const result = compareLibraries(a, b);
    expect(result.venn).toEqual({ onlyA: 1, both: 2, onlyB: 0 });
    expect(result.firstFound).toEqual({ a: 1, b: 1 });
    expect(result.inSync.map((p) => p.a.name)).toEqual(['One']);
    expect(result.inCommonSince).toBe('2025-01-10T00:00:00Z');
  });

  it('builds eras as shares of each library', () => {
    const a = library('a', [track('1', ['A'], { year: 1975 }), track('2', ['A'], { year: 2015 })]);
    const b = library('b', [track('3', ['B'], { year: 2019 })]);
    expect(compareLibraries(a, b).eras).toEqual([
      { decade: 1970, a: 0.5, b: 0 },
      { decade: 2010, a: 0.5, b: 1 },
    ]);
  });

  it('skips eras and genres when the data is missing', () => {
    const result = compareLibraries(library('a', [track('1', ['A'])]), library('b', [track('2', ['A'])]));
    expect(result.eras).toEqual([]);
    expect(result.genres).toEqual([]);
  });

  it('finds shared genres using either library’s artist info', () => {
    const a = library('a', [track('1', ['House Act']), track('2', ['Rock Act'])]);
    const b = library('b', [track('3', ['House Act'])]);
    const houseId = a.tracks[0].artists[0].id;
    a.artists[houseId] = { name: 'House Act', image: null, genres: ['deep house'] };
    b.artists[a.tracks[1].artists[0].id] = { name: 'Rock Act', image: null, genres: ['rock'] };
    expect(compareLibraries(a, b).genres).toEqual([{ genre: 'deep house', a: 0.5, b: 1 }]);
  });
});

describe('popularity', () => {
  it('averages popularity and finds the least-known shared song', () => {
    const niche = track('Niche', ['Tiny'], { pop: 5 });
    const hit = track('Hit', ['Huge'], { pop: 90 });
    const unrated = track('Unrated', ['Gone'], { pop: 0 });
    const result = compareLibraries(library('a', [niche, hit, unrated]), library('b', [{ ...niche }, { ...hit }, { ...unrated }, track('Other', ['X'], { pop: 70 })]));
    expect(result.popularity).toMatchObject({ a: 48, b: 55 });
    expect(result.popularity?.deepestShared?.a.name).toBe('Niche');
  });

  it('is null when popularity is missing', () => {
    expect(compareLibraries(library('a', [track('1', ['A'])]), library('b', [track('2', ['A'])])).popularity).toBeNull();
  });
});
