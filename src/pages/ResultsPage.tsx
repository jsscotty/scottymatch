import { useEffect, useMemo, useState, type ReactNode, type RefObject } from 'react';
import { ArrowLeft, CalendarHeart, Check, Clock, Heart, ListMusic, Mic2, Search, Sparkles, Trophy, Zap } from 'lucide-react';
import { startLogin } from '../lib/auth';
import { compareLibraries, verdict, type SharedTrack } from '../lib/compare';
import { formatCount, formatDate, plural, safeCdnUrl } from '../lib/format';
import { getJoinLibrary, getOwnedShare, getOwnerLibrary, resultUrl, ShareApiError } from '../lib/shares';
import type { Library } from '../lib/types';
import { useIncremental } from '../lib/useIncremental';
import { EraChart, GenreBars, Legend, MatchRing, VennBar } from '../components/Charts';
import CopyLink from '../components/CopyLink';
import { ArtistRow, TrackRow } from '../components/Rows';
import { Avatar, Link, PageLoading, Problem, Spinner } from '../components/ui';

type Tab = 'songs' | 'artists' | 'picks';
type SongSort = 'recent' | 'newest' | 'oldest';

const DAY_MS = 86_400_000;

function firstName(name: string) {
  return name.split(' ')[0] || name;
}

function gapText(days: number) {
  if (days < 1) return 'the same day';
  if (days < 14) return `${Math.round(days)} ${Math.round(days) === 1 ? 'day' : 'days'}`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  if (days < 730) return `${Math.round(days / 30)} months`;
  return `${Math.round(days / 365)} years`;
}

function whoFirst(pair: SharedTrack, aName: string, bName: string) {
  const a = Date.parse(pair.a.added);
  const b = Date.parse(pair.b.added);
  if (Number.isNaN(a) || Number.isNaN(b)) return undefined;
  const days = Math.abs(a - b) / DAY_MS;
  if (days < 1) return 'You both liked it the same day';
  return `${a < b ? aName : bName} liked it first, ${gapText(days)} earlier`;
}

function playlistLink() {
  const value = new URLSearchParams(window.location.search).get('playlist');
  return value && value.startsWith('https://open.spotify.com/') ? value : null;
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-5 md:p-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Highlight({ icon, label, children, sub }: { icon: ReactNode; label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card flex flex-col gap-2 p-5">
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
        {icon}
        {label}
      </span>
      <div className="font-display text-lg font-semibold leading-snug">{children}</div>
      {sub && <div className="text-sm text-white/55">{sub}</div>}
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="px-2 py-10 text-center text-white/50">{children}</p>;
}

function MoreSentinel({ hasMore, sentinel, showAll, total }: { hasMore: boolean; sentinel: RefObject<HTMLDivElement>; showAll: () => void; total: number }) {
  if (!hasMore) return null;
  return (
    <div ref={sentinel} className="flex justify-center py-4">
      <button type="button" className="btn-ghost text-sm" onClick={showAll}>
        Show all {formatCount(total)}
      </button>
    </div>
  );
}

export default function ResultsPage({ id, joinId }: { id: string; joinId: string }) {
  const [libraries, setLibraries] = useState<[Library, Library] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [tab, setTab] = useState<Tab>('songs');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SongSort>('recent');
  const [savingPlaylist, setSavingPlaylist] = useState(false);
  const [playlist] = useState(playlistLink);
  const owned = getOwnedShare(id);

  useEffect(() => {
    let alive = true;
    Promise.all([getOwnerLibrary(id), getJoinLibrary(id, joinId)]).then(
      (libs) => alive && setLibraries(libs),
      (e: Error) => alive && setError(e),
    );
    if (playlist) window.history.replaceState(null, '', window.location.pathname);
    return () => {
      alive = false;
    };
  }, [id, joinId, playlist]);

  const comparison = useMemo(() => (libraries ? compareLibraries(libraries[0], libraries[1]) : null), [libraries]);

  const songs = useMemo(() => {
    if (!comparison) return [];
    const q = query.trim().toLowerCase();
    let list = q
      ? comparison.sharedTracks.filter(({ a }) => a.name.toLowerCase().includes(q) || a.album.toLowerCase().includes(q) || a.artists.some((artist) => artist.name.toLowerCase().includes(q)))
      : comparison.sharedTracks;
    if (sort !== 'recent') {
      const dir = sort === 'newest' ? -1 : 1;
      list = [...list].sort((x, y) => ((x.a.year ?? (dir === 1 ? 9999 : 0)) - (y.a.year ?? (dir === 1 ? 9999 : 0))) * dir);
    }
    return list;
  }, [comparison, query, sort]);

  const songPages = useIncremental(songs);
  const artistPages = useIncremental(comparison?.sharedArtists ?? []);

  if (error) {
    const gone = error instanceof ShareApiError && error.status === 404;
    return (
      <Problem title={gone ? 'These results are gone' : 'Couldn’t load the results'} message={gone ? 'The link was deleted by the person who made it.' : error.message}>
        <Link href="/" className="btn-primary">
          Make your own link
        </Link>
      </Problem>
    );
  }
  if (!libraries || !comparison) return <PageLoading label="Comparing libraries…" />;

  const [a, b] = libraries;
  const aName = firstName(a.user.name);
  const bName = firstName(b.user.name);
  const { venn, firstFound, inSync, inCommonSince, eras, genres, popularity, sharedArtists, sharedTracks } = comparison;
  const topArtist = sharedArtists[0];
  const firstTotal = firstFound.a + firstFound.b;
  const firstHeadline = !firstTotal
    ? 'Always the same day'
    : firstFound.a === firstFound.b
      ? 'Dead even'
      : `${firstFound.a > firstFound.b ? aName : bName} usually gets there first`;
  const pctOfA = a.tracks.length ? Math.round((venn.both / a.tracks.length) * 100) : 0;
  const pctOfB = b.tracks.length ? Math.round((venn.both / b.tracks.length) * 100) : 0;

  const tabs: { key: Tab; label: string; count: number; icon: typeof Heart }[] = [
    { key: 'songs', label: 'Songs', count: sharedTracks.length, icon: Heart },
    { key: 'artists', label: 'Artists', count: sharedArtists.length, icon: Mic2 },
    { key: 'picks', label: 'Swap', count: comparison.picksForA.length + comparison.picksForB.length, icon: Sparkles },
  ];

  return (
    <div className="fade-up space-y-5">
      {owned && (
        <Link href={`/c/${id}`} className="btn-ghost -ml-3 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Back to your link
        </Link>
      )}

      {playlist && (
        <div className="card flex flex-col items-start gap-3 border-mint/40 bg-mint/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 font-medium">
            <Check className="h-5 w-5 text-mint" />
            Playlist saved to your Spotify. It's off your profile, but public until you make it private.
          </p>
          <a href={playlist} target="_blank" rel="noopener noreferrer" className="btn-primary">
            Open playlist
          </a>
        </div>
      )}

      <section className="card relative overflow-hidden px-5 py-8 md:px-10 md:py-10">
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-mint/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-violet/20 blur-3xl" />
        <div className="relative flex flex-col items-center gap-8 md:flex-row md:justify-between">
          <div className="flex flex-col items-center text-center md:items-start md:text-left">
            <div className="flex items-center">
              <Avatar src={a.user.image} name={a.user.name} size={72} ring="ring-4 ring-mint" />
              <span className="-ml-4">
                <Avatar src={b.user.image} name={b.user.name} size={72} ring="ring-4 ring-violet" />
              </span>
            </div>
            <h1 className="mt-5 font-display text-3xl font-bold tracking-tight md:text-5xl">
              {aName} <span className="text-white/40">&</span> {bName}
            </h1>
            <p className="mt-2 text-lg text-white/75">{verdict(comparison.tasteMatch)}</p>
            <p className="mt-1 text-sm text-white/45">
              {plural(a.tracks.length, 'liked song')} vs {plural(b.tracks.length, 'liked song')}
            </p>
          </div>
          <MatchRing value={comparison.tasteMatch} />
        </div>
        <div className="relative mt-8">
          <VennBar onlyA={venn.onlyA} both={venn.both} onlyB={venn.onlyB} aName={aName} bName={bName} />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Highlight icon={<Mic2 className="h-4 w-4 text-mint" />} label="Top shared artist" sub={topArtist ? `${aName} ${topArtist.aCount} · ${bName} ${topArtist.bCount} songs` : undefined}>
          {topArtist ? (
            <span className="flex items-center gap-3">
              {safeCdnUrl(topArtist.image) && <img src={safeCdnUrl(topArtist.image)!} alt="" className="h-10 w-10 rounded-full object-cover" />}
              <span className="min-w-0 truncate">{topArtist.name}</span>
            </span>
          ) : (
            'None yet'
          )}
        </Highlight>
        <Highlight icon={<Trophy className="h-4 w-4 text-mint" />} label="Found it first" sub={venn.both ? `${aName} first on ${formatCount(firstFound.a)} · ${bName} first on ${formatCount(firstFound.b)}` : undefined}>
          {venn.both ? firstHeadline : 'No shared songs yet'}
        </Highlight>
        <Highlight icon={<Zap className="h-4 w-4 text-mint" />} label="In sync" sub={inSync[0] ? `Closest: ${inSync[0].a.name}` : 'Liked within a month of each other'}>
          {plural(inSync.length, 'song')} liked within a month of each other
        </Highlight>
        <Highlight icon={<CalendarHeart className="h-4 w-4 text-mint" />} label="In common since" sub={`${pctOfA}% of ${aName}'s likes · ${pctOfB}% of ${bName}'s`}>
          {inCommonSince ? formatDate(inCommonSince) : 'Not yet'}
        </Highlight>
      </section>

      <section className="card flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between md:p-6">
        <div>
          <h2 className="font-display text-lg font-semibold">Keep these songs</h2>
          <p className="text-sm text-white/55">
            Save all {formatCount(sharedTracks.length)} shared songs as a playlist in your Spotify. It won't show on your profile. Spotify makes it public, so switch it to private there if you want.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary shrink-0"
          disabled={!sharedTracks.length || savingPlaylist}
          onClick={() => {
            setSavingPlaylist(true);
            void startLogin({ kind: 'playlist', shareId: id, joinId });
          }}
        >
          {savingPlaylist ? <Spinner className="h-4 w-4" /> : <ListMusic className="h-4 w-4" />}
          Save as playlist
        </button>
      </section>

      {eras.length > 1 && (
        <Section title="Your eras" aside={<Legend aName={aName} bName={bName} />}>
          <p className="-mt-3 mb-5 text-sm text-white/55">Share of each library by the decade the song came out.</p>
          <EraChart eras={eras} aName={aName} bName={bName} />
        </Section>
      )}

      {genres.length > 2 && (
        <Section title="Genres you share" aside={<Legend aName={aName} bName={bName} />}>
          <GenreBars genres={genres.slice(0, 8)} aName={aName} bName={bName} />
        </Section>
      )}

      {popularity && (
        <Section title="Mainstream or deep cuts" aside={<Legend aName={aName} bName={bName} />}>
          <p className="-mt-3 mb-5 text-sm text-white/55">
            {Math.abs(popularity.a - popularity.b) < 5
              ? 'You sit at about the same spot between chart hits and hidden gems.'
              : `${popularity.a < popularity.b ? aName : bName} digs deeper. Spotify rates their likes as less mainstream.`}
          </p>
          <div className="space-y-3">
            {[
              { name: aName, value: popularity.a, color: 'bg-mint' },
              { name: bName, value: popularity.b, color: 'bg-violet' },
            ].map((row) => (
              <div key={row.name} className="grid grid-cols-[5rem_1fr_2.5rem] items-center gap-3 text-sm">
                <span className="truncate text-white/70">{row.name}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-white/10">
                  <span className={`block h-full rounded-full ${row.color}`} style={{ width: `${row.value}%` }} />
                </span>
                <span className="text-right tabular-nums text-white/60">{row.value}</span>
              </div>
            ))}
            <div className="grid grid-cols-[5rem_1fr_2.5rem] gap-3 text-[11px] text-white/35">
              <span />
              <span className="flex justify-between">
                <span>Hidden gems</span>
                <span>Chart hits</span>
              </span>
              <span />
            </div>
          </div>
          {popularity.deepestShared && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/40">Your deepest shared cut</p>
              <ul className="-mx-2">
                <TrackRow track={popularity.deepestShared.a} note={`Popularity ${popularity.deepestShared.a.pop} out of 100`} />
              </ul>
            </div>
          )}
        </Section>
      )}

      <section className="card overflow-hidden">
        <div className="flex border-b border-line" role="tablist">
          {tabs.map(({ key, label, count, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2 py-4 text-sm font-medium transition sm:gap-2 sm:px-3 ${tab === key ? 'bg-white/[0.06] text-white shadow-[inset_0_-2px_0_#1ed760]' : 'text-white/50 hover:text-white'}`}
            >
              <Icon className="hidden h-4 w-4 shrink-0 sm:block" />
              {label}
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-xs tabular-nums sm:px-2">{formatCount(count)}</span>
            </button>
          ))}
        </div>

        <div className="p-3 md:p-5">
          {tab === 'songs' && (
            <>
              {sharedTracks.length > 8 && (
                <div className="mb-3 flex flex-col gap-2 sm:flex-row">
                  <label className="flex flex-1 items-center gap-2 rounded-full border border-line bg-black/30 px-4 py-2.5">
                    <Search className="h-4 w-4 text-white/40" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search songs, artists, albums" className="w-full bg-transparent text-sm outline-none placeholder:text-white/35" />
                  </label>
                  <div className="flex rounded-full border border-line bg-black/30 p-1 text-sm">
                    {(
                      [
                        ['recent', 'Recent'],
                        ['newest', 'Newest'],
                        ['oldest', 'Oldest'],
                      ] as const
                    ).map(([key, label]) => (
                      <button key={key} type="button" onClick={() => setSort(key)} className={`flex-1 rounded-full px-3 py-1.5 transition ${sort === key ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {sharedTracks.length === 0 ? (
                <Empty>{sharedArtists.length ? `No exact songs in common yet. You still share ${plural(sharedArtists.length, 'artist')}. Check the Artists tab.` : 'No songs in common. Opposites attract?'}</Empty>
              ) : songs.length === 0 ? (
                <Empty>No shared songs match that search.</Empty>
              ) : (
                <>
                  <ul className="row-list">
                    {songPages.visible.map((pair) => (
                      <TrackRow key={pair.a.id} track={pair.a} note={whoFirst(pair, aName, bName)} />
                    ))}
                  </ul>
                  <MoreSentinel hasMore={songPages.hasMore} sentinel={songPages.sentinel} showAll={songPages.showAll} total={songs.length} />
                </>
              )}
            </>
          )}

          {tab === 'artists' &&
            (sharedArtists.length === 0 ? (
              <Empty>No artists in common.</Empty>
            ) : (
              <>
                <ul className="row-list">
                  {artistPages.visible.map((artist) => (
                    <ArtistRow key={artist.id} {...artist} aName={aName} bName={bName} />
                  ))}
                </ul>
                <MoreSentinel hasMore={artistPages.hasMore} sentinel={artistPages.sentinel} showAll={artistPages.showAll} total={sharedArtists.length} />
              </>
            ))}

          {tab === 'picks' && (
            <div className="grid gap-6 md:grid-cols-2">
              {[
                { forName: aName, fromName: bName, tracks: comparison.picksForA },
                { forName: bName, fromName: aName, tracks: comparison.picksForB },
              ].map(({ forName, fromName, tracks }) => (
                <div key={forName}>
                  <h3 className="px-2 font-display text-lg font-semibold">For {forName}</h3>
                  <p className="px-2 text-sm text-white/50">Songs {fromName} liked by artists you both like.</p>
                  {tracks.length === 0 ? (
                    <Empty>Nothing to suggest yet.</Empty>
                  ) : (
                    <ul className="row-list mt-2">
                      {tracks.map((track) => (
                        <TrackRow key={track.id} track={track} />
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {inSync.length > 0 && (
        <Section title="Liked at almost the same time" aside={<Clock className="h-5 w-5 text-white/40" />}>
          <ul className="row-list -mx-2">
            {inSync.slice(0, 5).map((pair) => (
              <TrackRow key={pair.a.id} track={pair.a} note={whoFirst(pair, aName, bName)} />
            ))}
          </ul>
        </Section>
      )}

      <Section title="Share these results">
        <CopyLink url={resultUrl(id, joinId)} shareText={`${aName} & ${bName}: ${comparison.tasteMatch}% taste match on Spotify.`} label="Copy results link" />
      </Section>

      {!owned && (
        <section className="card flex flex-col items-center gap-4 px-6 py-8 text-center md:flex-row md:justify-between md:text-left">
          <div>
            <h2 className="font-display text-xl font-semibold">Compare with someone else</h2>
            <p className="mt-1 text-white/60">Make your own link and send it around.</p>
          </div>
          <Link href="/" className="btn-primary">
            <Heart className="h-4 w-4" />
            Get my link
          </Link>
        </section>
      )}
    </div>
  );
}
