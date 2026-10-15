import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Heart, History, RefreshCw, Smartphone, Trash2 } from 'lucide-react';
import { ADMIN_NAME } from '../config';
import { startLogin } from '../lib/auth';
import { formatDate, plural, safeCdnUrl } from '../lib/format';
import { navigate } from '../lib/router';
import { deleteShare, forgetOwnedShare, getOwnedShare, getShareSummary, listJoins, ShareApiError, shareUrl, type OwnedShare } from '../lib/shares';
import type { JoinSummary, ShareSummary } from '../lib/types';
import { MatchRing } from '../components/Charts';
import CopyLink from '../components/CopyLink';
import { Avatar, Link, PageLoading, Panel, Problem, Spinner } from '../components/ui';

function useSummary(id: string) {
  const [summary, setSummary] = useState<ShareSummary | null>(null);
  const [error, setError] = useState<ShareApiError | Error | null>(null);
  useEffect(() => {
    let alive = true;
    getShareSummary(id).then(
      (s) => alive && setSummary(s),
      (e: Error) => alive && setError(e),
    );
    return () => {
      alive = false;
    };
  }, [id]);
  return { summary, error };
}

function OwnerView({ id, owned, summary }: { id: string; owned: OwnedShare; summary: ShareSummary }) {
  const [joins, setJoins] = useState<JoinSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [starting, setStarting] = useState<'friend' | 'refresh' | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setJoins(await listJoins(id, owned.ownerKey));
    } catch {
      setJoins((current) => current ?? []);
    } finally {
      setLoading(false);
    }
  }, [id, owned.ownerKey]);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 20_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const remove = async () => {
    if (!window.confirm('Delete this link? Anyone who has it will see a dead link, and the comparisons go away too.')) return;
    setDeleting(true);
    try {
      await deleteShare(id, owned.ownerKey);
    } catch (error) {
      if (!(error instanceof ShareApiError && error.status === 404)) {
        setDeleting(false);
        window.alert('Couldn’t delete the link. Try again.');
        return;
      }
    }
    forgetOwnedShare(id);
    navigate('/', { replace: true });
  };

  return (
    <div className="fade-up mx-auto max-w-2xl space-y-6">
      <Panel>
        <div className="flex items-center gap-4">
          <Avatar src={summary.user.image} name={summary.user.name} size={56} ring="ring-2 ring-mint" />
          <div>
            <p className="eyebrow">Your link is ready</p>
            <h1 className="mt-1 font-display text-2xl font-bold md:text-3xl">Send it to a friend</h1>
          </div>
        </div>
        <p className="mt-4 text-white/70">
          When they open it and connect their Spotify, you'll both see what you share. Your {plural(summary.trackCount, 'song')} are saved with the link.
        </p>
        <div className="mt-6">
          <CopyLink url={shareUrl(id)} shareText={`Compare our Spotify songs. ${summary.user.name} sent you this.`} />
        </div>
        <p className="mt-4 text-sm text-white/45">Your friend's account has to be on this app's Spotify approved list. If they get blocked, they should ask {ADMIN_NAME}.</p>
      </Panel>

      <Panel>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Compared with you</h2>
          <button type="button" onClick={() => void refresh()} className="btn-ghost" disabled={loading} aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {joins === null ? (
          <div className="py-6 text-center text-white/50">
            <Spinner className="mx-auto h-5 w-5" />
          </div>
        ) : joins.length === 0 ? (
          <p className="mt-3 text-white/55">Nobody yet. Once a friend connects, they show up here, ranked by how well your taste matches.</p>
        ) : (
          <ol className="mt-4 space-y-2">
            {joins.map((join, index) => (
              <li key={join.joinId}>
                <Link href={`/c/${id}/${join.joinId}`} className="flex items-center gap-3 rounded-2xl border border-line px-3 py-3 transition hover:border-mint/40 hover:bg-white/[0.03] sm:px-4">
                  <span className="hidden w-5 shrink-0 text-center font-display text-sm font-semibold text-white/40 sm:block">{index + 1}</span>
                  <Avatar src={join.user.image} name={join.user.name} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{join.user.name}</span>
                    <span className="block text-sm leading-snug text-white/50">
                      {join.stats ? `${plural(join.stats.sharedTracks, 'shared song')} · ${plural(join.stats.sharedArtists, 'artist')}` : plural(join.trackCount, 'song')}
                    </span>
                    {join.stats?.topArtists.length ? <span className="mt-0.5 line-clamp-1 text-xs text-white/40">{join.stats.topArtists.join(', ')}</span> : <span className="block text-xs text-white/40">{formatDate(join.createdAt)}</span>}
                  </span>
                  {join.stats ? <MatchRing value={join.stats.tasteMatch} size={48} stroke={5} /> : null}
                  <ArrowRight className="hidden h-5 w-5 shrink-0 text-white/40 sm:block" />
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel>
        <div className="flex items-start gap-4">
          <Smartphone className="mt-1 h-5 w-5 shrink-0 text-violet" />
          <div>
            <h2 className="font-display text-lg font-semibold">Friend sitting next to you?</h2>
            <p className="mt-1 text-white/60">
              They can connect on this device. On Spotify's screen, tap <span className="font-medium text-white">Not you?</span> so they log in with their own account.
            </p>
            <button
              type="button"
              className="btn-secondary mt-4"
              disabled={!!starting}
              onClick={() => {
                setStarting('friend');
                void startLogin({ kind: 'join', shareId: id });
              }}
            >
              {starting === 'friend' ? <Spinner className="h-4 w-4" /> : <Heart className="h-4 w-4" />}
              Connect a friend here
            </button>
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="flex items-start gap-4">
          <History className="mt-1 h-5 w-5 shrink-0 text-mint" />
          <div>
            <h2 className="font-display text-lg font-semibold">Added new songs?</h2>
            <p className="mt-1 text-white/60">
              Results are a snapshot from when each of you connected. Your songs are from {formatDate(summary.updatedAt ?? summary.createdAt)}. Update them and every friend's results update too. Friends can open your link again to update theirs.
            </p>
            <button
              type="button"
              className="btn-secondary mt-4"
              disabled={!!starting}
              onClick={() => {
                setStarting('refresh');
                void startLogin({ kind: 'refresh', shareId: id });
              }}
            >
              {starting === 'refresh' ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
              Update my songs
            </button>
          </div>
        </div>
      </Panel>

      <div className="flex justify-center">
        <button type="button" onClick={() => void remove()} disabled={deleting} className="btn-ghost text-sm text-white/45 hover:text-red-300">
          {deleting ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
          Delete this link
        </button>
      </div>
    </div>
  );
}

function VisitorView({ id, summary }: { id: string; summary: ShareSummary }) {
  const [starting, setStarting] = useState(false);
  const first = summary.user.name.split(' ')[0];
  return (
    <Panel className="fade-up mx-auto mt-4 max-w-lg text-center">
      <Avatar src={summary.user.image} name={summary.user.name} size={88} ring="ring-4 ring-mint/70" />
      <h1 className="mt-5 font-display text-3xl font-bold leading-tight">{summary.user.name} wants to compare Spotify songs with you</h1>
      <p className="mt-3 text-white/65">
        {first} has {plural(summary.trackCount, 'song')} in Liked Songs and playlists. Connect your Spotify to see which ones you both have.
      </p>
      {summary.topArtists && summary.topArtists.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">{first} listens to</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {summary.topArtists.map((artist) => (
              <span key={artist.name} className="flex items-center gap-2 rounded-full bg-white/[0.06] py-1 pl-1 pr-3 text-sm">
                {safeCdnUrl(artist.image) ? <img src={safeCdnUrl(artist.image)!} alt="" className="h-6 w-6 rounded-full object-cover" /> : <span className="h-6 w-6 rounded-full bg-white/10" />}
                {artist.name}
              </span>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        className="btn-primary mt-7 w-full py-4 text-base sm:w-auto sm:px-10"
        disabled={starting}
        onClick={() => {
          setStarting(true);
          void startLogin({ kind: 'join', shareId: id });
        }}
      >
        {starting ? <Spinner /> : <Heart className="h-5 w-5" />}
        Connect Spotify and compare
      </button>
      <p className="mt-5 text-sm text-white/45">
        Your song list gets saved with this link so you and {first} can both see the results. Spotify only lets approved accounts in right now. If yours gets blocked, ask {ADMIN_NAME} to add you.
      </p>
    </Panel>
  );
}

export default function SharePage({ id }: { id: string }) {
  const { summary, error } = useSummary(id);
  const owned = getOwnedShare(id);

  if (error) {
    if (error instanceof ShareApiError && error.status === 404) {
      if (owned) forgetOwnedShare(id);
      return (
        <Problem title="This link doesn’t work anymore" message="The person who made it probably deleted it. Ask them for a new one, or make your own.">
          <Link href="/" className="btn-primary">
            Make your own link
          </Link>
        </Problem>
      );
    }
    return (
      <Problem title="Couldn’t load this link" message={error.message}>
        <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
          Try again
        </button>
      </Problem>
    );
  }
  if (!summary) return <PageLoading label="Loading link…" />;
  return owned ? <OwnerView id={id} owned={owned} summary={summary} /> : <VisitorView id={id} summary={summary} />;
}
