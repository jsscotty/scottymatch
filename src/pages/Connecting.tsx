import { useEffect } from 'react';
import { Heart } from 'lucide-react';
import { startLogin } from '../lib/auth';
import { startConnect, useConnectState } from '../lib/connect';
import { formatCount } from '../lib/format';
import { navigate } from '../lib/router';
import { Link, Panel, Problem, ProgressBar, Spinner } from '../components/ui';

export default function Connecting() {
  const state = useConnectState();

  useEffect(() => {
    startConnect(window.location.search);
  }, []);

  useEffect(() => {
    if (state.phase === 'done') navigate(state.to, { replace: true });
  }, [state]);

  if (state.phase === 'error') {
    const { problem } = state;
    return (
      <Problem title={problem.title} message={problem.message}>
        {problem.retry && (
          <button type="button" className="btn-primary" onClick={() => void startLogin(problem.retry!)}>
            <Heart className="h-4 w-4" />
            Try again
          </button>
        )}
        {problem.goTo ? (
          <Link href={problem.goTo.path} className="btn-secondary">
            {problem.goTo.label}
          </Link>
        ) : (
          <Link href="/" className="btn-secondary">
            Back to start
          </Link>
        )}
      </Problem>
    );
  }

  let title = 'Connecting to Spotify';
  let detail: string | null = null;
  let progress: number | null = null;
  if (state.phase === 'library') {
    title = 'Reading your songs and playlists';
    progress = state.total ? (state.loaded / state.total) * 100 : 2;
    detail = state.total ? `${formatCount(state.loaded)} of ${formatCount(state.total)} songs` : 'Starting…';
  } else if (state.phase === 'playlist') {
    title = 'Making your playlist';
  } else if (state.phase === 'upload') {
    title = state.intent.kind === 'join' ? 'Comparing your libraries' : state.intent.kind === 'refresh' ? 'Updating your link' : 'Making your link';
    progress = 100;
  } else if (state.phase === 'done') {
    title = 'Almost there';
    progress = 100;
  }

  return (
    <Panel className="fade-up mx-auto mt-10 max-w-md text-center">
      <Spinner className="mx-auto h-8 w-8 text-mint" />
      <h1 className="mt-5 font-display text-2xl font-bold">{title}</h1>
      {progress !== null && (
        <div className="mt-6">
          <ProgressBar value={progress} />
        </div>
      )}
      {detail && <p className="mt-3 text-sm tabular-nums text-white/60">{detail}</p>}
    </Panel>
  );
}
